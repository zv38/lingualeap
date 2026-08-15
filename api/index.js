import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import speakeasy from 'speakeasy';
import { createRateLimiter } from './security/core/rateLimiter.js';
import svgCaptcha from 'svg-captcha';
import multer from 'multer';
import fs from 'fs';
import https from 'https';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { installGlobalConsole, logger } from './security/core/logger.js';
import { printBanner } from './security/core/startupBanner.js';
import {
  // core: 审计、限流、请求追踪、CSRF/Blocklist 守卫
  securityMiddleware,
  generateCsrfToken,
  csrfTokenLimiter,
  logAudit,
  getAuditLog,
  getAuditLogStats,
  getClientIP,
  requestTracker,
  // defense: WAF、主动/自适应防御、Prompt 守卫、蜜罐
  tcpWafMiddleware,
  connectionTracker,
  honeypotRouter,
  PromptGuard,
  ipReputation,
  dynamicHoneypot,
  adaptiveDefense,
  // account: 账号风险、申诉、政策管理（V3 强化版）
  evaluateRegistrationRisk,
  createUserRiskProfile,
  getRiskProfile,
  updateRiskStatus,
  accountStatusMiddleware,
  requireNormalAccount,
  requirePoWChallenge,
  ACCOUNT_STATUS,
  BAN_TYPE,
  generateRiskChallenge,
  verifyRiskChallenge,
  addMeritPoints,
  recordRiskEvent,
  getRiskEvents,
  getUnreadRiskEventCount,
  markRiskEventsRead,
  getSecurityOverview,
  executeBan,
  checkTempBanExpiry,
  getAccountStatusForUser,
  getAdaptiveDifficulty,        // V4 自适应难度
  getLoginSecurityWarnings,     // V4 登录安全警告
  invalidateUserSessions,
  getUserLoginSummary,
  updateRiskFromBehavior,
  createBanApproval,
  reviewBanApproval,
  getPendingBanApprovals,
  getAllBanApprovals,
  submitAppeal,
  getAppealsByUser,
  getAllAppeals,
  getAppealById,
  reviewAppeal,
  APPEAL_STATUS,
  getCurrentPolicy,
  recordAcceptance,
  needsAcceptance,
  getUserAcceptance,
  // privacy: 文件守护与文件级加密
  buildBaseline,
  verifyIntegrity,
  readEncryptedFile,
  writeEncryptedFile,
  encrypt,
  decrypt,
  hasEncryptionKey,
  // auth: 管理员二次验证、Turnstile、管理员信任、图形验证码、人机行为验证
  verifyAdminReauth,
  configureAdminReauth,
  requireAdminReauth,
  requireFreshAdminReauth,
  revokeAdminReauthSessions,
  revokeAdminReauthBySession,
  generateNumericCaptcha,
  generateMathCaptcha,
  generateRotateCaptcha,
  generateSequenceCaptcha,
  generateAudioCaptcha,
  verifyImageCaptcha,
  getImageCaptchaStats,
  generateAntiOcrNoise,
  requireTurnstile,
  AdminTrust,
  createHumanChallenge,
  verifyHumanChallenge,
  humanVerificationMiddleware,
  getHumanVerificationStats,
  // webauthn / mtls
  createWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  createWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  getWebAuthnStatus,
  removeWebAuthnCredential,
  verifyAdminClientCertificate,
  requireAdminClientCertificate,
  isMtlsEnabled,
  isMtlsRequiredForAdmin,
  // system: 启动安全校验、运行态自检
  runStartupSecurityChecks,
  runtimeGuardMiddleware,
  getRuntimeSecurityStatus,
  getRuntimeGuardViolations,
  // defense: WAF 规则
  wafRulesMiddleware,
  // defense: 请求重放防护、熔断器、结构化校验
  validateRequest,
  clearExpiredNonces,
  getNonceStats,
  // defense: HMAC 请求签名校验
  signatureMiddleware,
  verifySignature,
  getSignatureStatus,
  createCircuitBreaker,
  recordFailure,
  recordSuccess,
  getCircuitState,
  evaluateThresholdBlock,
  getCircuitBreakerStats,
  validate,
  validateByKey,
  validators,
  registerSchema,
  isTokenRevokedSync,
  loginSchema,
  adminLoginSchema,
  createPostSchema,
  bugReportSchema,
  aiChatSchema,
  // defense: 错误归一化
  AppError,
  errorHandler,
  asyncHandler,
  createErrorFactory,
  // defense: 自动化安全事件响应
  evaluateSecurityEvent,
  getResponseStats,
  configureStrategies,
  resetStats,
  // defense: 资源护盾 (DoS防护)
  bodyGuardMiddleware,
  connGuardMiddleware,
  rateGuardMiddleware,
  timeoutGuardMiddleware,
  bodyParserErrorHandler,
  getResourceShieldStatus,
  getResourceShieldSummary,
  cleanupResourceShield,
  // vault: 密钥轮换调度器
  startKeyRotationScheduler,
  stopKeyRotationScheduler,
} from './security/index.js';
import { initSentry, getRequestHandler as getSentryRequestHandler, getErrorHandler as getSentryErrorHandler } from './lib/sentry.js';
import { decisionEngine } from './ai-decision/decisionEngine.js';
import { BehaviorFingerprint } from './ai-decision/behaviorFingerprint.js';
import { patternDetector, ATTACK_PATTERNS } from './ai-decision/patternDetector.js';
import { thresholdOptimizer } from './ai-decision/thresholdOptimizer.js';
import { aiConfigurator } from './ai-decision/aiConfigurator.js';
import { evaluateRisk, recordLogin, registerTrustedDevice, getTrustedDevices, removeTrustedDevice } from './adminSecurity.js';
import { sendResetCode, isEmailConfigured, getEmailInfo } from './emailService.js';
import { defineFieldSchema, guardResponseFields } from './security/access/fieldLevelGuard.js';
import { DynamicPolicyEngine, dynamicPolicyMiddleware, getDefaultDynamicRules } from './security/access/dynamicPolicyEngine.js';
import { requireABAC, allowOwnOrAdmin } from './security/access/abac.js';
import { OutboundFilter } from './security/network/outboundFilter.js';
import { SECURE_TLS_OPTIONS, TLS_1_3_ONLY_OPTIONS, CertificatePinset } from './security/network/index.js';
import { verifyBuildIntegrity } from './security/supplychain/signatureStore.js';
import { sanitize as sanitizePII, detectPII } from './ai/privacyGuard.js';
import { logChatInteraction, chatRetention } from './ai/chatRetention.js';
import { getIPRisk } from './utils/ipapi.js';
import { createAdminIntegrityGuard } from './security/defense/adminIntegrityGuard.js';
import { createMembershipRouter, checkPrivilege, getMembershipStatus } from './membership/index.js';
import { saveUsers } from './persistence.js';
import { SecureBuffer } from './security/vault/secureMemory.js';
import { incrementCounter, getString } from './lib/sharedState.js';
import { tts as youdao_tts, translate as youdao_translate } from './utils/youdao.js';
// 性能调控器：监控、降级、日志熔断
import {
  registerResource,
  registerResources,
  startGovernor,
  getGovernorStatus,
  getGovernorSummary,
  getGovernorSnapshot,
  forceCleanup,
} from './security/performance/index.js';
import {
  sseMiddleware,
  broadcastVersionUpdate,
  delayedBroadcastVersionUpdate,
  setVersionInfo,
  getVersionInfo,
  getSSEStats,
} from './lib/eventBus.js';
import { createAuthRouter } from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';
import createSecurityRouter from './routes/security.js';
import { createAiRouter } from './routes/ai.js';
import { createContentRouter } from './routes/content.js';
import { createEventsRouter } from './routes/events.js';
import { createBugReportRouter } from './routes/bugReport.js';
import { createSurveyRouter } from './routes/surveys.js';

dotenv.config();

// 军工级：从 SecVault 加载敏感密钥（覆盖 .env 中的占位符）
// 若 .env 中为占位符（如 __REPLACE_...），则从 DPAPI 保护的保险库加载真实密钥
// 注意：loadSecret 优先返回环境变量值，因此需要临时清除占位符才能从保险库加载
try {
  const { loadSecret, loadSecretSigned } = await import('./security/vault/secretVault.js');
  const SENSITIVE_KEYS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'PAYMENT_SECRET', 'ADMIN_PRIVACY_KEY'];
  for (const key of SENSITIVE_KEYS) {
    if (process.env[key] && (process.env[key].startsWith('__REPLACE_') || process.env[key].length < 16)) {
      const saved = process.env[key];
      delete process.env[key];
      const vaultValue = loadSecret(key);
      if (vaultValue) {
        process.env[key] = vaultValue;
        console.log(`[Vault] 已从 DPAPI 保险库加载 ${key}`);
      } else {
        process.env[key] = saved;
      }
    }
  }
  // 带签名验证的密钥：管理员密码哈希、Turnstile 密钥
  // 注意：ADMIN_PASSWORD_HASH 在 vault 中存储为小写名 admin-password-hash
  const SIGNED_KEYS = [
    { envName: 'ADMIN_PASSWORD_HASH', vaultName: 'admin-password-hash' },
    { envName: 'TURNSTILE_SECRET_KEY', vaultName: 'TURNSTILE_SECRET_KEY' },
  ];
  for (const { envName, vaultName } of SIGNED_KEYS) {
    if (process.env[envName] && (process.env[envName].startsWith('__REPLACE_') || process.env[envName].length < 16)) {
      delete process.env[envName];
      // 使用 vault 中的准确名称加载（绕过 env 优先检查）
      const vaultValue = loadSecret(vaultName);
      if (vaultValue) {
        process.env[envName] = vaultValue;
        console.log(`[Vault] 已从 DPAPI 保险库加载 ${envName}`);
      }
    }
  }
} catch (e) {
  console.warn('[Vault] SecVault 密钥预加载失败（开发环境可忽略）:', e.message);
}

// 军工级启动安全校验：任何弱配置、占位符、测试后门在生产环境直接退出
runStartupSecurityChecks();

// 军工级供应链安全：生产环境启动时校验构建产物签名完整性
if (process.env.NODE_ENV === 'production') {
  (async () => {
    try {
      const buildOk = await verifyBuildIntegrity();
      if (!buildOk.ok) {
        console.error('[FATAL-SUPPLY-CHAIN] 构建产物签名校验失败:', buildOk.reason || '未知错误');
        if (buildOk.changed && buildOk.changed.length > 0) {
          console.error('[FATAL-SUPPLY-CHAIN] 变更文件:', buildOk.changed.map(c => c.file).join(', '));
        }
        process.exit(1);
      }
      console.log('[SupplyChain] 构建产物签名校验通过');
    } catch (err) {
      console.warn('[SupplyChain] 构建签名校验未通过或签名不存在:', err.message);
      // 若生产环境强制要求签名，可在此 process.exit(1)
    }
  })();
}

// JWT密钥强度检测（先对原始字符串校验，随后立即转入 SecureBuffer 并从环境变量中清除）
let _jwtSecretRaw = process.env.JWT_SECRET;
let _jwtRefreshSecretRaw = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(48).toString('hex');

