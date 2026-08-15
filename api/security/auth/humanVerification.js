import crypto from 'crypto';
import { getClientIP } from '../core/auditLogger.js';

// 智能化人机验证模块
// 与图形验证码并行工作：图形验证码防 OCR/自动识别，行为验证防脚本化高频攻击
// 军工级：任何客户端可伪造的信号都不能单独作为通过依据，仅用于风险评分。

const challengeStore = new Map();
const usedTokens = new Map();

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 挑战令牌有效期 5 分钟
const MIN_CHALLENGE_AGE_MS = 2500; // 从获取挑战到提交至少 2.5 秒（防即时脚本）
const MAX_CHALLENGE_AGE_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

// 同一 IP 失败锁定
const FAILED_ATTEMPTS = new Map();
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_WINDOW_MS = 15 * 60 * 1000;

// 同一 IP 挑战令牌发放速率限制（服务端独立采集，不依赖客户端上报）
const ISSUE_ATTEMPTS = new Map();
const MAX_ISSUES_PER_IP = 20;
const ISSUE_WINDOW_MS = 60 * 1000;

// 风险评分权重
const RISK_WEIGHTS = {
  tooFast: 100, // 操作过快：直接拒绝
  noMouse: 30, // 无鼠标移动
  noKeyboard: 20, // 无键盘事件
  noScroll: 10, // 无滚动
  mismatchFingerprint: 100, // 环境指纹不一致：直接拒绝
  reusedToken: 100, // 令牌复用，直接拒绝
  expiredToken: 100, // 令牌过期，直接拒绝
  missingSignals: 100, // 缺少信号：直接拒绝
  suspiciousScreen: 30, // 异常屏幕尺寸
};

const HIGH_RISK_THRESHOLD = 70;
const MEDIUM_RISK_THRESHOLD = 40;

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function getEnvironmentFingerprint(req) {
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  return crypto.createHash('sha256').update(`${ip}|${ua}|${lang}`).digest('hex').slice(0, 32);
}

function cleanup() {
  const now = Date.now();
  for (const [token, entry] of challengeStore) {
    if (entry.expiresAt < now) challengeStore.delete(token);
  }
  for (const [token, usedAt] of usedTokens) {
    if (usedAt + MAX_CHALLENGE_AGE_MS < now) usedTokens.delete(token);
  }
  for (const [ip, record] of FAILED_ATTEMPTS) {
    if (record.lockedUntil && record.lockedUntil < now) {
      FAILED_ATTEMPTS.delete(ip);
    } else if (!record.lockedUntil && record.lastAttempt + FAILED_WINDOW_MS < now) {
      FAILED_ATTEMPTS.delete(ip);
    }
  }
  for (const [ip, record] of ISSUE_ATTEMPTS) {
    if (record.lastIssue + ISSUE_WINDOW_MS < now) ISSUE_ATTEMPTS.delete(ip);
  }
}

function recordChallengeIssue(req) {
  const ip = getIpKey(req);
  const now = Date.now();
  const record = ISSUE_ATTEMPTS.get(ip) || { count: 0, lastIssue: 0 };
  record.count += 1;
  record.lastIssue = now;
  ISSUE_ATTEMPTS.set(ip, record);
  return record.count;
}

function isIssueRateLimited(req) {
  const ip = getIpKey(req);
  const record = ISSUE_ATTEMPTS.get(ip);
  if (!record) return false;
  if (record.lastIssue + ISSUE_WINDOW_MS < Date.now()) return false;
  return record.count >= MAX_ISSUES_PER_IP;
}

function getIpKey(req) {
  return getClientIP(req) || 'unknown';
}

function isIpLocked(req) {
  const ip = getIpKey(req);
  const record = FAILED_ATTEMPTS.get(ip);
  if (!record) return false;
  if (record.lockedUntil && record.lockedUntil > Date.now()) return true;
  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    FAILED_ATTEMPTS.delete(ip);
    return false;
  }
  return false;
}

