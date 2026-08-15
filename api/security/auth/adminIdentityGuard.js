import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import speakeasy from 'speakeasy';
import { logAudit, getClientIP } from '../core/auditLogger.js';
import { readEncryptedFile, writeEncryptedFile } from '../privacy/fileVault.js';

// ============================================================
// Admin Identity Guard — 管理员身份与权限守卫模块
// 职责：
//   1. 敏感操作二次验证（Fresh MFA）的签发、校验、持久化
//   2. 记录管理员敏感操作意图与结果
//   3. 提供统一的权限/验证失败响应
// ============================================================

const FRESH_MFA_TTL_MS = Number(process.env.ADMIN_FRESH_MFA_TTL_MS || 5 * 60 * 1000); // 默认 5 分钟
const FRESH_MFA_FILE = path.resolve(process.env.ADMIN_FRESH_MFA_FILE || 'data/admin-fresh-mfa.json');

// 内存缓存 + 脏标记
let freshMfaCache = new Map();
let freshMfaDirty = false;
let freshMfaLoaded = false;

async function loadFreshMfaCache() {
  if (freshMfaLoaded) return;
  try {
    const raw = await readEncryptedFile(FRESH_MFA_FILE, { context: 'admin-fresh-mfa' });
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const now = Date.now();
        for (const [userId, record] of parsed) {
          if (record && now - record.verifiedAt < FRESH_MFA_TTL_MS) {
            freshMfaCache.set(userId, record);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[AdminIdentityGuard] 加载 Fresh MFA 缓存失败:', err.message);
  }
  freshMfaLoaded = true;
}

async function saveFreshMfaCache() {
  if (!freshMfaDirty) return;
  try {
    // 清理过期项
    const now = Date.now();
    for (const [userId, record] of freshMfaCache) {
      if (now - record.verifiedAt >= FRESH_MFA_TTL_MS) {
        freshMfaCache.delete(userId);
      }
    }
    const data = Array.from(freshMfaCache.entries());
    await writeEncryptedFile(FRESH_MFA_FILE, JSON.stringify(data), { context: 'admin-fresh-mfa' });
    freshMfaDirty = false;
  } catch (err) {
    console.warn('[AdminIdentityGuard] 保存 Fresh MFA 缓存失败:', err.message);
  }
}

// 定时持久化
setInterval(() => saveFreshMfaCache(), 30000);

function normalizeUsersDB(usersDB) {
  if (usersDB instanceof Map) return usersDB;
  if (usersDB && typeof usersDB === 'object') {
    // 兼容普通对象
    return new Map(Object.entries(usersDB));
  }
  return new Map();
}

export function createAdminIdentityGuard({ usersDB, adminTOTPSecrets }) {
  const _usersDB = normalizeUsersDB(usersDB);

  async function ensureLoaded() {
    if (!freshMfaLoaded) await loadFreshMfaCache();
  }

  function isAdmin(userId) {
    const user = _usersDB.get(userId);
    return user && user.role === 'admin';
  }

  function getAdminUser(userId) {
    return _usersDB.get(userId);
  }

  /**
   * 验证 Fresh MFA（可独立调用，也可在中间件中调用）
   */
  async function verifyFreshMfa(userId, totpCode, req) {
    await ensureLoaded();

    if (!isAdmin(userId)) {
      return { success: false, code: 'NOT_ADMIN', message: '需要管理员权限' };
    }

    const user = getAdminUser(userId);
    if (!user.adminTotpEnabled) {
      return { success: false, code: 'MFA_NOT_ENABLED', message: '请先开启管理员二次验证' };
    }

    const totpSecret = adminTOTPSecrets?.get?.(userId);
    if (!totpCode || !totpSecret || !totpSecret.verified) {
      logAudit({ userId, action: 'admin_fresh_mfa_required', ip: getClientIP(req), details: '敏感操作缺少二次验证', success: false });
      return { success: false, code: 'FRESH_MFA_REQUIRED', message: '请先输入二次验证码以继续' };
    }

    const isValid = speakeasy.totp.verify({
      secret: totpSecret.secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      logAudit({ userId, action: 'admin_fresh_mfa_failed', ip: getClientIP(req), details: '敏感操作二次验证失败', success: false });
      return { success: false, code: 'FRESH_MFA_INVALID', message: '二次验证码错误' };
    }

    freshMfaCache.set(userId, { verifiedAt: Date.now(), ip: getClientIP(req) });
    freshMfaDirty = true;
    await saveFreshMfaCache();

    logAudit({ userId, action: 'admin_fresh_mfa_verified', ip: getClientIP(req), details: '敏感操作二次验证通过', success: true });
    return { success: true, message: '二次验证通过', expiresIn: FRESH_MFA_TTL_MS };
  }

  /**
   * 检查用户是否已通过 Fresh MFA
   */
  async function checkFreshMfa(userId) {
    await ensureLoaded();
    const cached = freshMfaCache.get(userId);
    if (cached && Date.now() - cached.verifiedAt < FRESH_MFA_TTL_MS) {
      return { valid: true, remainingMs: FRESH_MFA_TTL_MS - (Date.now() - cached.verifiedAt) };
    }
    return { valid: false };
  }

  /**
   * 清除用户的 Fresh MFA 状态（如登出、撤销设备、解除隔离后）
   */
  async function clearFreshMfa(userId) {
    await ensureLoaded();
    if (freshMfaCache.has(userId)) {
      freshMfaCache.delete(userId);
      freshMfaDirty = true;
      await saveFreshMfaCache();
    }
  }

  /**
   * Express 中间件：要求敏感操作前已完成 Fresh MFA
   * 用法：app.post('/api/admin/sensitive', requireAdmin, requireFreshMfa, handler)
   */
  function requireFreshMfa(req, res, next) {
    const userId = req.tokenPayload?.userId;
    if (!isAdmin(userId)) {
      return res.status(403).json({ success: false, message: '需要管理员权限' });
    }

    const user = getAdminUser(userId);
    if (!user.adminTotpEnabled) {
      return res.status(403).json({ success: false, message: '请先开启管理员二次验证' });
    }

    const cached = freshMfaCache.get(userId);
    if (cached && Date.now() - cached.verifiedAt < FRESH_MFA_TTL_MS) {
      return next();
    }

    const { totpCode } = req.body || {};
    const totpSecret = adminTOTPSecrets?.get?.(userId);
    if (!totpCode || !totpSecret || !totpSecret.verified) {
      logAudit({ userId, action: 'admin_fresh_mfa_required', ip: getClientIP(req), details: `访问 ${req.path} 缺少二次验证`, success: false });
      return res.status(403).json({ success: false, code: 'FRESH_MFA_REQUIRED', message: '请先输入二次验证码以继续' });
    }

    const isValid = speakeasy.totp.verify({
      secret: totpSecret.secret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });

    if (!isValid) {
      logAudit({ userId, action: 'admin_fresh_mfa_failed', ip: getClientIP(req), details: `访问 ${req.path} 二次验证失败`, success: false });
      return res.status(403).json({ success: false, message: '二次验证码错误' });
    }

    freshMfaCache.set(userId, { verifiedAt: Date.now(), ip: getClientIP(req) });
    freshMfaDirty = true;
    logAudit({ userId, action: 'admin_fresh_mfa_verified', ip: getClientIP(req), details: `访问 ${req.path} 二次验证通过`, success: true });
    next();
  }

  /**
   * 记录敏感操作审计日志
   */
  function auditSensitiveAction(req, action, details, success = true) {
    const userId = req.tokenPayload?.userId;
    logAudit({ userId, action, ip: getClientIP(req), details, success });
  }

  return {
    verifyFreshMfa,
    checkFreshMfa,
    clearFreshMfa,
    requireFreshMfa,
    auditSensitiveAction,
    FRESH_MFA_TTL_MS,
  };
}

// 进程退出前持久化
process.on('SIGINT', saveFreshMfaCache);
process.on('SIGTERM', saveFreshMfaCache);