if (!_jwtSecretRaw) {
  console.error('[FATAL] JWT_SECRET 环境变量未设置！请设置一个安全的256位随机密钥。');
  process.exit(1);
}
if (_jwtSecretRaw.length < 60) {
  console.error('[FATAL] JWT_SECRET 强度不足！需要至少256位随机数（hex长度≥64）。');
  console.error('  可用以下命令生成: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
if (_jwtRefreshSecretRaw.length < 60) {
  console.error('[FATAL] JWT_REFRESH_SECRET 强度不足！需要至少384位随机数（hex长度≥96）。');
  process.exit(1);
}
// 检测是否使用了已知弱密钥（已泄露的旧密钥）
const LEAKED_KEYS = [
  '117b5c751eec5bda370cbf4071d9961f5ef74214c5d95dd051ff09657e7d7f65',
  'e8a4f2c9d1b6e3f7a0c5d2e8b4f1a6c9d3e7b5f2a0c4d1e8f6b3a7c9d0e2f',
];
if (LEAKED_KEYS.includes(_jwtSecretRaw) || LEAKED_KEYS.includes(_jwtRefreshSecretRaw)) {
  console.error('[FATAL] 检测到已泄露的旧JWT密钥！请立即更换！');
  process.exit(1);
}
if (_jwtSecretRaw === _jwtRefreshSecretRaw) {
  console.warn('[WARN] JWT_SECRET 和 JWT_REFRESH_SECRET 使用了相同的密钥！建议使用不同的密钥。');
}

// 密钥版本号 - 基于JWT_SECRET的SHA256 hash，密钥变更后版本号自动变化
// 所有已签发token携带此版本号，验证时比对，旧密钥token自动失效
const KEY_VERSION = crypto.createHash('sha256').update(_jwtSecretRaw).digest('hex').substring(0, 16);
const REFRESH_KEY_VERSION = crypto.createHash('sha256').update(_jwtRefreshSecretRaw).digest('hex').substring(0, 16);

// 将 JWT 密钥转入 SecureBuffer 内存保护，并从环境变量/原始变量中清除
const jwtSecretRawBuf = Buffer.from(String(_jwtSecretRaw), 'utf8')
const jwtRefreshSecretRawBuf = Buffer.from(String(_jwtRefreshSecretRaw), 'utf8')
const jwtSecretBuf = new SecureBuffer(jwtSecretRawBuf);
const jwtRefreshSecretBuf = new SecureBuffer(jwtRefreshSecretRawBuf);

// 派生 CSRF 签名密钥（与 JWT 密钥隔离），供 guards.js 使用；避免删除 JWT_SECRET 后 CSRF 验签失效
if (!process.env.CSRF_SIGN_SECRET) {
  const csrfDerived = jwtSecretBuf.derive('csrf-sign-secret-v1', 32);
  process.env.CSRF_SIGN_SECRET = csrfDerived.toString('base64');
  csrfDerived.zeroize();
}

_jwtSecretRaw = null;
_jwtRefreshSecretRaw = null;
delete process.env.JWT_SECRET;
delete process.env.JWT_REFRESH_SECRET;
process.env._JWT_SECRET_PROTECTED = '1';

function getJwtSecret() {
  return jwtSecretBuf.toString('utf-8');
}

function getJwtRefreshSecret() {
  return jwtRefreshSecretBuf.toString('utf-8');
}

// 应用退出或异常终止时显式清零内存
function wipeJwtSecrets() {
  try { jwtSecretBuf.zeroize(); } catch {}
  try { jwtRefreshSecretBuf.zeroize(); } catch {}
}
process.on('exit', wipeJwtSecrets);
process.on('SIGINT', () => { wipeJwtSecrets(); process.exit(0); });
process.on('SIGTERM', () => { wipeJwtSecrets(); process.exit(0); });
process.on('uncaughtException', (err) => { wipeJwtSecrets(); console.error(err); process.exit(1); });

console.log(`[JWT] 密钥加载完成 (access=${jwtSecretBuf.length*4}bit, refresh=${jwtRefreshSecretBuf.length*4}bit, kv=${KEY_VERSION})`);

// 管理员账号常量（尽早定义，供 AdminTrust 等模块使用）
const ADMIN_EMAIL = 'admin@lingualeap.com';

// 军工级：管理员密码必须以 bcrypt 哈希形式注入，禁止明文环境变量 ADMIN_PASSWORD
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
if (!ADMIN_PASSWORD_HASH || ADMIN_PASSWORD_HASH.length < 60) {
  console.error('[FATAL] ADMIN_PASSWORD_HASH 未设置或不是有效的 bcrypt 哈希。请通过安全途径配置后重启服务。');
  process.exit(1);
}
// 如误传明文 ADMIN_PASSWORD，拒绝启动
if (process.env.ADMIN_PASSWORD) {
  console.error('[FATAL] 检测到明文 ADMIN_PASSWORD 环境变量。军工级部署禁止使用明文密码，请改用 ADMIN_PASSWORD_HASH。');
  process.exit(1);
}
const ADMIN_IP_WHITELIST = process.env.ADMIN_IP_WHITELIST ? process.env.ADMIN_IP_WHITELIST.split(',').map(s => s.trim()) : [];

// 军工级：创建管理员账号的固定口令（环境变量注入，运维持有）
// 未配置时创建管理员接口将被拒绝，防止未授权创建高权限账号
const ADMIN_CREATE_SECRET = process.env.ADMIN_CREATE_SECRET || '';

// 管理员信任度 / 自适应认证模块
const adminTrust = new AdminTrust({ adminIpWhitelist: ADMIN_IP_WHITELIST, dataDir: 'data' });

const BCRYPT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(userId, sessionId = null, deviceFingerprint = null) {
  const user = usersDB.get(userId);
  const role = user?.role || 'user';
  const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  const payload = { userId, type: 'access', kv: KEY_VERSION, sid: sessionId, role };
  if (deviceFingerprint) {
    payload.deviceFingerprint = deviceFingerprint;
  }
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

function generateRefreshToken(userId, sessionId = null) {
  const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  return jwt.sign({ userId, type: 'refresh', kv: REFRESH_KEY_VERSION, sid: sessionId }, getJwtRefreshSecret(), { expiresIn: refreshExpiresIn });
}

// ===== Cookie 安全规范 =====
// Access Token 与 Refresh Token 通过 HttpOnly Cookie 下发，前端 JavaScript 无法读取，降低 XSS 窃取风险。
// Cookie 仅通过 HTTPS 传输（生产环境），SameSite=Strict 防止 CSRF 携带。
const IS_DEV = process.env.NODE_ENV !== 'production';

// 设备指纹服务端密钥（派生自 JWT 密钥，不独立存储，重启后稳定）
const DEVICE_FINGERPRINT_PEPPER = crypto.createHash('sha256')
  .update(getJwtSecret() + ':device-fingerprint-v1')
  .digest('hex')
  .slice(0, 16);

function getCookieOptions(maxAgeMs, httpOnly = true) {
  return {
    httpOnly,
    secure: !IS_DEV,
    sameSite: 'strict',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function setAccessTokenCookie(res, token) {
  const maxAge = parseInt(process.env.JWT_ACCESS_EXPIRES_IN_MS || '900000', 10); // 默认 15 分钟
  res.cookie('access_token', token, getCookieOptions(maxAge, true));
}

function setRefreshTokenCookie(res, token) {
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 天
  res.cookie('refresh_token', token, getCookieOptions(maxAge, true));
}

function clearAuthCookies(res) {
  res.clearCookie('access_token', { path: '/', httpOnly: true, secure: !IS_DEV, sameSite: 'strict' });
  res.clearCookie('refresh_token', { path: '/', httpOnly: true, secure: !IS_DEV, sameSite: 'strict' });
}

function getTokenFromRequest(req) {
  // 优先从 HttpOnly Cookie 读取，防止前端 XSS 通过 localStorage 泄露；同时保留 Authorization 头作为兼容兜底
  if (req.cookies?.access_token) return req.cookies.access_token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

function getRefreshTokenFromRequest(req) {
  if (req.cookies?.refresh_token) return req.cookies.refresh_token;
  if (req.body?.refreshToken) return req.body.refreshToken;
  return null;
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    if (decoded.kv !== KEY_VERSION) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtRefreshSecret(), { algorithms: ['HS256'] });
    if (decoded.kv !== REFRESH_KEY_VERSION) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

const usersDB = new Map();
const loginAttempts = new Map();
const captchaStore = new Map();
const adminCaptchaStore = new Map();

function findUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.toLowerCase().trim();
  for (const user of usersDB.values()) {
    if (user.email && user.email.toLowerCase().trim() === normalized) {
      return user;
    }
  }
  return null;
}

// AI 聊天每日用量计数（已迁移到 Redis/sharedState 共享计数，支持 PM2 多实例）
const AI_CHAT_USAGE_TTL_SECONDS = 25 * 60 * 60; // 略大于 1 天，确保跨时区不丢失

function getAiUsageKey(userId) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  return `ai:chat:usage:${userId}:${day}`;
}

async function getAiChatUsage(userId) {
  const key = getAiUsageKey(userId);
  const value = await getString(key);
  return value ? Number(value) : 0;
}

async function incrementAiChatUsage(userId) {
  const key = getAiUsageKey(userId);
  return incrementCounter(key, AI_CHAT_USAGE_TTL_SECONDS);
}

async function checkAiChatAccess(userId) {
  const user = usersDB.get(userId);
  if (!user) return { allowed: false, reason: '用户不存在' };
  const membership = getMembershipStatus(user);
  const used = await getAiChatUsage(userId);
  const { allowed, limit } = checkPrivilege({ user, privilege: 'aiChatDaily', used });
  if (!allowed) {
    return { allowed: false, reason: `今日 AI 对话额度已用完（${limit} 次/天）`, limit, used };
  }
  return { allowed: true, limit, used, membership };
}

// 军工级字段级访问控制：定义用户对象各角色可见/可写字段
const userFieldSchema = defineFieldSchema({
  admin: { read: ['*'], write: ['*'] },
  user: {
    read: ['id', 'email', 'username', 'avatar', 'role', 'createdAt', 'currentLanguage', 'currentLevel', 'membershipInfo', 'aiDataConsent', 'theme'],
    readBlacklist: ['password', 'adminTotpEnabled', 'totpSecret', 'internalNotes'],
    write: ['username', 'avatar', 'currentLanguage', 'currentLevel', 'theme'],
  },
  guest: { read: ['id', 'username', 'avatar'], write: [] },
});

// 军工级网络边界：出站请求过滤，阻止 SSRF / 内网探测
const outboundFilter = new OutboundFilter({
  allowList: [
    'challenges.cloudflare.com',
    'api.openai.com',
    'openai.com',
    'dash.cloudflare.com',
    'api.github.com',
    'github.com',
    'open.bigmodel.cn',
    'cn.bing.com',
    'api.ipapi.is',
  ],
  denyList: [],
  blockPrivateIps: true,
  blockMetadataEndpoints: true,
});

// 军工级网络边界：将所有出站 fetch 纳入过滤，防止未授权外部请求与 SSRF
const _originalFetch = globalThis.fetch;
globalThis.fetch = outboundFilter.wrapFetch(_originalFetch);

// 军工级网络边界：证书固定 pinset（report-only 模式避免证书轮换导致服务中断）
const outboundPinset = new CertificatePinset({
  pins: process.env.API_SERVER_PINS?.split(',').filter(Boolean) || [],
  reportOnly: process.env.NODE_ENV !== 'production',
  onViolation: (cert, reason) => {
    logAudit({
      userId: 'system',
      action: 'certificate_pinning_violation',
      ip: 'system',
      details: reason,
      success: false,
    });
  },
});

// 军工级动态策略引擎：运行时热重载访问策略，支持按 IP/时间/风险等级动态调整权限
const accessPolicyEngine = new DynamicPolicyEngine(
  path.join(process.cwd(), '.security', 'access-policies.json'),
  { reloadIntervalMs: 30000, defaultRules: getDefaultDynamicRules() }
);

const sessionsDB = new Map();
const loginHistoryDB = new Map();
const twoFactorSecrets = new Map();
const passwordResetTokens = new Map();
const adminTOTPSecrets = new Map();
// 安全规范：access token 与 refresh token 使用独立的吊销表，避免类型混淆
const revokedAccessTokens = new Map();
const revokedRefreshTokens = new Map();

// ----- 令牌吊销表持久化（W6：防止进程重启后吊销记录丢失） -----
const REVOKED_TOKENS_FILE = 'revoked-tokens.json';

function saveRevokedTokens() {
  writeJSON(REVOKED_TOKENS_FILE, {
    accessTokens: Object.fromEntries(revokedAccessTokens),
    refreshTokens: Object.fromEntries(revokedRefreshTokens),
  });
}

function loadRevokedTokens() {
  const data = readJSON(REVOKED_TOKENS_FILE, null);
  if (data && typeof data === 'object') {
    if (data.accessTokens) {
      for (const [k, v] of Object.entries(data.accessTokens)) {
        if (typeof v === 'number' && v > 0) revokedAccessTokens.set(k, v);
      }
    }
    if (data.refreshTokens) {
      for (const [k, v] of Object.entries(data.refreshTokens)) {
        if (typeof v === 'number' && v > 0) revokedRefreshTokens.set(k, v);
      }
    }
  }
}

// 账号/IP 登录失败锁定（内存存储，15 分钟过期）
const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const MAX_EMAIL_FAILED_ATTEMPTS = 5;
const MAX_IP_FAILED_ATTEMPTS = 10;
const LOGIN_FAILURE_CLEANUP_INTERVAL_MS = 60 * 1000;
const loginFailureStore = new Map(); // key -> { count, lockedUntil }

function getLoginLockoutKey(email) {
  return `email:${String(email).toLowerCase().trim()}`;
}

function getLoginLockoutIpKey(ip) {
  return `ip:${ip || 'unknown'}`;
}

function isLoginLocked(key) {
  const record = loginFailureStore.get(key);
  if (!record) return false;
  if (record.lockedUntil && record.lockedUntil > Date.now()) return true;
  // 已过期则清理
  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    loginFailureStore.delete(key);
    return false;
  }
  return false;
}

function recordLoginFailure(email, ip) {
  const now = Date.now();
  const emailKey = getLoginLockoutKey(email);
  const ipKey = getLoginLockoutIpKey(ip);

  for (const key of [emailKey, ipKey]) {
    const record = loginFailureStore.get(key) || { count: 0 };
    record.count += 1;
    record.lastAttempt = now;
    const maxAttempts = key.startsWith('email:') ? MAX_EMAIL_FAILED_ATTEMPTS : MAX_IP_FAILED_ATTEMPTS;
    if (record.count >= maxAttempts) {
      record.lockedUntil = now + LOGIN_LOCKOUT_DURATION_MS;
    }
    loginFailureStore.set(key, record);
  }
}

function clearLoginFailures(email, ip) {
  loginFailureStore.delete(getLoginLockoutKey(email));
  loginFailureStore.delete(getLoginLockoutIpKey(ip));
}

function cleanupLoginFailures() {
  const now = Date.now();
  for (const [key, record] of loginFailureStore) {
    if (record.lockedUntil && record.lockedUntil <= now) {
      loginFailureStore.delete(key);
    } else if (!record.lockedUntil && record.lastAttempt && record.lastAttempt + LOGIN_LOCKOUT_DURATION_MS < now) {
      loginFailureStore.delete(key);
    }
  }
}
setInterval(cleanupLoginFailures, LOGIN_FAILURE_CLEANUP_INTERVAL_MS);

// ===== 性能调控器：注册所有安全数据结构 =====
registerResources([
  // 用户数据
  { name: 'usersDB', type: 'map', data: usersDB, options: { tags: 'user', maxSize: 10000, hardLimit: 50000 } },
  { name: 'sessionsDB', type: 'map', data: sessionsDB, options: { tags: 'user', maxSize: 5000, hardLimit: 20000 } },
  { name: 'loginHistoryDB', type: 'map', data: loginHistoryDB, options: { tags: 'user', maxSize: 5000 } },
  { name: 'twoFactorSecrets', type: 'map', data: twoFactorSecrets, options: { tags: 'user', maxSize: 1000 } },
  { name: 'passwordResetTokens', type: 'map', data: passwordResetTokens, options: { tags: 'user', maxSize: 500 } },
  // 认证/验证码
  { name: 'captchaStore', type: 'map', data: captchaStore, options: { tags: 'captcha', maxSize: 100, hardLimit: 500,
    cleanup: (d) => { let c=0; for(const [k,v] of d){ if(v.expires < Date.now()){ d.delete(k); c++; } } return c; }
  }},
  { name: 'adminCaptchaStore', type: 'map', data: adminCaptchaStore, options: { tags: 'captcha', maxSize: 50, hardLimit: 200,
    cleanup: (d) => { let c=0; for(const [k,v] of d){ if(v.expires < Date.now()){ d.delete(k); c++; } } return c; }
  }},
  { name: 'loginAttempts', type: 'map', data: loginAttempts, options: { tags: 'auth', maxSize: 1000 } },
  { name: 'loginFailureStore', type: 'map', data: loginFailureStore, options: { tags: 'auth', maxSize: 500 } },
  { name: 'adminTOTPSecrets', type: 'map', data: adminTOTPSecrets, options: { tags: 'auth', maxSize: 50 } },
  // 令牌吊销
  { name: 'revokedAccessTokens', type: 'map', data: revokedAccessTokens, options: { tags: 'token', maxSize: 1000 } },
  { name: 'revokedRefreshTokens', type: 'map', data: revokedRefreshTokens, options: { tags: 'token', maxSize: 1000 } },
])

// 启动调控器
try {
  startGovernor()
} catch (e) {
  console.warn(`[Governor] 启动失败: ${e.message}`)
}

// 增强设备指纹：多项稳定客户端特征 + 服务端密钥，取 SHA-256 前 32 位。
// 刻意剔除 IP 分量：IP 在移动端/NAT 下频繁变化，纳入会导致正常用户被误锁。
// 只采用 UA / 语言 / 平台 / 移动端等客户端稳定特征，仍能识别"跨浏览器/跨设备"的 token 窃取。
function getDeviceFingerprint(req) {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const platform = req.headers['sec-ch-ua-platform'] || '';
  const mobile = req.headers['sec-ch-ua-mobile'] || '';
  const raw = `${ua}|${lang}|${platform}|${mobile}|${DEVICE_FINGERPRINT_PEPPER}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// 让管理员二次验证中间件从数据库读取真实角色，而非信任 JWT payload
configureAdminReauth({ getUserById: (id) => usersDB.get(id) });

function parseUserAgent(ua) {
  if (!ua) return { device: '未知设备', browser: '未知', os: '未知' };
  let device = 'PC', os = '未知', browser = '未知';
  if (/iPhone|iPad|iPod/.test(ua)) device = /iPad/.test(ua) ? 'iPad' : 'iPhone';
  else if (/Android/.test(ua)) device = 'Android';
  else if (/Windows/.test(ua)) device = 'Windows PC';
  else if (/Mac OS X/.test(ua)) device = 'Mac';
  else if (/Linux/.test(ua) && !/Android/.test(ua)) device = 'Linux PC';

  if (/Windows NT 11/.test(ua)) os = 'Windows 11';
  else if (/Windows NT 10/.test(ua)) os = 'Windows 10';
  else if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X (\d+[._]\d+)/);
    os = m ? `macOS ${m[1].replace('_', '.')}` : 'macOS';
  } else if (/Android/.test(ua)) {
    const m = ua.match(/Android (\d+[.\d]*)/);
    os = m ? `Android ${m[1]}` : 'Android';
  } else if (/iPhone/.test(ua)) {
    const m = ua.match(/iPhone OS (\d+[._]\d+)/);
    os = m ? `iOS ${m[1].replace('_', '.')}` : 'iOS';
  }

  if (/Chrome/.test(ua) && !/Edg/.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/);
    browser = m ? `Chrome ${m[1]}` : 'Chrome';
  } else if (/Firefox/.test(ua)) {
    const m = ua.match(/Firefox\/(\d+)/);
    browser = m ? `Firefox ${m[1]}` : 'Firefox';
  } else if (/Edg/.test(ua)) {
    const m = ua.match(/Edg\/(\d+)/);
    browser = m ? `Edge ${m[1]}` : 'Edge';
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    const m = ua.match(/Version\/(\d+)/);
    browser = m ? `Safari ${m[1]}` : 'Safari';
  }

  return { device, os, browser };
}

function formatTimeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(date).toLocaleDateString('zh-CN');
}

const mockCourses = [
  {
    id: '1',
    language: 'english',
    level: 'beginner',
    title: '英语入门：ABC与基础词汇',
    description: '从零开始学习英语，掌握基础词汇和简单对话，建立语言学习的信心',
    coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=300&fit=crop',
    progress: 35,
    category: 'vocabulary',
    tags: ['基础', '词汇', '入门'],
    studentsCount: 2847,
    totalDuration: 69,
    instructor: 'Sarah Johnson',
    lessons: [
      { id: 'l1', title: '字母与发音', duration: 15, completed: true, description: '学习26个英文字母的标准发音' },
      { id: 'l2', title: '问候与自我介绍', duration: 20, completed: true, description: '掌握日常问候语和自我介绍的句型' },
      { id: 'l3', title: '数字与时间', duration: 18, completed: false, description: '学习数字表达和时间的说法' },
      { id: 'l4', title: '颜色与形状', duration: 16, completed: false, description: '掌握常见颜色和形状的英文表达' },
    ]
  },
  {
    id: '2',
    language: 'english',
    level: 'beginner',
    title: '英语发音训练',
    description: '系统学习英语音标和发音规则，纠正常见发音错误，说出地道英语',
    coverImage: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=300&fit=crop',
    progress: 0,
    category: 'pronunciation',
    tags: ['发音', '音标', '口语'],
    studentsCount: 1956,
    totalDuration: 85,
    instructor: 'Michael Chen',
    lessons: [
      { id: 'l1', title: '元音音标详解', duration: 20, completed: false, description: '学习20个英语元音的正确发音' },
      { id: 'l2', title: '辅音音标详解', duration: 25, completed: false, description: '掌握24个辅音的发音技巧' },
      { id: 'l3', title: '连读与弱读', duration: 22, completed: false, description: '学习自然语流中的连读和弱读规则' },
      { id: 'l4', title: '语调与重音', duration: 18, completed: false, description: '掌握英语句子的语调和重音模式' },
    ]
  },
  {
    id: '3',
    language: 'english',
    level: 'elementary',
    title: '初级英语：日常会话',
    description: '学习实用的日常英语表达，提高沟通能力，自信应对各种生活场景',
    coverImage: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=300&fit=crop',
    progress: 15,
    category: 'speaking',
    tags: ['会话', '日常', '实用'],
    studentsCount: 3210,
    totalDuration: 67,
    instructor: 'Sarah Johnson',
    lessons: [
      { id: 'l1', title: '购物用语', duration: 22, completed: false, description: '学习购物场景的常用表达' },
      { id: 'l2', title: '餐厅点餐', duration: 25, completed: false, description: '掌握餐厅点餐和交流的技巧' },
      { id: 'l3', title: '问路与指路', duration: 20, completed: false, description: '学会问路和给别人指路' },
    ]
  },
  {
    id: '4',
    language: 'english',
    level: 'elementary',
    title: '英语听力入门',
    description: '从慢速英语开始，逐步提升听力理解能力，适应不同语速和口音',
    coverImage: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=400&h=300&fit=crop',
    progress: 0,
    category: 'listening',
    tags: ['听力', '入门', '理解'],
    studentsCount: 1789,
    totalDuration: 90,
    instructor: 'Emily Watson',
    lessons: [
      { id: 'l1', title: '数字与字母听力', duration: 20, completed: false, description: '训练数字和字母的听力识别' },
      { id: 'l2', title: '短对话理解', duration: 25, completed: false, description: '理解日常简短对话的内容' },
      { id: 'l3', title: '公告与通知', duration: 22, completed: false, description: '听懂公共场所的广播和通知' },
      { id: 'l4', title: '简单故事听力', duration: 23, completed: false, description: '听懂简短的英语故事' },
    ]
  },
  {
    id: '5',
    language: 'english',
    level: 'intermediate',
    title: '中级英语：语法与写作',
    description: '系统梳理英语语法体系，提升写作能力，写出流畅地道的英文',
    coverImage: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=400&h=300&fit=crop',
    progress: 0,
    category: 'grammar',
    tags: ['语法', '写作', '进阶'],
    studentsCount: 2134,
    totalDuration: 110,
    instructor: 'Michael Chen',
    lessons: [
      { id: 'l1', title: '时态综合复习', duration: 30, completed: false, description: '全面复习英语12种时态的用法' },
      { id: 'l2', title: '从句与连接词', duration: 28, completed: false, description: '掌握名词性从句、定语从句和状语从句' },
      { id: 'l3', title: '被动语态与虚拟语气', duration: 25, completed: false, description: '学习被动语态和虚拟语气的用法' },
      { id: 'l4', title: '段落写作技巧', duration: 27, completed: false, description: '学习如何写出结构清晰的段落' },
    ]
  },
  {
    id: '6',
    language: 'english',
    level: 'advanced',
    title: '高级英语：商务沟通',
    description: '掌握职场英语沟通技巧，包括邮件写作、会议发言、商务谈判等',
    coverImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop',
    progress: 0,
    category: 'speaking',
    tags: ['商务', '职场', '沟通'],
    studentsCount: 1567,
    totalDuration: 120,
    instructor: 'Sarah Johnson',
    lessons: [
      { id: 'l1', title: '商务邮件写作', duration: 30, completed: false, description: '学习正式和半正式商务邮件的写法' },
      { id: 'l2', title: '会议发言技巧', duration: 35, completed: false, description: '掌握会议中的发言和讨论技巧' },
      { id: 'l3', title: '商务谈判英语', duration: 30, completed: false, description: '学习谈判中的专业表达和策略' },
      { id: 'l4', title: '演讲与演示', duration: 25, completed: false, description: '提升英语演讲和演示的能力' },
    ]
  },
  {
    id: '7',
    language: 'japanese',
    level: 'beginner',
    title: '日语入门：五十音图',
    description: '学习平假名和片假名，掌握日语发音基础，开启日语学习之旅',
    coverImage: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=300&fit=crop',
    progress: 60,
    category: 'pronunciation',
    tags: ['五十音', '假名', '入门'],
    studentsCount: 4567,
    totalDuration: 105,
    instructor: '田中 美咲',
    lessons: [
      { id: 'l1', title: 'あ行～さ行', duration: 25, completed: true, description: '学习あいうえお到さしすせそ的发音和书写' },
      { id: 'l2', title: 'た行～な行', duration: 25, completed: true, description: '学习たちつてと到なにぬねの的发音和书写' },
      { id: 'l3', title: 'は行～わ行', duration: 25, completed: false, description: '学习はひふへほ到わをん的发音和书写' },
      { id: 'l4', title: '片假名入门', duration: 30, completed: false, description: '学习片假名的发音和书写规则' },
    ]
  },
  {
    id: '8',
    language: 'japanese',
    level: 'beginner',
    title: '日语汉字入门',
    description: '学习常用日语汉字的读音和写法，掌握汉字在日语中的独特用法',
    coverImage: 'https://images.unsplash.com/photo-1529255484355-cb73c33c04bb?w=400&h=300&fit=crop',
    progress: 0,
    category: 'vocabulary',
    tags: ['汉字', '词汇', '书写'],
    studentsCount: 3245,
    totalDuration: 95,
    instructor: '佐藤 健一',
    lessons: [
      { id: 'l1', title: '数字与方向汉字', duration: 22, completed: false, description: '学习数字和方位相关的常用汉字' },
      { id: 'l2', title: '自然与天气汉字', duration: 25, completed: false, description: '掌握自然现象和天气相关的汉字' },
      { id: 'l3', title: '学校与生活汉字', duration: 24, completed: false, description: '学习校园和日常生活相关的汉字' },
      { id: 'l4', title: '音读与训读规则', duration: 24, completed: false, description: '理解汉字音读和训读的区别和规律' },
    ]
  },
  {
    id: '9',
    language: 'japanese',
    level: 'elementary',
    title: '初级日语：日常会话',
    description: '学习实用的日语日常表达，掌握基本的语法结构，进行简单交流',
    coverImage: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=300&fit=crop',
    progress: 0,
    category: 'speaking',
    tags: ['会话', '日常', '实用'],
    studentsCount: 2890,
    totalDuration: 80,
    instructor: '田中 美咲',
    lessons: [
      { id: 'l1', title: '自我介绍与寒暄', duration: 20, completed: false, description: '学习日语的自我介绍和日常寒暄' },
      { id: 'l2', title: '购物与点餐', duration: 22, completed: false, description: '掌握购物和餐厅点餐的表达' },
      { id: 'l3', title: '交通与问路', duration: 20, completed: false, description: '学习乘坐交通工具和问路的说法' },
      { id: 'l4', title: '邀请与约定', duration: 18, completed: false, description: '学会发出邀请和约定时间' },
    ]
  },
  {
    id: '10',
    language: 'japanese',
    level: 'intermediate',
    title: '中级日语：语法进阶',
    description: '深入学习日语语法体系，掌握更复杂的表达方式和句型结构',
    coverImage: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=400&h=300&fit=crop',
    progress: 0,
    category: 'grammar',
    tags: ['语法', '进阶', '句型'],
    studentsCount: 1987,
    totalDuration: 100,
    instructor: '佐藤 健一',
    lessons: [
      { id: 'l1', title: 'て形与た形', duration: 30, completed: false, description: '学习动词て形和た形的变形规则' },
      { id: 'l2', title: '可能形与被动形', duration: 35, completed: false, description: '掌握可能形和被动的用法' },
      { id: 'l3', title: '使役形与条件形', duration: 35, completed: false, description: '学习使役形和条件形的表达' },
    ]
  },
  {
    id: '11',
    language: 'japanese',
    level: 'intermediate',
    title: '日语阅读训练',
    description: '通过阅读各类日语文章，提升阅读理解能力和词汇量',
    coverImage: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=300&fit=crop',
    progress: 0,
    category: 'reading',
    tags: ['阅读', '理解', '文章'],
    studentsCount: 1456,
    totalDuration: 90,
    instructor: '田中 美咲',
    lessons: [
      { id: 'l1', title: '短篇新闻阅读', duration: 22, completed: false, description: '阅读简短的日语新闻文章' },
      { id: 'l2', title: '散文与随笔', duration: 25, completed: false, description: '欣赏日语散文和随笔作品' },
      { id: 'l3', title: '实用邮件阅读', duration: 20, completed: false, description: '学习阅读日语邮件和通知' },
      { id: 'l4', title: '小说节选阅读', duration: 23, completed: false, description: '阅读日语小说的精彩节选' },
    ]
  },
  {
    id: '12',
    language: 'japanese',
    level: 'advanced',
    title: '高级日语：新闻与写作',
    description: '读懂日语新闻，提升书面表达能力，达到高级日语水平',
    coverImage: 'https://images.unsplash.com/photo-1504711434969-e33886168d8c?w=400&h=300&fit=crop',
    progress: 0,
    category: 'writing',
    tags: ['新闻', '写作', '高级'],
    studentsCount: 987,
    totalDuration: 115,
    instructor: '佐藤 健一',
    lessons: [
      { id: 'l1', title: '新闻标题解读', duration: 25, completed: false, description: '学习日语新闻标题的特点和解读技巧' },
      { id: 'l2', title: '社论与评论', duration: 30, completed: false, description: '阅读日语社论和评论文章' },
      { id: 'l3', title: '小论文写作', duration: 35, completed: false, description: '学习日语小论文的写作方法' },
      { id: 'l4', title: '研究报告写作', duration: 25, completed: false, description: '掌握日语研究报告的写作规范' },
    ]
  },
  {
    id: '13',
    language: 'korean',
    level: 'beginner',
    title: '韩语入门：Hangul',
    description: '学习韩文字母Hangul，掌握韩语发音规则，轻松开启韩语学习',
    coverImage: 'https://images.unsplash.com/photo-1538485399081-7191377e8231?w=400&h=300&fit=crop',
    progress: 80,
    category: 'pronunciation',
    tags: ['韩文', '字母', '入门'],
    studentsCount: 3890,
    totalDuration: 85,
    instructor: '박지민',
    lessons: [
      { id: 'l1', title: '辅音与元音', duration: 20, completed: true, description: '学习韩语基本辅音和元音的发音' },
      { id: 'l2', title: '音节组合', duration: 22, completed: true, description: '掌握辅音和元音组合成音节的方法' },
      { id: 'l3', title: '收音规则', duration: 25, completed: true, description: '学习韩语收音（韵尾）的发音规则' },
      { id: 'l4', title: '基础问候', duration: 18, completed: false, description: '学习韩语的基础问候表达' },
    ]
  },
  {
    id: '14',
    language: 'korean',
    level: 'beginner',
    title: '韩语发音训练',
    description: '系统训练韩语发音，掌握连音、紧音、送气音等核心发音规则',
    coverImage: 'https://images.unsplash.com/photo-1525648199074-cee30ba79a4a?w=400&h=300&fit=crop',
    progress: 0,
    category: 'pronunciation',
    tags: ['发音', '训练', '口语'],
    studentsCount: 2345,
    totalDuration: 75,
    instructor: '김수진',
    lessons: [
      { id: 'l1', title: '紧音与送气音', duration: 20, completed: false, description: '学习韩语紧音和送气音的发音区别' },
      { id: 'l2', title: '连音规则', duration: 18, completed: false, description: '掌握韩语连音的发音规则' },
      { id: 'l3', title: '同化现象', duration: 20, completed: false, description: '学习韩语中的同化发音现象' },
      { id: 'l4', title: '语调与节奏', duration: 17, completed: false, description: '掌握韩语句子的语调和节奏' },
    ]
  },
  {
    id: '15',
    language: 'korean',
    level: 'elementary',
    title: '初级韩语：日常用语',
    description: '学习实用的韩语日常会话，掌握基础语法，畅游韩国无障碍',
    coverImage: 'https://images.unsplash.com/photo-1534274988757-a28bf1a00c0c?w=400&h=300&fit=crop',
    progress: 0,
    category: 'speaking',
    tags: ['会话', '日常', '旅行'],
    studentsCount: 2678,
    totalDuration: 70,
    instructor: '박지민',
    lessons: [
      { id: 'l1', title: '自我介绍', duration: 20, completed: false, description: '学习韩语的自我介绍表达' },
      { id: 'l2', title: '购物与砍价', duration: 28, completed: false, description: '掌握购物场景的韩语表达' },
      { id: 'l3', title: '餐厅与美食', duration: 22, completed: false, description: '学习餐厅点餐和美食相关的韩语' },
    ]
  },
  {
    id: '16',
    language: 'korean',
    level: 'elementary',
    title: '韩语听力训练',
    description: '通过多样化的听力材料，提升韩语听力理解能力和反应速度',
    coverImage: 'https://images.unsplash.com/photo-1494232410401-ad00d5433cfa?w=400&h=300&fit=crop',
    progress: 0,
    category: 'listening',
    tags: ['听力', '训练', '理解'],
    studentsCount: 1567,
    totalDuration: 80,
    instructor: '김수진',
    lessons: [
      { id: 'l1', title: '日常对话听力', duration: 20, completed: false, description: '训练日常韩语对话的听力理解' },
      { id: 'l2', title: '广播与公告', duration: 22, completed: false, description: '听懂韩语广播和公共场所的公告' },
      { id: 'l3', title: '韩剧片段听力', duration: 20, completed: false, description: '通过韩剧片段提升听力水平' },
      { id: 'l4', title: '新闻简讯听力', duration: 18, completed: false, description: '听懂简短的韩语新闻' },
    ]
  },
  {
    id: '17',
    language: 'korean',
    level: 'intermediate',
    title: '中级韩语：语法进阶',
    description: '深入学习韩语语法体系，掌握敬语、连接词尾等核心语法点',
    coverImage: 'https://images.unsplash.com/photo-1511911063855-2bf8e8275fb2?w=400&h=300&fit=crop',
    progress: 0,
    category: 'grammar',
    tags: ['语法', '进阶', '敬语'],
    studentsCount: 1876,
    totalDuration: 100,
    instructor: '박지민',
    lessons: [
      { id: 'l1', title: '敬语体系详解', duration: 30, completed: false, description: '学习韩语的敬语体系和用法' },
      { id: 'l2', title: '连接词尾与转折', duration: 25, completed: false, description: '掌握各种连接词尾的用法' },
      { id: 'l3', title: '间接引语', duration: 22, completed: false, description: '学习韩语的间接引语表达' },
      { id: 'l4', title: '使动与被动态', duration: 23, completed: false, description: '掌握使动和被动的表达方式' },
    ]
  },
  {
    id: '18',
    language: 'korean',
    level: 'advanced',
    title: '高级韩语：TOPIK备考',
    description: '针对TOPIK考试进行系统训练，全面提升听力、阅读、写作能力',
    coverImage: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=300&fit=crop',
    progress: 0,
    category: 'exam',
    tags: ['TOPIK', '考试', '备考'],
    studentsCount: 1234,
    totalDuration: 130,
    instructor: '김수진',
    lessons: [
      { id: 'l1', title: 'TOPIK听力技巧', duration: 35, completed: false, description: '学习TOPIK听力的解题技巧' },
      { id: 'l2', title: 'TOPIK阅读策略', duration: 35, completed: false, description: '掌握TOPIK阅读的答题策略' },
      { id: 'l3', title: 'TOPIK写作模板', duration: 30, completed: false, description: '学习TOPIK写作的常用模板' },
      { id: 'l4', title: '模拟试题精讲', duration: 30, completed: false, description: '通过模拟试题巩固所学知识' },
    ]
  }
];

const mockWords = [
  { id: 'w1', term: 'Hello', definition: '你好', pronunciation: '/həˈloʊ/', example: 'Hello, nice to meet you!' },
  { id: 'w2', term: 'Thank you', definition: '谢谢', pronunciation: '/θæŋk juː/', example: 'Thank you for your help!' },
  { id: 'w3', term: 'Goodbye', definition: '再见', pronunciation: '/ɡʊdˈbaɪ/', example: 'Goodbye, see you tomorrow!' },
  { id: 'w4', term: 'Please', definition: '请', pronunciation: '/pliːz/', example: 'Please sit down.' },
  { id: 'w5', term: 'Sorry', definition: '对不起', pronunciation: '/ˈsɑːri/', example: 'Sorry, I\'m late.' },
  { id: 'w6', term: 'こんにちは', definition: '你好', pronunciation: 'konnichiwa', example: 'こんにちは、元気ですか？' },
  { id: 'w7', term: 'ありがとう', definition: '谢谢', pronunciation: 'arigatou', example: 'ありがとうございます！' },
  { id: 'w8', term: '안녕하세요', definition: '你好', pronunciation: 'annyeonghaseyo', example: '안녕하세요, 반갑습니다!' },
];

const mockGrammarExercises = [
  {
    id: 'g1',
    question: 'I ___ to school every day.',
    options: ['go', 'goes', 'going', 'went'],
    correctAnswer: 0,
    explanation: '一般现在时，主语是I，用动词原形go。'
  },
  {
    id: 'g2',
    question: 'She ___ a book now.',
    options: ['read', 'reads', 'is reading', 'reading'],
    correctAnswer: 2,
    explanation: '现在进行时，用be + doing结构，she用is。'
  },
  {
    id: 'g3',
    question: 'They ___ football yesterday.',
    options: ['play', 'plays', 'played', 'playing'],
    correctAnswer: 2,
    explanation: '一般过去时，动词用过去式played。'
  },
  {
    id: 'g4',
    question: '私は日本語 ___ 勉強しています。',
    options: ['を', 'が', 'は', 'に'],
    correctAnswer: 0,
    explanation: 'を表示动作的对象。'
  },
];

const mockAchievements = [
  { id: 'a1', title: '初学者', description: '完成第一节课', icon: 'star', unlocked: true, unlockedAt: '2024-01-15' },
  { id: 'a2', title: '学习达人', description: '连续学习7天', icon: 'flame', unlocked: true, unlockedAt: '2024-01-22' },
  { id: 'a3', title: '词汇大师', description: '掌握100个单词', icon: 'book-open', unlocked: false },
  { id: 'a4', title: '语法达人', description: '完成50道语法题', icon: 'lightbulb', unlocked: false },
  { id: 'a5', title: '社区明星', description: '发布10条动态', icon: 'message-circle', unlocked: false },
  { id: 'a6', title: '语言通', description: '解锁3门语言', icon: 'globe', unlocked: false },
];

const mockPosts = [
  {
    id: 'p1',
    userId: 'u1',
    username: '学习小王子',
    avatar: 'https://i.pravatar.cc/150?img=1',
    content: '今天终于完成了日语五十音图的学习！虽然花了不少时间，但很有成就感。继续加油！💪',
    language: 'japanese',
    likes: 24,
    comments: [
      { id: 'c1', userId: 'u2', username: '日语爱好者', content: '恭喜！五十音图是基础，加油！', createdAt: '2024-02-20T10:30:00Z' }
    ],
    createdAt: '2024-02-20T09:15:00Z'
  },
  {
    id: 'p2',
    userId: 'u3',
    username: 'K-pop迷',
    avatar: 'https://i.pravatar.cc/150?img=5',
    content: '终于学会用韩语点咖啡了！"아이스 아메리카노 주세요" ☕ 去韩国旅游终于不怕啦～',
    language: 'korean',
    likes: 45,
    comments: [
      { id: 'c2', userId: 'u4', username: '韩语小白', content: '太厉害了！我也要学这个', createdAt: '2024-02-19T15:20:00Z' },
      { id: 'c3', userId: 'u5', username: '旅行达人', content: '实用！收藏了', createdAt: '2024-02-19T16:45:00Z' }
    ],
    createdAt: '2024-02-19T14:00:00Z'
  },
  {
    id: 'p3',
    userId: 'u6',
    username: '英语学霸',
    avatar: 'https://i.pravatar.cc/150?img=8',
    content: '分享一个背单词的小技巧：每天早上起床后和晚上睡觉前各背10个，记忆效果超棒！大家可以试试～',
    language: 'english',
    likes: 89,
    comments: [],
    createdAt: '2024-02-18T21:30:00Z'
  }
];

const mockProgress = {
  totalWordsLearned: 45,
  totalLessonsCompleted: 8,
  totalStudyTime: 320,
  streak: 7,
  weeklyData: [
    { day: '周一', minutes: 45 },
    { day: '周二', minutes: 60 },
    { day: '周三', minutes: 30 },
    { day: '周四', minutes: 50 },
    { day: '周五', minutes: 65 },
    { day: '周六', minutes: 40 },
    { day: '周日', minutes: 30 },
  ]
};

const app = express();

// 军工级：受信任反向代理（Render/Nginx 等）终结 TLS 时，信任代理头以便
// 正确解析真实 IP 与协议，并强制 HTTPS 重定向。仅当 TRUST_PROXY=true 时启用，
// 避免未设置代理时被伪造 X-Forwarded-* 头绕过。
const proxyTerminatedTls = process.env.TRUST_PROXY === 'true' || process.env.RENDER === 'true';
if (proxyTerminatedTls) {
  // 信任首层反向代理（Render 单层代理）；生产环境强制 HTTPS
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'];
    if (process.env.NODE_ENV === 'production' && proto && proto !== 'https') {
      // 生产环境禁止明文 HTTP 访问（代理应已终结 TLS，此处兜底）
      return res.status(403).json({ success: false, code: 'HTTPS_REQUIRED', message: 'HTTPS required' });
    }
    return next();
  });
  console.log('[Network] 已启用受信任反向代理模式（trust proxy）');
}

// 初始化 Sentry 错误监控（仅在配置 SENTRY_DSN 时启用）
initSentry();
app.use(getSentryRequestHandler());
// TCP连接层WAF — 在所有中间件之前注册，确保raw socket攻击在HTTP解析前被拦截
app.use(tcpWafMiddleware);

// 资源护盾 — ConnGuard：并发连接追踪 + 慢速攻击检测
app.use(connGuardMiddleware);

// 资源护盾 — RateGuard：IP级速率控制 + 全局速率保护
app.use(rateGuardMiddleware);

const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 统一日志框架：托管全局 console，统一收集/分级/落盘/脱敏所有运行日志
installGlobalConsole();
logger.info('[Logger] 统一日志框架已启用，level=' + logger.level + ', dir=' + logger.logDir);

// 启动时清理超出 7 天的历史日志文件
try {
  const logDir = logger.logDir;
  if (fs.existsSync(logDir)) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(logDir)) {
      if (file.startsWith('runtime-') && file.endsWith('.log')) {
        const fp = path.join(logDir, file);
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          logger.debug('[Logger] 已清理过期日志文件: ' + file);
        }
      }
    }
  }
} catch (e) {
  logger.debug('[Logger] 日志清理跳过: ' + e.message);
}

function readJSON(filename, fallback = []) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return fallback; }
}

// 提前声明 server 变量，避免路由创建时 TDZ 引用错误
let server;

function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// 启动时从文件恢复令牌吊销记录（DATA_DIR / readJSON 就绪后才可调用）
loadRevokedTokens();

// 加载问卷数据（用于管理端操作和问卷路由）
const surveys = readJSON('surveys.json');

// 高敏感数据文件强制加密读写：surveys / notifications / bug-reports
function readEncryptedJSON(filename, fallback = []) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    // 如果内容以 enc: 开头，则解密；否则按明文兼容读取并告警
    if (raw.startsWith('enc:')) {
      if (!hasEncryptionKey()) {
        throw new Error(`[FileVault] ${filename} 为加密文件，但 FILE_ENCRYPTION_KEY 未配置`);
      }
      return JSON.parse(decrypt(raw));
    }
    console.warn(`[FileVault] ${filename} 当前为明文存储，建议运行 npm run security:encrypt-files 迁移`);
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[FileVault] 读取 ${filename} 失败:`, err.message);
    return fallback;
  }
}

// 数据删除自动化：删除用户在文件系统中的残留个人数据
// 覆盖：AI 聊天历史 + Bug 报告引用的上传视频文件
async function deleteUserResidualData(userId, context = {}) {
  const removed = { chatMessages: 0, videos: [] };

  // 1) 清理 AI 聊天历史
  try {
    const r = chatRetention.deleteUserHistory(userId, context);
    removed.chatMessages = r?.deleted || 0;
  } catch (err) {
    console.error('[delete-data] 清理聊天历史失败:', err.message);
  }

  // 2) 清理该用户 Bug 报告引用的上传视频文件
  try {
    const reports = readEncryptedJSON('bug-reports.json', []);
    if (Array.isArray(reports)) {
      for (const report of reports) {
        if (report && report.userId === userId && report.videoUrl) {
          // videoUrl 形如 /uploads/bug-video-xxx.webm，仅允许删除 uploads 目录内的文件
          const filename = path.basename(report.videoUrl);
          const target = path.join(UPLOAD_DIR, filename);
          if (fs.existsSync(target) && path.dirname(target) === UPLOAD_DIR) {
            fs.unlinkSync(target);
            removed.videos.push(filename);
          }
          report.videoUrl = null;
          report.videoMeta = null;
        }
      }
    }
    // 仅当实际清除了视频引用时才回写，避免无意义写入
    if (removed.videos.length > 0) {
      writeEncryptedJSON('bug-reports.json', reports);
    }
  } catch (err) {
    console.error('[delete-data] 清理上传文件失败:', err.message);
  }

  logAudit({
    userId,
    action: 'account_residual_data_deleted',
    ip: context.ip || 'unknown',
    details: JSON.stringify(removed),
    success: true,
  });

  return removed;
}

function restrictFilePermissions(filePath) {
  try {
    // POSIX：仅所有者可读写
    fs.chmodSync(filePath, 0o600);
    if (process.platform === 'win32') {
      // Windows：移除继承权限并仅保留当前用户
      const user = process.env.USERNAME || process.env.USER;
      if (user) {
        execSync(`icacls "${filePath}" /inheritance:r /grant:r "${user}:(R,W)"`, { stdio: 'ignore' });
      }
    }
  } catch (err) {
    console.warn(`[FileVault] 无法限制 ${filePath} 文件权限:`, err.message);
  }
}

function writeEncryptedJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!hasEncryptionKey()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[FileVault] 生产环境禁止明文写入 ${filename}，必须配置 FILE_ENCRYPTION_KEY`);
    }
    console.warn(`[FileVault] ${filename} 将以明文写入（开发环境降级）`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    restrictFilePermissions(filePath);
    return;
  }
  const plaintext = JSON.stringify(data, null, 2);
  const encrypted = encrypt(plaintext, { context: filename });
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, encrypted, 'utf-8');
  fs.renameSync(tempFile, filePath);
  restrictFilePermissions(filePath);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:4173').split(',').map(s => s.trim());

function isSameOriginUrl(origin) {
  if (!origin || typeof origin !== 'string') return false;
  try {
    const url = new URL(origin);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false;
    return ALLOWED_ORIGINS.some(allowed => {
      try {
        const allowedUrl = new URL(allowed);
        return url.protocol === allowedUrl.protocol && url.host === allowedUrl.host;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

// 敏感文件黑名单 — 拦截所有对配置/凭据文件的访问
const BLOCKED_FILES = [
  '.env', '.env.local', '.env.production', '.env.development',
  '.gitignore', '.gitattributes',
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'tsconfig.json', 'vite.config.ts', 'vite.config.js',
  'docker-compose.yml', 'Dockerfile',
  'nginx.conf', '.htaccess',
  'composer.json', 'Gemfile', 'Podfile',
  'id_rsa', 'id_dsa', '.ssh', 'known_hosts',
  'credentials', 'secrets', 'config.json',
  '*.log', 'npm-debug.log*', 'yarn-debug.log*', 'yarn-error.log*',
  'node_modules', '.git',
]

const BLOCKED_EXTENSIONS = ['.sql', '.db', '.sqlite', '.mdb', '.rdb', '.dump', '.pem', '.key', '.crt', '.pfx', '.p12']

app.use((req, res, next) => {
  const pathname = req.path.toLowerCase()
  for (const pattern of BLOCKED_FILES) {
    if (pathname === '/' + pattern.toLowerCase() || pathname.startsWith('/' + pattern.toLowerCase() + '/')) {
      return res.status(403).json({ success: false, message: '禁止访问系统文件' })
    }
  }
  for (const ext of BLOCKED_EXTENSIONS) {
    if (pathname.endsWith(ext)) {
      return res.status(403).json({ success: false, message: '禁止访问数据库/密钥文件' })
    }
  }
  if (pathname.startsWith('/.') || pathname.includes('/.')) {
    return res.status(403).json({ success: false, message: '禁止访问隐藏文件/目录' })
  }
  if (pathname.includes('..') || pathname.includes('%2e%2e')) {
    return res.status(403).json({ success: false, message: '禁止目录遍历' })
  }
  next()
})

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] 拦截来自 ${origin} 的请求`);
      // 返回标准 CORS 拒绝，而不是抛 Error 导致 500
      callback(null, false);
    }
  },
  credentials: true,
  maxAge: 86400,
}));

