import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { safeRedisOp, isRedisReady } from '../../lib/redisClient.js';
import { readEncryptedFile, writeEncryptedFile } from '../privacy/fileVault.js';
import {
  hashFingerprint as privacyHashFingerprint,
  protectDeviceRecord,
  protectLoginRecord,
  maskDeviceRecord,
  maskLoginRecord,
  maskIp,
} from '../privacy/adminPrivacyVault.js';

// 管理员信任度模块：自适应认证 + 设备信任 + 风险评分
// 目标：常用设备登录快速顺畅，可疑环境自动加码；Redis 不可用时持久化到加密文件

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000; // 待验证会话 10 分钟
const TRUSTED_DEVICE_TTL_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_HISTORY_LIMIT = 100; // 每个管理员最多保留最近 100 条登录记录
const FILE_SAVE_INTERVAL_MS = 30 * 1000;

const LEVELS = {
  TRUSTED: 'trusted',     // 高信任：只需密码 + TOTP
  MEDIUM: 'medium',       // 中信任：密码 + TOTP + 额外挑战
  HIGH_RISK: 'high_risk', // 高风险：密码 + TOTP + 多重挑战 + 告警
  BLOCKED: 'blocked',     // 直接拒绝
};

// 内存兜底（Redis 不可用时使用）
const pendingSessions = new Map();
const trustedDevices = new Map();
const loginHistory = new Map();
const failedAttempts = new Map();

function getRedisSessionKey(sessionId) {
  return `admin:trust:session:${sessionId}`;
}

function getRedisDeviceKey(userId) {
  return `admin:trust:devices:${userId}`;
}

function getRedisFailedKey(ip) {
  return `admin:trust:failed:${ip}`;
}

function hashFingerprint(fingerprint) {
  if (!fingerprint) return '';
  // 使用隐私 vault 中的强哈希（完整 SHA-256），避免截断导致碰撞风险
  return privacyHashFingerprint(fingerprint);
}

function parseUserAgent(ua) {
  if (!ua) return { browser: '未知浏览器', os: '未知系统', device: '未知设备' };
  let browser = '未知浏览器';
  let os = '未知系统';
  let device = '桌面端';

  if (/Edg\/|Edge\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\/|CriOS\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\/|FxiOS\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Opera\/|OPR\//i.test(ua)) browser = 'Opera';

  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|macOS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';

  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) device = '移动端';
  else if (/Tablet/i.test(ua)) device = '平板';

  return { browser, os, device };
}