function recordFailedAttempt(req) {
  const ip = getIpKey(req);
  const now = Date.now();
  const record = FAILED_ATTEMPTS.get(ip) || { count: 0, lastAttempt: 0 };
  record.count += 1;
  record.lastAttempt = now;
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    console.warn(`[HUMAN-VERIFY] IP ${ip} 人机验证连续失败 ${record.count} 次，锁定 ${LOCKOUT_DURATION_MS / 60000} 分钟`);
  }
  FAILED_ATTEMPTS.set(ip, record);
}

setInterval(cleanup, CLEANUP_INTERVAL_MS);

export function createHumanChallenge(req) {
  if (isIssueRateLimited(req)) {
    return null;
  }
  const token = generateToken();
  const fingerprint = getEnvironmentFingerprint(req);
  const now = Date.now();

  const issueCount = recordChallengeIssue(req);
  const entry = {
    token,
    fingerprint,
    createdAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
    ip: getIpKey(req),
    issueCount,
  };

  challengeStore.set(token, entry);
  return entry;
}

export function verifyHumanChallenge(req, token, signals = {}) {
  const issues = [];

  if (isIpLocked(req)) {
    return { success: false, score: 100, reason: '人机验证失败次数过多，请稍后再试', block: true };
  }

  if (!token || typeof token !== 'string') {
    recordFailedAttempt(req);
    return { success: false, score: 100, reason: '缺少人机验证令牌', block: true };
  }

  const entry = challengeStore.get(token);
  if (!entry) {
    recordFailedAttempt(req);
    return { success: false, score: 100, reason: '人机验证令牌无效', block: true };
  }

  if (entry.expiresAt < Date.now()) {
    challengeStore.delete(token);
    recordFailedAttempt(req);
    return { success: false, score: 100, reason: '人机验证令牌已过期', block: true };
  }

  if (usedTokens.has(token)) {
    recordFailedAttempt(req);
    return { success: false, score: 100, reason: '人机验证令牌已被使用', block: true };
  }

  const expectedFingerprint = getEnvironmentFingerprint(req);
  if (entry.fingerprint !== expectedFingerprint) {
    recordFailedAttempt(req);
    return { success: false, score: 100, reason: '人机验证环境指纹不匹配', block: true };
  }

  const age = Date.now() - entry.createdAt;
  if (age < MIN_CHALLENGE_AGE_MS) {
    recordFailedAttempt(req);
    return { success: false, score: 100, reason: '人机验证提交过快，疑似自动化攻击', block: true };
  }
  if (age > MAX_CHALLENGE_AGE_MS) {
    challengeStore.delete(token);
    recordFailedAttempt(req);
    return { success: false, score: 100, reason: '人机验证令牌已过期', block: true };
  }

  // 客户端行为信号完全不可信，仅作为审计日志记录，不参与通过/失败决策。
  // 通过/失败仅取决于服务端 challenge token 的有效性（随机、一次性、IP/UA/指纹绑定、时间窗口）。
  const signalAudit = !signals || typeof signals !== 'object' || Array.isArray(signals)
    ? { missing: true }
    : {
        timeOnPage: signals.timeOnPage,
        mouseMoveCount: signals.mouseMoveCount,
        keyPressCount: signals.keyPressCount,
        scrollCount: signals.scrollCount,
        screenWidth: signals.screenWidth,
        screenHeight: signals.screenHeight,
      };

  // 令牌验证通过即视为成功；所有客户端信号不再影响结果
  usedTokens.set(token, Date.now());
  challengeStore.delete(token);

  return {
    success: true,
    score: 0,
    requireExtra: false,
    issues: [],
    audit: { signalAudit, age },
  };
}

export function humanVerificationMiddleware(options = {}) {
  const {
    required = true,
    tokenField = 'humanToken',
    signalsField = 'humanSignals',
  } = options;

  return (req, res, next) => {
    if (!required) return next();

    const token = req.body?.[tokenField];
    const signals = req.body?.[signalsField] || {};

    const result = verifyHumanChallenge(req, token, signals);
    if (!result.success) {
      return res.status(403).json({
        success: false,
        message: result.reason || '人机验证失败',
        code: 'HUMAN_VERIFICATION_FAILED',
        score: result.score,
      });
    }

    req.humanVerification = result;
    next();
  };
}

export function getHumanVerificationStats() {
  return {
    activeChallenges: challengeStore.size,
    usedTokens: usedTokens.size,
  };
}