// 定期清理过期验证码 + Token吊销记录（每5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [id, captcha] of captchaStore) {
    if (captcha.expires < now) captchaStore.delete(id);
  }
  for (const [id, captcha] of adminCaptchaStore) {
    if (captcha.expires < now) adminCaptchaStore.delete(id);
  }
  for (const [token, revokedAt] of revokedAccessTokens) {
    if (now - revokedAt > 7 * 24 * 60 * 60 * 1000) {
      revokedAccessTokens.delete(token);
    }
  }
  for (const [token, revokedAt] of revokedRefreshTokens) {
    if (now - revokedAt > 7 * 24 * 60 * 60 * 1000) {
      revokedRefreshTokens.delete(token);
    }
  }
  saveRevokedTokens();
}, 5 * 60 * 1000);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'strict-dynamic'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://open.bigmodel.cn"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  hsts: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
  hidePoweredBy: true,
  frameguard: { action: 'deny' },
  permissionsPolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'none'"],
      geolocation: ["'none'"],
      notifications: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      bluetooth: ["'none'"],
      magnetometer: ["'none'"],
      gyroscope: ["'none'"],
      accelerometer: ["'none'"],
      midi: ["'none'"],
      syncXhr: ["'none'"],
      fullscreen: ["'self'"],
      displayCapture: ["'none'"],
      publickeyCredentials: ["'self'"],
      clipboardRead: ["'none'"],
      clipboardWrite: ["'self'"],
      interestCohort: ["'none'"],
    },
  },
}));