function isPrivateIP(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isDatacenterIP(ip) {
  const ranges = [
    '13.104.', '13.106.', '13.107.', '34.64.', '34.96.', '35.184.', '35.188.', '35.236.',
    '3.0.', '3.1.', '3.2.', '3.3.', '3.4.', '3.5.', '52.0.', '52.1.', '52.2.', '52.3.', '52.4.', '52.5.',
    '18.0.', '18.1.', '18.2.', '18.3.', '47.88.', '47.89.', '47.90.', '47.91.',
    '123.56.', '123.57.', '123.58.',
  ];
  return ranges.some(r => ip.startsWith(r));
}

export class AdminTrust {
  constructor({ adminIpWhitelist = [], dataDir = 'data' } = {}) {
    this.adminIpWhitelist = adminIpWhitelist;
    this.dataDir = dataDir;
    this.devicesFile = path.resolve(dataDir, 'admin-trust-devices.json');
    this.historyFile = path.resolve(dataDir, 'admin-login-history.json');
    this._loaded = false;
    this._dirty = { devices: false, history: false };
    this._startCleanupTimer();
    this._startFileSaveTimer();
    // 进程退出前强制持久化
    process.on('SIGINT', () => this._forceSave());
    process.on('SIGTERM', () => this._forceSave());
  }

  async load() {
    if (this._loaded) return;
    await fs.mkdir(this.dataDir, { recursive: true });

    if (!isRedisReady()) {
      try {
        const devicesRaw = await readEncryptedFile(this.devicesFile, { context: 'admin-trust-devices' });
        if (devicesRaw) {
          const parsed = JSON.parse(devicesRaw);
          if (Array.isArray(parsed)) {
            for (const [userId, devices] of parsed) {
              if (Array.isArray(devices)) trustedDevices.set(userId, devices);
            }
          }
        }
      } catch (err) {
        console.warn('[AdminTrust] 加载可信设备失败:', err.message);
      }

      try {
        const historyRaw = await readEncryptedFile(this.historyFile, { context: 'admin-login-history' });
        if (historyRaw) {
          const parsed = JSON.parse(historyRaw);
          if (Array.isArray(parsed)) {
            for (const [userId, records] of parsed) {
              if (Array.isArray(records)) loginHistory.set(userId, records);
            }
          }
        }
      } catch (err) {
        console.warn('[AdminTrust] 加载登录历史失败:', err.message);
      }
    }

    this._loaded = true;
  }

  async _saveToFile(type) {
    if (isRedisReady()) return;
    if (type === 'devices') {
      const data = Array.from(trustedDevices.entries());
      await writeEncryptedFile(this.devicesFile, JSON.stringify(data), { context: 'admin-trust-devices' });
      this._dirty.devices = false;
    } else if (type === 'history') {
      const data = Array.from(loginHistory.entries());
      await writeEncryptedFile(this.historyFile, JSON.stringify(data), { context: 'admin-login-history' });
      this._dirty.history = false;
    }
  }

  async _forceSave() {
    if (this._dirty.devices) await this._saveToFile('devices').catch(() => {});
    if (this._dirty.history) await this._saveToFile('history').catch(() => {});
  }

  _startFileSaveTimer() {
    setInterval(async () => {
      await this._forceSave();
    }, FILE_SAVE_INTERVAL_MS).unref?.();
  }

  _startCleanupTimer() {
    setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of failedAttempts.entries()) {
        if (now - record.lastAt > FAILED_WINDOW_MS) failedAttempts.delete(ip);
      }
      for (const [sid, session] of pendingSessions.entries()) {
        if (session.expiresAt <= now) pendingSessions.delete(sid);
      }
    }, 60 * 1000).unref?.();
  }

  // ========== 失败次数记录（防暴力破解） ==========
  async recordFailedAttempt(ip) {
    const now = Date.now();
    const key = getRedisFailedKey(ip);
    if (isRedisReady()) {
      const raw = await safeRedisOp(c => c.get(key), null);
      const data = raw ? JSON.parse(raw) : { count: 0, firstAt: now };
      data.count += 1;
      data.lastAt = now;
      await safeRedisOp(c => c.setEx(key, Math.ceil(FAILED_WINDOW_MS / 1000), JSON.stringify(data)));
      return data.count;
    }
    const record = failedAttempts.get(ip) || { count: 0, firstAt: now };
    record.count += 1;
    record.lastAt = now;
    failedAttempts.set(ip, record);
    return record.count;
  }

  async getFailedAttempts(ip) {
    const key = getRedisFailedKey(ip);
    if (isRedisReady()) {
      const raw = await safeRedisOp(c => c.get(key), null);
      if (!raw) return { count: 0 };
      const data = JSON.parse(raw);
      return data;
    }
    return failedAttempts.get(ip) || { count: 0 };
  }

  async isBlocked(ip) {
    const record = await this.getFailedAttempts(ip);
    return record.count >= MAX_FAILED_ATTEMPTS;
  }

  // ========== 设备信任 ==========
  async getTrustedDevices(userId) {
    await this.load();
    const key = getRedisDeviceKey(userId);
    if (isRedisReady()) {
      const raw = await safeRedisOp(c => c.get(key), null);
      return raw ? JSON.parse(raw) : [];
    }
    return trustedDevices.get(userId) || [];
  }

  async _saveTrustedDevices(userId, devices) {
    await this.load();
    const key = getRedisDeviceKey(userId);
    if (isRedisReady()) {
      await safeRedisOp(c => c.setEx(key, TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60, JSON.stringify(devices)));
      return;
    }
    trustedDevices.set(userId, devices);
    this._dirty.devices = true;
    await this._saveToFile('devices');
  }

  async registerTrustedDevice(userId, fingerprint, meta = {}) {
    const fpHash = hashFingerprint(fingerprint);
    if (!fpHash) return;
    const devices = await this.getTrustedDevices(userId);
    const deviceInfo = parseUserAgent(meta.userAgent || '');
    const now = Date.now();
    const existingIndex = devices.findIndex(d => d.fpHash === fpHash);
    const name = meta.name || `${deviceInfo.browser} · ${deviceInfo.os} · ${deviceInfo.device}`;
    const rawRecord = {
      fpHash,
      name,
      ip: meta.ip,
      userAgent: meta.userAgent,
      createdAt: existingIndex >= 0 ? devices[existingIndex].createdAt : now,
      lastSeenAt: now,
      trusted: true,
    };
    const record = protectDeviceRecord(rawRecord);
    if (existingIndex >= 0) devices[existingIndex] = record;
    else devices.unshift(record);
    // 最多保留 10 个设备
    await this._saveTrustedDevices(userId, devices.slice(0, 10));
  }

  async revokeTrustedDevice(userId, fpHash) {
    const devices = await this.getTrustedDevices(userId);
    const filtered = devices.filter(d => d.fpHash !== fpHash);
    await this._saveTrustedDevices(userId, filtered);
    return filtered.length !== devices.length;
  }

  async isTrustedDevice(userId, fingerprint) {
    const fpHash = hashFingerprint(fingerprint);
    if (!fpHash) return false;
    const devices = await this.getTrustedDevices(userId);
    const device = devices.find(d => d.fpHash === fpHash);
    return !!device && device.trusted;
  }

  // ========== 风险评分 ==========
  async evaluateRisk({ userId, ip, fingerprint, userAgent, timestamp = Date.now(), adminIpWhitelist = [] }) {
    const scoreFactors = [];
    let score = 0;

    // 1. IP 白名单（最强信任信号）
    if (adminIpWhitelist.length > 0) {
      if (adminIpWhitelist.includes(ip)) {
        scoreFactors.push({ factor: 'ip_whitelist', score: -30, desc: 'IP 在白名单内' });
        score -= 30;
      } else {
        scoreFactors.push({ factor: 'ip_not_whitelist', score: 35, desc: 'IP 不在白名单内' });
        score += 35;
      }
    }

    // 2. 私有/本地网络（通常不可信，除非明确配置）
    if (isPrivateIP(ip)) {
      scoreFactors.push({ factor: 'private_ip', score: -10, desc: '来自私有网络' });
      score -= 10;
    }

    // 3. 数据中心/代理 IP
    if (isDatacenterIP(ip)) {
      scoreFactors.push({ factor: 'datacenter_ip', score: 30, desc: '检测到数据中心/代理 IP' });
      score += 30;
    }

    // 4. 设备信任度
    const trusted = await this.isTrustedDevice(userId, fingerprint);
    if (trusted) {
      scoreFactors.push({ factor: 'trusted_device', score: -40, desc: '已信任设备' });
      score -= 40;
    } else if (fingerprint) {
      scoreFactors.push({ factor: 'new_device', score: 25, desc: '新设备' });
      score += 25;
    }

    // 5. 登录时段（凌晨 1-5 点加分险）
    const hour = new Date(timestamp).getHours();
    if (hour >= 1 && hour <= 5) {
      scoreFactors.push({ factor: 'odd_hours', score: 15, desc: '凌晨时段登录' });
      score += 15;
    }

    // 6. 近期失败次数
    const failed = await this.getFailedAttempts(ip);
    if (failed.count > 0) {
      const penalty = Math.min(30, failed.count * 6);
      scoreFactors.push({ factor: 'recent_failures', score: penalty, desc: `近期失败 ${failed.count} 次` });
      score += penalty;
    }

    // 7. User-Agent 异常（缺失 UA 视为高风险）
    if (!userAgent) {
      scoreFactors.push({ factor: 'missing_ua', score: 20, desc: '缺少 User-Agent' });
      score += 20;
    }

    // 分数范围 0-100，兜底
    score = Math.max(0, Math.min(100, score));

    let level = LEVELS.TRUSTED;
    if (score >= 80) level = LEVELS.BLOCKED;
    else if (score >= 50) level = LEVELS.HIGH_RISK;
    else if (score >= 25) level = LEVELS.MEDIUM;

    return { score, level, factors: scoreFactors };
  }

  // ========== 挑战决策 ==========
  decideChallenges({ level, adminTotpEnabled, userHasEmail }) {
    const steps = [];

    if (level === LEVELS.BLOCKED) {
      return { steps, blocked: true };
    }

    // 管理员必须 TOTP（如果已开启）
    if (adminTotpEnabled) {
      steps.push({
        type: 'totp',
        label: 'TOTP 动态口令',
        desc: '请输入 authenticator 应用中的 6 位验证码',
        required: true,
      });
    }

    // 所有非阻断级别至少增加图形验证码，防止自动化攻击
    if (level !== LEVELS.BLOCKED) {
      steps.push({
        type: 'captcha',
        label: '图形验证码',
        desc: '请完成下方验证码，以确认不是自动化攻击',
        required: true,
      });
    }

    // 高风险：额外增加邮件确认（如果系统有邮箱）
    if (level === LEVELS.HIGH_RISK) {
      if (userHasEmail) {
        steps.push({
          type: 'emailCode',
          label: '邮箱确认码',
          desc: '我们已向您的邮箱发送确认码，请输入以继续',
          required: true,
        });
      }
    }

    return { steps, blocked: false };
  }

  // ========== 待验证会话 ==========
  async createPendingSession({ userId, email, ip, fingerprint, userAgent, riskResult, steps }) {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const session = {
      id: sessionId,
      userId,
      email,
      ip,
      fingerprint: hashFingerprint(fingerprint),
      userAgent,
      riskScore: riskResult.score,
      riskLevel: riskResult.level,
      riskFactors: riskResult.factors,
      steps,
      completedSteps: [],
      createdAt: now,
      expiresAt: now + DEFAULT_SESSION_TTL_MS,
    };

    if (isRedisReady()) {
      await safeRedisOp(c =>
        c.setEx(getRedisSessionKey(sessionId), Math.ceil(DEFAULT_SESSION_TTL_MS / 1000), JSON.stringify(session))
      );
    } else {
      pendingSessions.set(sessionId, session);
    }
    return session;
  }

  async getPendingSession(sessionId) {
    if (!sessionId) return null;
    if (isRedisReady()) {
      const raw = await safeRedisOp(c => c.get(getRedisSessionKey(sessionId)), null);
      if (!raw) return null;
      return JSON.parse(raw);
    }
    return pendingSessions.get(sessionId) || null;
  }

  async deletePendingSession(sessionId) {
    if (isRedisReady()) {
      await safeRedisOp(c => c.del(getRedisSessionKey(sessionId)));
    } else {
      pendingSessions.delete(sessionId);
    }
  }

  markStepCompleted(session, stepType) {
    if (!session.completedSteps.includes(stepType)) {
      session.completedSteps.push(stepType);
    }
  }

  hasCompleted(session, stepType) {
    return session.completedSteps.includes(stepType);
  }

  allStepsCompleted(session) {
    return session.steps.every(s => session.completedSteps.includes(s.type));
  }

  remainingSteps(session) {
    return session.steps.filter(s => !session.completedSteps.includes(s.type));
  }

  // ========== 登录历史 ==========
  async recordLogin(userId, { ip, fingerprint, userAgent, riskScore = 0, riskLevel = 'low', success = true, reason = '' } = {}) {
    await this.load();
    const fpHash = fingerprint ? hashFingerprint(fingerprint) : '';
    const deviceInfo = parseUserAgent(userAgent || '');
    const rawRecord = {
      id: `login-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: Date.now(),
      ip,
      userAgent,
      deviceName: `${deviceInfo.browser} · ${deviceInfo.os} · ${deviceInfo.device}`,
      fpHash,
      riskScore,
      riskLevel,
      success,
      reason,
    };
    const record = protectLoginRecord(rawRecord);

    const key = `admin:login-history:${userId}`;
    if (isRedisReady()) {
      await safeRedisOp(async c => {
        await c.lPush(key, JSON.stringify(record));
        await c.lTrim(key, 0, LOGIN_HISTORY_LIMIT - 1);
        await c.expire(key, TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60);
      });
      return maskLoginRecord(record);
    }

    if (!loginHistory.has(userId)) loginHistory.set(userId, []);
    const list = loginHistory.get(userId);
    list.unshift(record);
    if (list.length > LOGIN_HISTORY_LIMIT) list.pop();
    this._dirty.history = true;
    await this._saveToFile('history');
    return maskLoginRecord(record);
  }

  async getLoginHistory(userId, { limit = 50, offset = 0, masked = true } = {}) {
    await this.load();
    let list = [];
    if (isRedisReady()) {
      const key = `admin:login-history:${userId}`;
      const rawList = await safeRedisOp(c => c.lRange(key, offset, offset + limit - 1), []);
      list = rawList.map(r => JSON.parse(r));
    } else {
      list = loginHistory.get(userId) || [];
    }
    list = list.slice(offset, offset + limit);
    return masked ? list.map(r => maskLoginRecord(r)) : list;
  }

  // ========== 风险事件（基于登录历史中的异常记录） ==========
  async getRiskEvents(userId, { limit = 50 } = {}) {
    await this.load();
    const history = await this.getLoginHistory(userId, { limit: LOGIN_HISTORY_LIMIT, masked: true });
    const events = [];
    for (const record of history) {
      if (!record.success || record.riskLevel === 'high_risk' || record.riskLevel === 'blocked') {
        events.push({
          id: record.id,
          timestamp: record.timestamp,
          type: record.success ? 'high_risk_login' : 'failed_login',
          level: record.success ? record.riskLevel : 'medium',
          ip: maskIp(record.ip),
          deviceName: record.deviceName,
          message: record.success
            ? `高风险环境登录（评分 ${record.riskScore}）`
            : `登录失败：${record.reason || '未知原因'}`,
        });
      }
    }
    return events.slice(0, limit);
  }

  // ========== 工具方法 ==========
  async getDeviceList(userId) {
    const devices = await this.getTrustedDevices(userId);
    return devices.map(d => maskDeviceRecord(d));
  }
}

export default AdminTrust;