// 请求体大小限制：256KB，防止大body资源耗尽攻击
// 合法请求（登录、注册、评论等）远小于此值
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ limit: '256kb', extended: false }));

// 资源护盾 — BodyGuard：字段长度、嵌套深度检查
app.use(bodyGuardMiddleware)

// 资源护盾 — BodyParser 413 错误处理
app.use(bodyParserErrorHandler)
app.use(cookieParser());

// 军工级：原型污染防护，递归清除对象中的危险键
const POLLUTED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function sanitizePrototypePollution(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizePrototypePollution);
  }
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (POLLUTED_KEYS.has(key)) continue;
    clean[key] = sanitizePrototypePollution(value);
  }
  return clean;
}
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizePrototypePollution(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizePrototypePollution(req.query);
  }
  next();
});

// 军工级：运行态安全自检中间件，拦截对敏感路径的直接访问
app.use(runtimeGuardMiddleware);

// 军工级：在 WAF 之前先拒绝路径遍历请求，防止 /api/achievements/../admin/* 等绕过
app.use((req, res, next) => {
  const rawUrl = req.originalUrl || req.url || '';
  // 检测原始 URL 中的路径遍历（含 URL 编码、双重编码、反斜杠、空字节）
  const traversalPattern = /(?:\.|%2e|%252e)(?:\.|%2e|%252e)(?:[\/\\]|%2f|%5c|%252f|%255c)|%00|\x00|%c0%af|\.{2,}(?:[\/\\]|%2f|%5c|%252f|%255c)/i;
  if (traversalPattern.test(rawUrl)) {
    return res.status(403).json({
      success: false,
      message: '请求包含非法路径',
      code: 'PATH_TRAVERSAL_BLOCKED',
    });
  }
  next();
});

// 军工级：拒绝 source map 请求，防止源码泄露
app.use((req, res, next) => {
  const rawUrl = req.originalUrl || req.url || '';
  if (/\.map(?:\?.*)?$/i.test(rawUrl)) {
    return res.status(403).json({
      success: false,
      message: '禁止访问',
      code: 'SOURCEMAP_BLOCKED',
    });
  }
  next();
});

// 军工级：WAF 规则前置，先于 CSRF 拦截常见攻击模式
app.use(wafRulesMiddleware);
app.use(securityMiddleware);

// 军工级：HMAC 请求签名校验（防 API 被直接抓包伪造调用）
// 先于 nonce 去重执行；签名通过后再由 requestReplay 防重放
app.use(signatureMiddleware);

// 军工级：请求重放防护（nonce + 时间戳去重）
// 对 POST/PUT/DELETE/PATCH 请求校验 X-Request-Nonce 和 X-Request-Timestamp 头
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next()
  // 排除 multipart 文件上传和其他流式 body
  if (req.path.startsWith('/api/bug-report/upload')) return next()
  if (req.path.startsWith('/api/ai/chat/stream')) return next()
  // 排除安全采集端点（前端频繁发送行为数据，nonce 管理复杂）
  if (req.path === '/api/security/behavior' || req.path === '/api/security/environment-check') return next()

  const nonce = req.headers['x-request-nonce']
  const timestamp = req.headers['x-request-timestamp']
  if (!nonce || !timestamp) {
    // 非强制：不拒绝缺少 nonce 的请求（兼容旧客户端），仅记录警告
    return next()
  }
  const result = validateRequest(String(nonce), String(timestamp), getClientIP(req))
  if (!result.valid) {
    logAudit({ userId: req.tokenPayload?.userId, action: 'replay_attack_blocked', req, details: result.reason, success: false })
    return res.status(429).json({ success: false, message: '请求已被处理，请勿重复提交', code: 'REPLAY_BLOCKED' })
  }
  next()
})

// 军工级：熔断器-阈值阻断 + 自动化安全事件响应中间件
// 在每个请求之后评估 IP 的异常评分，达到阈值则自动封禁
// 同时触发自动化安全事件响应，执行预定义响应策略
const AUTO_RESPONSE_THRESHOLD = 30 // 异常评分超过此阈值触发自动化事件响应
app.use((req, res, next) => {
  const ip = getClientIP(req)

  // 安全仪表盘端点豁免：终端看板脚本频繁轮询，不触发安全事件
  // 同时重置该 IP 的异常评分，避免看板轮询导致评分累积
  if (req.path === '/api/security/dashboard') {
    if (ipReputation?.resetScore) {
      ipReputation.resetScore(ip)
    }
    return next()
  }

  // 从 ipReputation 获取当前 IP 的异常评分
  const ipScore = ipReputation?.getScore ? ipReputation.getScore(ip) : 0
  if (ipScore > 0) {
    evaluateThresholdBlock(ip, ipScore)
    // 当 IP 评分较高时，触发自动化安全事件响应
    if (ipScore >= AUTO_RESPONSE_THRESHOLD) {
      evaluateSecurityEvent({
        type: 'HIGH_RISK_REQUEST',
        severity: ipScore >= 60 ? 'high' : 'medium',
        ip,
        message: `IP 异常评分 ${ipScore}，触发自动化安全响应`,
        details: {
          score: ipScore,
          path: req.path,
          method: req.method,
          userAgent: req.headers['user-agent']?.slice(0, 100),
        },
      }).catch(err => {
        console.warn(`[AutoResponse] 评估安全事件失败: ${err.message}`)
      })
    }
  }
  next()
})

// ===== 账号状态中间件（全局注入，但不对公开路由生效） =====
// 公开路由（无需登录）
const PUBLIC_PATHS = [
  '/api/health', '/api/config', '/api/csrf-token', '/api/register', '/api/login',
  '/api/admin/login', '/api/admin/captcha', '/api/forgot-password',
  '/api/webauthn/login-options', '/api/webauthn/login-verify',
  '/api/captcha', '/api/check-username', '/api/security/status', '/api/security/ip-check',
  '/api/policies',
  '/api/bug-report',  // 允许未登录用户提交 bug 报告
  '/api/language/detect',  // 语言检测应公开可用
  '/api/version',  // 版本信息公开
  '/api/human-challenge',  // 人机挑战公开
  '/api/events',  // SSE 事件推送端点公开（用于热更新通知）
  '/api/security/dashboard',  // 安全仪表盘端点公开（终端看板脚本无状态访问）
]
app.use((req, res, next) => {
  const isPublic = PUBLIC_PATHS.some(p => req.path.startsWith(p))
  if (isPublic || req.path.startsWith('/api/appeal')) {
    return next()
  }
  authMiddleware(req, res, (err) => {
    if (err) return
    accountStatusMiddleware(req, res, next)
  })
})

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (req.path.startsWith('/src/')) return next();
    if (req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ===== 视频上传：临时目录 + 正式目录双层隔离 =====
// 正式目录只存放已通过魔数内容校验的合法视频；上传先落盘到临时目录，
// 内容校验通过后才改名移入正式目录（消除"先落盘、后校验、后删除"的时间窗口）。
// 临时目录独立于 /uploads 静态目录，恶意文件不会被公开服务。
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const UPLOAD_TMP_DIR = path.join(__dirname, '..', 'uploads_tmp');
// 启动时清空临时目录残留，避免异常中断遗留的未校验文件长期滞留
fs.rmSync(UPLOAD_TMP_DIR, { recursive: true, force: true });
for (const dir of [UPLOAD_DIR, UPLOAD_TMP_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 允许的视频扩展名白名单（第一道粗筛；真正的防线是落盘后的魔数内容校验）
const ALLOWED_VIDEO_EXTS = ['.webm', '.mp4', '.mkv', '.m4v', '.mov'];

const videoStorage = multer.diskStorage({
  // 先落盘到隔离的临时目录，扩展名与 /uploads 静态服务完全隔离
  destination: (req, file, cb) => cb(null, UPLOAD_TMP_DIR),
  filename: (req, file, cb) => {
    // 临时文件名强制使用安全扩展名 .bin，绝不采用攻击者可控的 originalname 扩展名
    const name = `bug-video-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`;
    cb(null, name);
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  // 第一道粗筛：MIME + 扩展名双白名单。两者皆可为客户端伪造，仅用于降低噪音，
  // 不承担安全责任；最终安全由 validateVideoFile 魔数校验 + 服务端扩展名决定。
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    const mimeOk = (file.mimetype || '').startsWith('video/');
    if (mimeOk && ALLOWED_VIDEO_EXTS.includes(ext)) return cb(null, true);
    return cb(new Error('仅允许上传合法的视频文件（webm/mp4/mkv/m4v/mov）'));
  }
});

// 提供视频静态访问（Bug 报告上传的视频）
// 安全规范：上传目录不得完全公开，必须经 authMiddleware 鉴权后才可访问
app.use('/uploads', authMiddleware, express.static(UPLOAD_DIR, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

// 安装蜜罐路由
// 静态蜜罐 — 引诱扫描器
for (const route of honeypotRouter) {
  app.all(route.path, route.handler);
}

// 动态蜜罐 — 响应式伪造端点（统一返回 404，不返回任何数据）
const dynamicHoneypotPaths = dynamicHoneypot.getActivePaths()
dynamicHoneypotPaths.forEach(path => {
  app.all(path, (req, res) => {
    const ip = getClientIP(req)
    const clientIp = ipReputation.resolveClientIP(req, ip)
    ipReputation.recordSignal(ip, 'HONEYPOT_HIT', 25, clientIp)
    requestTracker.record(ip, { fingerprint: req.headers['x-device-fingerprint'], path })
    return res.status(404).json({ success: false, message: 'Not Found' })
  })
})

// 实时请求统计 — 记录所有请求
app.use((req, res, next) => {
  const ip = getClientIP(req)
  requestTracker.record(ip, {
    ua: req.headers['user-agent'],
    fingerprint: req.headers['x-device-fingerprint'],
    path: req.path,
  })
  next()
});

// AI 决策引擎中间件 — 扩展覆盖范围
app.use((req, res, next) => {
  const ip = getClientIP(req);

  // AI 聊天端点无需安全决策，直接放行
  if (req.path.startsWith('/api/ai/chat')) { next(); return; }

  // 关键端点进行AI决策 — 扩展覆盖敏感操作
  const criticalPaths = [
    '/api/login', '/api/register', '/api/forgot-password', '/api/ai',
    '/api/user/export-data', '/api/user/delete-data', '/api/user/profile',
    '/api/user/change-password', '/api/user/update-settings',
    '/api/admin/', '/api/bug-report',
  ];
  if (!criticalPaths.some(p => req.path.startsWith(p))) { next(); return; }

  const stats = requestTracker.getContext(ip)

  // 对AI端点进行Prompt注入检测
  let promptInjectScore = 0
  if (req.path.startsWith('/api/ai') && req.body?.messages) {
    const threats = PromptGuard.analyze(req.body.messages)
    promptInjectScore = threats.reduce((max, t) => Math.max(max, t.score), 0)
  }

  const context = {
    ip,
    path: req.path,
    method: req.method,
    userId: req.headers.authorization?.slice(7),
    fingerprint: req.headers['x-device-fingerprint'] || null,
    honeypotTriggered: false,
    promptInjectScore,
    riskData: req.riskData || null,  // 前端行为信号
    behaviorRisk: req.riskData?.score || 0,
    ipReputation: Math.max(0, 100 - stats.failedLogins * 20 - stats.requestsPerMinute / 2),
    payloadSize: req.body ? Buffer.byteLength(JSON.stringify(req.body)) : 0,
    geoDistance: 0,
    isNewDevice: stats.uaSwitches > 0,
    unusualHour: (() => { const h = new Date().getHours(); return h < 6 || h > 23; })(),
    ...stats,
  };

  // 如果前端行为风险过高，直接提升威胁等级
  if (context.behaviorRisk >= 60) {
    context.ipReputation = Math.min(100, context.ipReputation + context.behaviorRisk / 2);
  }

  decisionEngine.decide(context).then(decision => {
    if (context.honeypotTriggered) {
      ipReputation.recordSignal(ip, 'CSS_HONEYPOT', 15)
    }
    if (context.promptInjectScore >= 60) {
      ipReputation.recordSignal(ip, 'PROMPT_INJECTION', 20)
    }

    const defenseActions = adaptiveDefense.evaluate(context, decision, decision.patterns)

    if (decision.action === 'BLOCK' || defenseActions.includes('ACTIVE_MITIGATION')) {
      ipReputation.recordSignal(ip, 'AI_BLOCKED', 10)
      return res.status(403).json({
        success: false,
        message: 'AI安全系统检测到异常行为，请求已被拦截',
        code: 'AI_BLOCKED',
        decisionId: decision.id,
      });
    }
    if (decision.action === 'CHALLENGE') {
      req.securityChallenge = true;
    }

    if (decision.action === 'CHALLENGE' || defenseActions.includes('RATE_LIMIT_STRICT')) {
      ipReputation.recordSignal(ip, 'AI_CHALLENGED', 5)
    }
    next();
  }).catch(() => next());
});

function validateFields(body, requiredFields) {
  const missing = []
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(field)
    }
  }
  if (missing.length > 0) {
    return `缺少必填字段: ${missing.join(', ')}`
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return '邮箱格式不正确'
  }
  if (body.password && body.password.length < 8) {
    return '密码长度不能少于8位'
  }
  if (body.password && !/[A-Z]/.test(body.password)) {
    return '密码需要包含大写字母'
  }
  if (body.password && !/[0-9]/.test(body.password)) {
    return '密码需要包含数字'
  }
  if (body.password && !/[^A-Za-z0-9]/.test(body.password)) {
    return '密码需要包含特殊字符'
  }
  if (body.username && (body.username.length < 2 || body.username.length > 30)) {
    return '用户名长度应在2-30个字符之间'
  }
  return null
}

// 全局 API 限流：默认 15 分钟 600 次（约 40 次/分钟），可通过环境变量覆盖
const API_LIMIT_MAX = parseInt(process.env.API_LIMIT_MAX || '600', 10) || 600;
const apiLimiter = await createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: API_LIMIT_MAX,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = await createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: '登录失败次数过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = await createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: '密码重置请求过于频繁，请1小时后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 重置密码提交限流：防止暴力破解验证码，15 分钟内最多 10 次尝试
const resetPasswordVerifyLimiter = await createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: '重置密码尝试过于频繁，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 普通验证码接口限流：支持多种类型切换/刷新，预留足够余量（可通过环境变量覆盖）
const CAPTCHA_LIMIT_MAX = parseInt(process.env.CAPTCHA_LIMIT_MAX || '30', 10) || 30;
const captchaLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: CAPTCHA_LIMIT_MAX,
  message: { success: false, message: '验证码请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 安全规范：管理员验证码接口必须执行更严格限流（每分钟最多 5 次）
const adminCaptchaLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: '验证码请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== CRUD 接口基线限流 =====
// 军工级：所有读写接口必须有基线限流，防止滥用
const crudReadLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const crudWriteLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: '操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const postLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: '发帖过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const commentLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: '评论过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const surveyLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: '问卷操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const bugReportLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Bug 报告提交过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 自动检测的 bug 报告使用独立限流，允许更高频率
const autoBugReportLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: '自动报告提交过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiChatLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'AI 对话请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 健康检查接口单独限流：前端轮询场景多，避免触发全局限流
const HEALTH_LIMIT_MAX = parseInt(process.env.HEALTH_LIMIT_MAX || '300', 10) || 300;
const healthLimiter = await createRateLimiter({
  windowMs: 60 * 1000,
  max: HEALTH_LIMIT_MAX,
  message: { success: false, message: '健康检查请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLoginLimiter = await createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { success: false, message: '管理员登录失败次数过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = await createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: '注册过于频繁，请1小时后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 健康检查接口先单独限流
app.use('/api/health', healthLimiter);
app.use('/api/ping', healthLimiter);

// 全局 API 限流 — 作为兜底，跳过已有专门限流的路由
const SKIP_LIMITER_PATHS = [
  '/api/health', '/api/ping',
  '/api/login', '/api/register',
  '/api/admin/login', '/api/admin/captcha',
  '/api/forgot-password', '/api/reset-password',
  '/api/captcha',
  '/api/ai/chat', '/api/ai/chat/stream', '/api/ai/search',
  '/api/bug-report', '/api/bug-reports',
  '/api/surveys', '/api/notifications',
  '/api/posts', '/api/comments',
  '/api/courses', '/api/words', '/api/grammar',
  '/api/listening', '/api/progress', '/api/achievements',
];
app.use('/api/', (req, res, next) => {
  // 跳过已有专门限流的路由，避免双重限流
  if (SKIP_LIMITER_PATHS.some(p => req.path.startsWith(p))) {
    next();
    return;
  }
  apiLimiter(req, res, next);
});
app.use('/api/login', authLimiter);
app.use('/api/register', registerLimiter);
app.use('/api/admin/login', adminLoginLimiter);
app.use('/api/admin/captcha', adminCaptchaLimiter);
app.use('/api/forgot-password', passwordResetLimiter);
app.use('/api/reset-password', resetPasswordVerifyLimiter);
// 验证码相关路由统一由 app.use('/api/captcha', captchaLimiter) 限流，避免与路由级 limiter 重复叠加
app.use('/api/captcha', captchaLimiter);

// ===== CRUD 接口基线限流 =====
// 军工级：所有读写接口必须有基线限流，防止滥用
app.use('/api/courses', crudReadLimiter);
app.use('/api/words', crudReadLimiter);
app.use('/api/grammar', crudReadLimiter);
app.use('/api/listening', crudReadLimiter);
app.use('/api/progress', crudReadLimiter);
app.use('/api/achievements', crudReadLimiter);
app.use('/api/ai/chat', aiChatLimiter);
app.use('/api/ai/chat/stream', aiChatLimiter);
app.use('/api/ai/search', aiChatLimiter);

// 写操作使用更严格的限流
// 手动提交的 bug 报告限流 5 次/分钟，自动检测的限流 20 次/分钟
app.use('/api/bug-report', (req, res, next) => {
  if (req.body?.autoDetected) {
    return autoBugReportLimiter(req, res, next)
  }
  return bugReportLimiter(req, res, next)
});
app.use('/api/bug-reports', bugReportLimiter);
app.use('/api/surveys', surveyLimiter);
app.use('/api/notifications', crudWriteLimiter);
app.use('/api/posts', postLimiter);
app.use('/api/posts/:id/like', crudWriteLimiter);
app.use('/api/posts/:id/comments', commentLimiter);
app.use('/api/user/export-data', crudWriteLimiter);

// ===== 管理员接口默认安全门 =====
// 除白名单外，所有 /api/admin/* 请求必须先通过认证 + 二次身份验证。
// 该门位于所有 admin 路由之前，确保后续无论是否显式加中间件都无法绕过。
const ADMIN_GATE_EXEMPT_PATHS = new Set([
  '/api/admin/login',
  '/api/admin/login-step1',
  '/api/admin/login-step2',
  '/api/admin/captcha',
  '/api/admin/reauth',
  '/api/admin/2fa/status',
  // 2FA 绑定发生在二次验证启用之前，应在已认证管理员角色校验下放行（见 admin.js 中 requireAdmin）
  '/api/admin/2fa/setup',
  '/api/admin/2fa/verify',
]);

function adminSecurityGate(req, res, next) {
  // 使用 originalUrl 确保匹配完整路径（不受挂载点影响）
  const path = req.originalUrl.split('?')[0];
  if (ADMIN_GATE_EXEMPT_PATHS.has(path)) {
    return next();
  }
  authMiddleware(req, res, (err) => {
    if (err) return next(err);
    // 军工级：管理员接口可选/强制 mTLS 客户端证书认证
    requireAdminClientCertificate()(req, res, (mtlsErr) => {
      if (mtlsErr) return next(mtlsErr);
      requireAdminReauth(req, res, next);
    });
  });
}

// 军工级动态策略引擎：在管理员路由之前执行运行时访问策略
app.use('/api/admin', dynamicPolicyMiddleware(accessPolicyEngine, { blockElevate: true }));
app.use('/api/admin', adminSecurityGate);

// 会员/付费墙路由：启用服务端会员校验，避免仅依赖前端付费状态
app.use('/api/membership', createMembershipRouter({ usersDB, authMiddleware, requireAdmin }));

// ===== 认证中间件 =====
function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, message: '未登录或令牌已过期' });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: '令牌无效或已过期' });
  }
  // 检查令牌是否被吊销
  if (isTokenRevokedSync(token)) {
    return res.status(401).json({ success: false, message: '令牌已被吊销' });
  }
  // 设备指纹校验：token 绑定了指纹时，要求当前请求的客户端特征一致，
  // 防止被盗 token 在其它浏览器/设备上重放（IP 分量已剔除，避免误锁）。
  if (decoded.deviceFingerprint) {
    const currentFingerprint = getDeviceFingerprint(req);
    if (currentFingerprint !== decoded.deviceFingerprint) {
      logAudit({
        userId: decoded.userId,
        action: 'device_fingerprint_mismatch',
        req,
        details: 'token 设备指纹与当前请求不一致，疑似 token 被跨设备复用',
        success: false,
      });
      return res.status(401).json({
        success: false,
        code: 'DEVICE_FINGERPRINT_MISMATCH',
        message: '检测到设备变化，请重新登录',
      });
    }
  }
  req.tokenPayload = decoded;
  req.user = usersDB.get(decoded.userId) || null;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.tokenPayload) {
    return res.status(401).json({ success: false, message: '未登录' });
  }
  const user = usersDB.get(req.tokenPayload.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '无权访问' });
  }
  req.user = user;
  next();
}

// 强化版管理员门禁：在 requireAdmin 角色校验之上，叠加 mTLS 客户端证书认证。
// 用于 /api/admin 之外、"仅靠 requireAdmin" 的管理员接口（logs/bug-reports/surveys/security dashboard），
// 堵住"本机沦陷后仅凭 admin JWT 即可越权"的提权链。mTLS 未启用时 fail-open，不影响现有流程。
function adminClientCertGate(req, res, next) {
  requireAdmin(req, res, (err) => {
    if (err) return next(err);
    requireAdminClientCertificate()(req, res, next);
  });
}

// ===== 可选认证中间件（不阻断未登录请求） =====
function optionalAuthMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return next();
  const decoded = verifyToken(token);
  if (decoded) {
    req.tokenPayload = decoded;
    req.user = usersDB.get(decoded.userId) || null;
  }
  next();
}

// ===== 调用 AI 模型（含 Provider 自动切换） =====
async function callAiModelWithFallback(messages, options = {}) {
  const content = await aiConfigurator.call(messages, options);
  const provider = aiConfigurator.getCurrentProvider();
  return {
    response: {
      json: async () => ({
        choices: [{ message: { content } }],
      }),
    },
    provider,
    model: options.model || 'default',
  };
}

// ===== 管理员完整性守卫 =====
// 军工级：自动检测并立即删除未通过验证流程创建的管理员账号
// 白名单预置系统管理员 admin-1，其余管理员须经完整验证链创建后登记
const adminIntegrityGuard = createAdminIntegrityGuard({
  usersDB,
  saveUsers,
  verifiedAdminIds: new Set(['admin-1']),
  dataDir: DATA_DIR,
});

// ===== 路由模块挂载 =====
// 将内联路由处理逻辑抽取到独立的模块文件中，通过工厂函数模式共享依赖
app.use('/api', createAuthRouter({
  usersDB, sessionsDB, loginHistoryDB, passwordResetTokens,
  revokedAccessTokens, revokedRefreshTokens, captchaStore, loginFailureStore,
  validate, registerSchema, loginSchema, humanVerificationMiddleware,
  requireTurnstile, requirePoWChallenge, logAudit, getClientIP,
  ACCOUNT_STATUS, evaluateRegistrationRisk, createUserRiskProfile,
  recordRiskEvent, getLoginSecurityWarnings, addMeritPoints,
  checkTempBanExpiry, updateRiskFromBehavior, getDeviceFingerprint,
  verifyImageCaptcha, requestTracker, ipReputation, outboundFilter,
  getJwtSecret, getJwtRefreshSecret, KEY_VERSION, REFRESH_KEY_VERSION,
  authMiddleware,
}));
app.use('/api', createAdminRouter({
  usersDB, sessionsDB, revokedAccessTokens, revokedRefreshTokens,
  adminCaptchaStore, adminTOTPSecrets, adminTrust, surveys,
  outboundFilter, ADMIN_IP_WHITELIST, authMiddleware, requireAdmin,
  adminLoginLimiter, getJwtSecret, getJwtRefreshSecret, KEY_VERSION,
  REFRESH_KEY_VERSION, DEVICE_FINGERPRINT_PEPPER, IS_DEV,
  readEncryptedJSON, writeEncryptedJSON, DATA_DIR,
  saveUsers, ADMIN_CREATE_SECRET,
  adminIntegrityGuard,
}));
app.use('/api', createSecurityRouter({
  usersDB, sessionsDB, authMiddleware, adminClientCertGate, requireAdminReauth,
  getClientIP, logAudit, getIPRisk, invalidateUserSessions,
  getSecurityOverview, getRiskEvents, markRiskEventsRead,
  generateRiskChallenge, verifyRiskChallenge, ACCOUNT_STATUS,
  checkTempBanExpiry, generateAntiOcrNoise, getCurrentPolicy,
  needsAcceptance, getUserAcceptance, getAdaptiveDifficulty,
  getAccountStatusForUser, getUnreadRiskEventCount,
  createHumanChallenge, verifyHumanChallenge, generateNumericCaptcha, generateMathCaptcha,
  generateRotateCaptcha, generateSequenceCaptcha, generateAudioCaptcha,
  getImageCaptchaStats, ipReputation, requestTracker,
  publicLimiter, captchaLimiter,
  connectionTracker,
  getRuntimeSecurityStatus,
  getRuntimeGuardViolations,
  getAuditLog,
  getGovernorStatus,  // 性能调控器
  getResourceShieldStatus,  // 资源护盾
}));
app.use('/api', createAiRouter({
  authMiddleware, requireAdmin, usersDB, logAudit, getClientIP,
  checkAiChatAccess, incrementAiChatUsage, callAiModelWithFallback,
}));
app.use('/api', createContentRouter({
  authMiddleware, apiLimiter, crudReadLimiter, usersDB, sessionsDB,
  twoFactorSecrets, loginHistoryDB, logAudit, getClientIP,
  deleteUserData: deleteUserResidualData,
  mockCourses, mockWords, mockGrammarExercises, mockProgress, mockAchievements,
}));
app.use('/api', createEventsRouter({
  express, authMiddleware, adminClientCertGate, publicLimiter, csrfTokenLimiter, healthLimiter,
  sseMiddleware, broadcastVersionUpdate, setVersionInfo, getVersionInfo, getSSEStats,
  path, fs, generateCsrfToken, os, server,
  getAuditLog, getAuditLogStats,
}));
app.use('/api', createBugReportRouter({
  express, authMiddleware, adminClientCertGate, optionalAuthMiddleware,
  bugReportLimiter, usersDB, videoUpload, readEncryptedFile, writeEncryptedFile,
  DATA_DIR, UPLOAD_DIR, logAudit, getClientIP, encrypt, decrypt, hasEncryptionKey,
}));
app.use('/api', createSurveyRouter({
  express, authMiddleware, adminClientCertGate, requireAdminReauth,
  surveyLimiter, surveys, notifications: [], usersDB,
  readEncryptedFile, writeEncryptedFile, DATA_DIR, logAudit,
  getClientIP, encrypt, decrypt, hasEncryptionKey,
}));

function seedAdmin() {
  const adminId = 'admin-1';
  // ADMIN_PASSWORD_HASH 已经是 bcrypt 哈希，直接写入，避免二次哈希
  if (!usersDB.has(adminId)) {
    usersDB.set(adminId, {
      id: adminId,
      username: '系统管理员',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD_HASH,
      avatar: 'https://i.pravatar.cc/150?img=68',
      level: 'advanced',
      createdAt: '2024-01-01T00:00:00Z',
      xp: 99999,
      totalXP: 99999,
      streakDays: 365,
      longestStreak: 365,
      dailyGoal: 60,
      reminderTime: '08:00',
      theme: 'light',
      language: 'zh',
      followers: [],
      following: [],
      role: 'admin'
    });
    console.log('[Seed] 管理员账户已创建: admin@lingualeap.com');
  } else {
    // 开发环境：若管理员密码哈希已轮换，自动同步到数据库
    const existing = usersDB.get(adminId);
    if (existing.password !== ADMIN_PASSWORD_HASH) {
      existing.password = ADMIN_PASSWORD_HASH;
      usersDB.set(adminId, existing);
      console.log('[Seed] 管理员密码哈希已同步更新');
    }
  }
  // 安全规范：管理员密码来源已通过启动校验保证，此处不再输出任何密码信息
}

app.use(getSentryErrorHandler());
// 军工级：全局错误响应归一化 — 使用 AppError 中间件
// 统一响应格式：{ success: false, message, code, requestId }
// 生产环境自动剥离堆栈、内部路径、模块信息
app.use(errorHandler);

// 军工级网络边界：配置 TLS 1.3 安全服务端（生产环境强制 HTTPS）
function createSecureServer(requestHandler) {
  const keyFile = process.env.HTTPS_KEY_FILE;
  const certFile = process.env.HTTPS_CERT_FILE;
  const caFile = process.env.HTTPS_CA_FILE;

  // 反向代理终结 TLS 模式（Render / Nginx / Caddy 等托管平台）：
  // 外部 HTTPS 由平台反向代理终结，后端在内部以 HTTP 运行。
  // 仍强制 trust proxy + HTTPS 重定向 + X-Forwarded-Proto 校验，保留全部安全头。
  const proxyTerminatedTls = process.env.TRUST_PROXY === 'true' || process.env.RENDER === 'true';

  if (process.env.NODE_ENV === 'production') {
    if (keyFile && certFile) {
      const tlsOptions = createSecureTlsOptions({
        key: fs.readFileSync(keyFile),
        cert: fs.readFileSync(certFile),
        ...(caFile ? { ca: fs.readFileSync(caFile) } : {}),
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        requestCert: process.env.ADMIN_MTLS_REQUIRED === 'true',
        rejectUnauthorized: false, // 由 mtlsMiddleware 做细粒度校验，避免链校验失败直接断开
      });
      if (!tlsOptions.ok) {
        console.error('[FATAL-NETWORK] TLS 配置不安全:', tlsOptions.error);
        process.exit(1);
      }
      return https.createServer(tlsOptions.options, requestHandler);
    }

    // 未提供本地证书：仅当处于受信任反向代理后时允许 HTTP 运行（代理终结 TLS）
    if (!proxyTerminatedTls) {
      console.error(
        '[FATAL-NETWORK] 生产环境必须配置 HTTPS_KEY_FILE 与 HTTPS_CERT_FILE，' +
        '或设置 TRUST_PROXY=true 以由受信任反向代理（Render/Nginx 等）终结 HTTPS。'
      );
      process.exit(1);
    }
    console.warn('[Network] 生产模式：TLS 由受信任反向代理终结（TRUST_PROXY=true），后端以 HTTP 监听内部端口');
    return null;
  }

  // 开发环境：如果提供了证书则启用 HTTPS，否则降级为 HTTP（仅开发）
  if (keyFile && certFile) {
    const tlsOptions = createSecureTlsOptions({
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
      ...(caFile ? { ca: fs.readFileSync(caFile) } : {}),
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
    });
    if (tlsOptions.ok) {
      console.log('[Network] 开发环境启用 HTTPS（TLS 1.2/1.3）');
      return https.createServer(tlsOptions.options, requestHandler);
    }
    console.warn('[Network] TLS 配置校验失败，降级为 HTTP:', tlsOptions.error);
  }
  return null;
}

// 优雅关闭：处理 SIGTERM/SIGINT（防止 hot-reload/重启时端口不释放）
// server 已在第 1201 行声明
const secureServer = createSecureServer(app);
if (secureServer) {
  server = secureServer;
} else {
  server = app;
}

// ===== DoS 防护：服务端超时配置 =====
// 防止资源耗尽攻击：大body、慢速请求、连接堆积
server.timeout = 30000;           // 请求总超时 30s
server.headersTimeout = 10000;    // 请求头超时 10s
server.keepAliveTimeout = 5000;   // Keep-Alive 超时 5s
server.maxHeadersCount = 100;     // 最大请求头数量
server.requestTimeout = 15000;    // 请求体/响应超时 15s

// 资源护盾 — TimeoutGuard：请求超时自动断开
app.use(timeoutGuardMiddleware);

const __SERVER_START__ = Date.now();
server.listen(PORT, async () => {
  await adminTrust.load().catch(err => console.warn('[AdminTrust] 加载持久化数据失败:', err.message));
  
  // 初始化 SQLite 数据库
  try {
    const { initDatabase, getDBStats } = await import('./database/db.js');
    await initDatabase();
    const dbStats = getDBStats();
    console.log(`[DB] SQLite 数据库已就绪 (${dbStats.totalRows} 行数据, ${dbStats.fileSizeKB} KB)`);
  } catch (e) {
    console.warn('[DB] SQLite 初始化失败（降级为加密 JSON 存储）:', e.message);
  }

  // 从加密文件加载持久化用户数据（注册用户等）
  try {
    const persistedUsers = readEncryptedJSON('users.json', []);
    if (Array.isArray(persistedUsers) && persistedUsers.length > 0) {
      for (const u of persistedUsers) {
        if (!usersDB.has(u.id)) {
          usersDB.set(u.id, u);
        }
      }
      console.log(`[Seed] 已加载 ${persistedUsers.length} 个持久化用户`);
    }
  } catch (e) {
    console.warn('[Seed] 加载持久化用户数据失败:', e.message);
  }
  seedAdmin();

  // 军工级：启动管理员完整性守卫（自动删除未授权管理员账号）
  try {
    adminIntegrityGuard.start(parseInt(process.env.ADMIN_GUARD_INTERVAL_MS || '30000', 10) || 30000);
  } catch (e) {
    console.warn('[AdminGuard] 启动失败:', e.message);
  }

  // 军工级：启动时统计账户规模与注册明细，便于运维核对是否存在异常账号/管理员
  try {
    const allUsers = Array.from(usersDB.values());
    const totalUsers = allUsers.length;
    const adminCount = allUsers.filter(u => u && u.role === 'admin').length;
    console.log(`[Seed] 账户统计: 共 ${totalUsers} 个用户, ${adminCount} 个管理员`);
    if (adminCount > 1) {
      console.warn(`[Seed] ⚠️ 检测到 ${adminCount} 个管理员账号，请核对是否为预期配置`);
    }
    // 注册明细：按注册时间倒序，标注角色和注册时间
    const fmtTime = (iso) => {
      if (!iso) return '未知';
      try {
        return new Date(iso).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch { return iso; }
    };
    const sorted = [...allUsers].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    console.log('[Seed] 注册用户明细 (新→旧):');
    for (const u of sorted) {
      const roleTag = u.role === 'admin' ? '管理员' : '用户';
      console.log(`  - ${u.username} <${u.email}> [${roleTag}] 注册于 ${fmtTime(u.createdAt)}`);
    }
  } catch (e) {
    console.warn('[Seed] 账户统计失败:', e.message);
  }
  try {
    buildBaseline();
    const integrity = verifyIntegrity();
    if (integrity.changes > 0) {
      console.warn(`[FileGuardian] ⚠️ 检测到 ${integrity.changes} 个文件变更`);
    }
  } catch (e) {
    console.warn('[FileGuardian] 初始化跳过:', e.message);
  }

  // 军工级：启动密钥自动轮换调度器（生产环境强制，开发环境静默）
  try {
    const rotationResult = startKeyRotationScheduler();
    if (rotationResult) {
      console.log(`[KeyRotation] 密钥轮换调度器已启动，周期: ${rotationResult.intervalDays} 天`);
    }
  } catch (e) {
    const msg = `密钥轮换调度器启动失败: ${e.message}`;
    if (process.env.NODE_ENV === 'production') {
      console.error(`[FATAL-SECURITY] ${msg}`);
      // 生产环境：密钥轮换失败不应阻塞启动，但必须告警
    } else {
      console.warn(`[KeyRotation] ${msg}`);
    }
  }

  // 设置版本信息并广播热更新通知（所有已连接的 SSE 客户端将收到推送）
  // 使用延迟广播：等待前端 SSE 重连后自动推送，最多重试 10 秒
  try {
    const version = process.env.npm_package_version || '1.0.0'
    setVersionInfo(version, process.env.BUILD_TIME)

    // 读取 version.json 中的更新日志
    let changelog = []
    try {
      const versionJsonPath = path.join(process.cwd(), 'public', 'version.json')
      if (fs.existsSync(versionJsonPath)) {
        const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
        changelog = data.changelog || []
      }
    } catch {}

    // 立即广播一次（给已经连接的客户端）
    broadcastVersionUpdate({ forceUpdate: false, changelog })
    console.log(`[HMR] 首次广播完成: ${version}`)

    // 延迟广播：等待新客户端连接后重试（最多 10 秒）
    delayedBroadcastVersionUpdate({
      forceUpdate: false,
      changelog,
      maxRetries: 10,
      retryDelay: 1000,
    })
  } catch (e) {
    console.warn('[HMR] 版本广播失败:', e.message)
  }

  const protocol = secureServer ? 'https' : 'http';
  logger.info(`API Server is running at ${protocol}://localhost:${PORT}`);

  // 炫酷启动横幅：服务完全就绪后展示（原生 stdout 输出，保留 ANSI 颜色）
  const startedAt = Date.now() - __SERVER_START__;
  const banner = printBanner({
    port: PORT,
    protocol,
    env: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    startedAt,
  });
  process.stdout.write('\n' + banner + '\n');
});

function gracefulShutdown(signal) {
  console.log(`[Server] 收到 ${signal}，正在优雅关闭...`);
  // 停止密钥轮换调度器
  try {
    stopKeyRotationScheduler();
    console.log('[KeyRotation] 密钥轮换调度器已停止');
  } catch (e) {
    // 忽略关闭时的错误
  }
  server.close(() => {
    process.exit(0);
  });
  // 强制退出：给 5 秒时间清理
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Fatal] 未捕获异常:', err.message);
  console.error(err.stack);
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] 未处理的 Promise 拒绝:', reason);
});