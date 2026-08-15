// ===== 管理员路由模块 =====
// 从 api/index.js 中提取，通过工厂函数方式接收共享依赖

import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import svgCaptcha from 'svg-captcha';

import {
  logAudit,
  getClientIP,
  requireAdminReauth,
  requireFreshAdminReauth,
  createWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  createWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  getWebAuthnStatus,
  removeWebAuthnCredential,
  hasAdminClientCertificate,
  getAdminClientCertificates,
  registerAdminClientCertificate,
  revokeAdminClientCertificate,
  isMtlsEnabled,
  isMtlsRequiredForAdmin,
  getAllAppeals,
  reviewAppeal,
  getAllBanApprovals,
  getPendingBanApprovals,
  createBanApproval,
  reviewBanApproval,
  APPEAL_STATUS,
  ACCOUNT_STATUS,
  getRiskProfile,
  updateRiskStatus,
  requireTurnstile,
  generateAntiOcrNoise,
} from '../security/index.js';

import {
  evaluateRisk,
  getTrustedDevices,
  removeTrustedDevice,
} from '../adminSecurity.js';

import { isEmailConfigured } from '../emailService.js';

/**
 * 创建管理员路由路由器
 * @param {Object} deps - 共享依赖
 * @param {Map} deps.usersDB - 用户数据库 Map
 * @param {Map} deps.sessionsDB - 会话数据库 Map
 * @param {Map} deps.revokedAccessTokens - 已吊销 Access Token Map
 * @param {Map} deps.revokedRefreshTokens - 已吊销 Refresh Token Map
 * @param {Map} deps.adminCaptchaStore - 管理员验证码存储
 * @param {Map} deps.adminTOTPSecrets - 管理员 TOTP 密钥存储
 * @param {Object} deps.adminTrust - AdminTrust 实例
 * @param {Array} deps.surveys - 问卷数据
 * @param {Object} deps.outboundFilter - OutboundFilter 实例
 * @param {string[]} deps.ADMIN_IP_WHITELIST - 管理员 IP 白名单
 * @param {Function} deps.authMiddleware - 认证中间件
 * @param {Function} deps.requireAdmin - 管理员角色中间件
 * @param {Function} deps.adminLoginLimiter - 登录限流器
 * @param {Function} deps.getJwtSecret - 获取 JWT 密钥
 * @param {Function} deps.getJwtRefreshSecret - 获取 JWT 刷新密钥
 * @param {string} deps.KEY_VERSION - JWT 密钥版本
 * @param {string} deps.REFRESH_KEY_VERSION - JWT 刷新密钥版本
 * @param {string} deps.DEVICE_FINGERPRINT_PEPPER - 设备指纹胡椒
 * @param {boolean} deps.IS_DEV - 是否为开发环境
 * @param {Function} deps.readEncryptedJSON - 读取加密 JSON
 * @param {Function} deps.writeEncryptedJSON - 写入加密 JSON
 * @param {string} deps.DATA_DIR - 数据目录
 */
export function createAdminRouter(deps) {
  const router = express.Router();

  const {
    usersDB,
    sessionsDB,
    revokedAccessTokens,
    revokedRefreshTokens,
    adminCaptchaStore,
    adminTOTPSecrets,
    adminTrust,
    surveys,
    outboundFilter,
    ADMIN_IP_WHITELIST,
    authMiddleware,
    requireAdmin,
    adminLoginLimiter,
    getJwtSecret,
    getJwtRefreshSecret,
    KEY_VERSION,
    REFRESH_KEY_VERSION,
    DEVICE_FINGERPRINT_PEPPER,
    IS_DEV,
    readEncryptedJSON,
    writeEncryptedJSON,
    DATA_DIR,
    saveUsers,
    ADMIN_CREATE_SECRET,
    adminIntegrityGuard,
  } = deps;

  // ===== 辅助函数 =====

  function sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
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
    const maxAge = parseInt(process.env.JWT_ACCESS_EXPIRES_IN_MS || '900000', 10);
    res.cookie('access_token', token, getCookieOptions(maxAge, true));
  }

  function setRefreshTokenCookie(res, token) {
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    res.cookie('refresh_token', token, getCookieOptions(maxAge, true));
  }

  function getTokenFromRequest(req) {
    if (req.cookies?.access_token) return req.cookies.access_token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
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

  function getDeviceFingerprint(req) {
    // 与 index.js getDeviceFingerprint 保持一致：剔除 IP，仅用稳定客户端特征
    const ua = req.headers['user-agent'] || '';
    const lang = req.headers['accept-language'] || '';
    const platform = req.headers['sec-ch-ua-platform'] || '';
    const mobile = req.headers['sec-ch-ua-mobile'] || '';
    const raw = `${ua}|${lang}|${platform}|${mobile}|${DEVICE_FINGERPRINT_PEPPER}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

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
    } else if (/Safari/.test(ua)) {
      const m = ua.match(/Version\/(\d+)/);
      browser = m ? `Safari ${m[1]}` : 'Safari';
    }
    return { device, browser, os };
  }

  // ======================================================================
  // 路由：管理员图形验证码
  // ======================================================================

  router.get('/admin/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
      size: 6,
      ignoreChars: '0o1il',
      noise: 7,
      color: true,
      background: '#faf8f5',
      width: 160,
      height: 52,
    });
    // 注入抗 OCR 干扰
    const antiOcr = generateAntiOcrNoise(160, 52, 1.0);
    const svg = captcha.data.replace('</svg>', antiOcr + '</svg>');
    const id = crypto.randomUUID();
    adminCaptchaStore.set(id, { code: captcha.text.toLowerCase(), expires: Date.now() + 3 * 60 * 1000 });
    res.json({ success: true, captchaId: id, svg: svg });
  });

  // ======================================================================
  // 路由：管理员 2FA
  // ======================================================================

  router.post('/admin/2fa/setup', authMiddleware, requireAdmin, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    const secretObj = speakeasy.generateSecret({ length: 20, name: `LinguaLeap Admin (${user.email})` });
    adminTOTPSecrets.set(req.tokenPayload.userId, { secret: secretObj.base32, verified: false });
    res.json({ success: true, secret: secretObj.base32, otpauth: secretObj.otpauth_url });
  });

  router.post('/admin/2fa/verify', authMiddleware, requireAdmin, adminLoginLimiter, (req, res) => {
    const { code } = req.body;
    if (!code || code.length !== 6) {
      res.status(400).json({ success: false, message: '验证码格式错误' });
      return;
    }
    const stored = adminTOTPSecrets.get(req.tokenPayload.userId);
    if (!stored) {
      res.status(400).json({ success: false, message: '请先获取TOTP密钥' });
      return;
    }
    const isValid = speakeasy.totp.verify({ secret: stored.secret, encoding: 'base32', token: code, window: 1 });
    if (!isValid) {
      res.status(400).json({ success: false, message: '验证码无效' });
      return;
    }
    stored.verified = true;
    const user = usersDB.get(req.tokenPayload.userId);
    if (user) user.adminTotpEnabled = true;
    res.json({ success: true, message: 'TOTP绑定成功' });
  });

  router.get('/admin/2fa/status', authMiddleware, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可访问' });
    }
    res.json({ success: true, enabled: !!user?.adminTotpEnabled });
  });

  // ======================================================================
  // 路由：管理员已知设备管理
  // ======================================================================

  router.get('/admin/trusted-devices', authMiddleware, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    res.json({ success: true, data: getTrustedDevices(req.tokenPayload.userId) });
  });

  router.delete('/admin/trusted-devices/:deviceId', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    const removed = removeTrustedDevice(req.tokenPayload.userId, req.params.deviceId);
    if (!removed) {
      res.status(404).json({ success: false, message: '设备不存在' });
      return;
    }
    res.json({ success: true, message: '设备已删除' });
  });

  // ======================================================================
  // 路由：WebAuthn / FIDO2 管理员凭证管理
  // ======================================================================

  router.get('/admin/webauthn/status', authMiddleware, async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    try {
      const status = await getWebAuthnStatus(req.tokenPayload.userId);
      res.json({ success: true, data: status });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  router.post('/admin/webauthn/register-options', authMiddleware, requireFreshAdminReauth(), async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    try {
      const options = await createWebAuthnRegistrationOptions(user.id, user.email, user.username);
      res.json({ success: true, data: options });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  router.post('/admin/webauthn/register-verify', authMiddleware, requireFreshAdminReauth(), async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    try {
      const result = await verifyWebAuthnRegistration(user.id, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, code: err.code || 'WEBAUTHN_ERROR', message: err.message });
    }
  });

  router.delete('/admin/webauthn/credentials/:credentialId', authMiddleware, requireAdminReauth, async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const ok = await removeWebAuthnCredential(user.id, req.params.credentialId);
    if (!ok) {
      return res.status(404).json({ success: false, message: '凭证不存在' });
    }
    res.json({ success: true, message: '凭证已删除' });
  });

  // ======================================================================
  // 路由：mTLS 客户端证书管理
  // ======================================================================

  router.get('/admin/mtls/status', authMiddleware, async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const cert = req.socket?.getPeerCertificate?.();
    const hasCert = await hasAdminClientCertificate(user.id);
    res.json({
      success: true,
      data: {
        mtlsEnabled: isMtlsEnabled(),
        mtlsRequired: isMtlsRequiredForAdmin(),
        hasCertificate: hasCert,
        clientCertPresent: !!(cert && cert.fingerprint256),
      },
    });
  });

  router.get('/admin/mtls/certificates', authMiddleware, async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const list = await getAdminClientCertificates(user.id);
    res.json({ success: true, data: list });
  });

  router.post('/admin/mtls/register', authMiddleware, requireFreshAdminReauth(), async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const cert = req.socket?.getPeerCertificate?.();
    if (!cert || !cert.fingerprint256) {
      return res.status(400).json({ success: false, message: '未检测到客户端证书' });
    }
    try {
      const result = await registerAdminClientCertificate(user.id, cert, { name: req.body.name, req });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, code: err.code || 'MTLS_ERROR', message: err.message });
    }
  });

  router.post('/admin/mtls/revoke', authMiddleware, requireAdminReauth, async (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const { fingerprint } = req.body;
    if (!fingerprint) {
      return res.status(400).json({ success: false, message: '缺少证书指纹' });
    }
    const ok = await revokeAdminClientCertificate(user.id, fingerprint);
    if (!ok) {
      return res.status(404).json({ success: false, message: '证书不存在' });
    }
    res.json({ success: true, message: '证书已吊销' });
  });

  // ======================================================================
  // 路由：管理员账号申诉审核
  // ======================================================================

  router.get('/admin/appeals', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    const status = req.query.status && req.query.status !== 'all' ? req.query.status : undefined;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const appeals = getAllAppeals({ status, page, limit });
    res.json({
      success: true,
      data: appeals.data,
      total: appeals.total,
      page: appeals.page,
      limit: appeals.limit,
    });
  });

  router.post('/admin/appeals/:id/review', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    const { decision, reviewNote } = req.body;
    if (!Object.values(APPEAL_STATUS).includes(decision)) {
      res.status(400).json({ success: false, message: '无效的审核决定' });
      return;
    }
    const appeal = reviewAppeal(req.params.id, { decision, reviewNote, reviewedBy: user.id });
    if (!appeal) {
      res.status(404).json({ success: false, message: '申诉不存在' });
      return;
    }
    logAudit({ userId: user.id, action: 'appeal_reviewed', req, details: `审核申诉 ${appeal.id} 为 ${decision}`, success: true });
    res.json({ success: true, data: appeal });
  });

  // ======================================================================
  // 路由：管理员用户账号状态管理
  // ======================================================================

  router.get('/admin/users/:id/status', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    const targetUser = usersDB.get(req.params.id);
    if (!targetUser) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }
    const riskProfile = getRiskProfile(targetUser.id);
    const accountStatus = targetUser.accountStatus || riskProfile?.status || 'normal';
    res.json({
      success: true,
      data: {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
        accountStatus,
      },
    });
  });

  router.post('/admin/users/:id/status', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    const { status, reason } = req.body;
    if (!Object.values(ACCOUNT_STATUS).includes(status)) {
      res.status(400).json({ success: false, message: '无效的账号状态' });
      return;
    }
    const targetUser = usersDB.get(req.params.id);
    if (!targetUser) {
      res.status(404).json({ success: false, message: '用户不存在' });
      return;
    }
    targetUser.accountStatus = status;
    updateRiskStatus(targetUser.id, status, reason || '管理员手动调整', user.id);
    logAudit({ userId: targetUser.id, action: 'account_status_changed', req, details: `状态调整为 ${status}: ${reason}`, success: true });
    res.json({ success: true, message: '账号状态已更新' });
  });

  // ======================================================================
  // 路由：管理员封禁审批
  // ======================================================================

  router.post('/admin/ban-approvals', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const { userId, banType, reason } = req.body;
    if (!userId || !banType || !reason) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const result = createBanApproval(userId, banType, reason, req.tokenPayload.userId);
    res.json(result);
  });

  router.post('/admin/ban-approvals/review', authMiddleware, requireAdminReauth, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const { approvalId, decision, reviewNote } = req.body;
    if (!approvalId || !decision) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const result = reviewBanApproval(approvalId, decision, reviewNote, req.tokenPayload.userId);
    res.json(result);
  });

  router.get('/admin/ban-approvals/pending', authMiddleware, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const approvals = getPendingBanApprovals(limit);
    res.json({ success: true, data: approvals });
  });

  router.get('/admin/ban-approvals', authMiddleware, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '仅管理员可操作' });
    }
    const { status, page, limit } = req.query;
    const result = getAllBanApprovals({
      status,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 100),
    });
    res.json({ success: true, data: result });
  });

  // ======================================================================
  // 路由：管理员环境风险预检
  // ======================================================================

  router.post('/security/admin/risk-eval', authMiddleware, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user || user.role !== 'admin') {
      res.status(403).json({ success: false, message: '仅管理员可操作' });
      return;
    }
    const { fingerprint } = req.body;
    const ip = getClientIP(req);
    const result = evaluateRisk(req.tokenPayload.userId, { fingerprint, ip, timestamp: new Date().toISOString() });
    res.json({ success: true, ...result });
  });

  // ======================================================================
  // 路由：管理员登录 Step 1
  // ======================================================================

  router.post('/admin/login-step1', adminLoginLimiter, requireTurnstile('turnstileToken', { urlValidator: (url) => outboundFilter.checkUrl(url) }), async (req, res) => {
    const email = sanitizeInput(req.body.email);
    const password = req.body.password;
    const fingerprint = req.body.fingerprint;
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    // IP 白名单检查
    if (ADMIN_IP_WHITELIST.length > 0 && !ADMIN_IP_WHITELIST.includes(ip)) {
      logAudit({ userId: 'admin', action: 'admin_login_blocked', ip, details: `IP ${ip} 不在白名单中`, success: false });
      return res.status(403).json({ success: false, message: '当前IP无权访问管理后台' });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, message: '请输入邮箱和密码' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: '邮箱格式不正确' });
    }

    // 查找管理员账号
    let foundUser = null;
    for (const user of usersDB.values()) {
      if (user.email === email && user.role === 'admin') {
        foundUser = user;
        break;
      }
    }

    const passwordValid = foundUser && await comparePassword(password, foundUser.password);
    if (!passwordValid) {
      await adminTrust.recordFailedAttempt(ip);
      logAudit({ userId: 'admin', action: 'admin_login_failed', ip, details: '管理员邮箱或密码错误', success: false });
      return res.status(401).json({ success: false, message: '管理员邮箱或密码错误' });
    }

    if (await adminTrust.isBlocked(ip)) {
      logAudit({ userId: foundUser.id, action: 'admin_login_blocked', ip, details: '登录失败次数过多', success: false });
      return res.status(429).json({ success: false, message: '登录失败次数过多，请15分钟后再试' });
    }

    // 环境风险评分
    const riskResult = await adminTrust.evaluateRisk({
      userId: foundUser.id,
      ip,
      fingerprint,
      userAgent,
      adminIpWhitelist: ADMIN_IP_WHITELIST,
    });

    if (riskResult.level === 'blocked') {
      logAudit({ userId: foundUser.id, action: 'admin_login_blocked_high_risk', ip, details: `环境风险评分: ${riskResult.score} (blocked)`, success: false });
      return res.status(403).json({ success: false, message: '登录环境异常，已拒绝访问', riskLevel: riskResult.level, riskScore: riskResult.score });
    }

    // 根据风险等级决定挑战步骤
    const { steps, blocked } = adminTrust.decideChallenges({
      level: riskResult.level,
      adminTotpEnabled: !!foundUser.adminTotpEnabled,
      userHasEmail: isEmailConfigured(),
    });

    if (blocked) {
      return res.status(403).json({ success: false, message: '登录环境异常，已拒绝访问' });
    }

    // 创建待验证会话
    const session = await adminTrust.createPendingSession({
      userId: foundUser.id,
      email: foundUser.email,
      ip,
      fingerprint,
      userAgent,
      riskResult,
      steps,
    });

    logAudit({ userId: foundUser.id, action: 'admin_login_step1', ip, details: `管理员 step1 通过，风险: ${riskResult.level}(${riskResult.score})`, success: true });

    const deviceInfo = parseUserAgent(userAgent);

    // 军工级：管理员若已绑定 FIDO2 凭证，登录流程可选择安全密钥验证
    const webauthnStatus = await getWebAuthnStatus(foundUser.id);

    return res.json({
      success: true,
      data: {
        sessionId: session.id,
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
        riskFactors: riskResult.factors,
        steps,
        deviceName: `${deviceInfo.browser} · ${deviceInfo.os} · ${deviceInfo.device}`,
        webauthnAvailable: webauthnStatus.enabled,
        webauthnCredentialCount: webauthnStatus.credentials.length,
        mtlsEnabled: isMtlsEnabled(),
        mtlsRequired: isMtlsRequiredForAdmin(),
      },
    });
  });

  // ======================================================================
  // 路由：管理员 WebAuthn 登录选项（Step1 之后，Step2 之前）
  // ======================================================================

  router.post('/admin/webauthn/login-options', adminLoginLimiter, async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: '缺少会话 ID' });
    }
    const session = await adminTrust.getPendingSession(sessionId);
    if (!session || session.ip !== getClientIP(req)) {
      return res.status(403).json({ success: false, message: '会话无效或环境已变化' });
    }
    try {
      const { options } = await createWebAuthnAuthenticationOptions(session.userId);
      res.json({ success: true, data: options });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  });

  // ======================================================================
  // 路由：管理员 WebAuthn 登录验证
  // ======================================================================

  router.post('/admin/webauthn/login-verify', adminLoginLimiter, async (req, res) => {
    const { sessionId, response } = req.body;
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    if (!sessionId || !response) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const session = await adminTrust.getPendingSession(sessionId);
    if (!session || session.ip !== ip) {
      return res.status(403).json({ success: false, message: '会话无效或环境已变化' });
    }

    const foundUser = usersDB.get(session.userId);
    if (!foundUser || foundUser.role !== 'admin') {
      return res.status(403).json({ success: false, message: '管理员账号异常' });
    }

    try {
      const result = await verifyWebAuthnAuthentication(session.userId, response, session.webauthnChallengeKey);
      if (!result.verified) {
        await adminTrust.recordFailedAttempt(ip);
        logAudit({ userId: foundUser.id, action: 'admin_login_failed', ip, details: 'WebAuthn 验证失败', success: false });
        return res.status(400).json({ success: false, message: '安全密钥验证失败' });
      }

      // WebAuthn 成功等效完成所有挑战
      await adminTrust.deletePendingSession(sessionId);
      await adminTrust.recordLogin(foundUser.id, { ip, fingerprint: session.fingerprint, userAgent, riskScore: session.riskScore, riskLevel: session.riskLevel, success: true, reason: 'webauthn' });

      // 签发令牌（复用 step2 逻辑）
      const sid = crypto.randomUUID();
      const token = generateToken(foundUser.id, sid);
      const refreshToken = generateRefreshToken(foundUser.id, sid);
      const deviceInfo = parseUserAgent(userAgent);
      const now = new Date().toISOString();

      if (!sessionsDB.has(foundUser.id)) sessionsDB.set(foundUser.id, []);
      sessionsDB.get(foundUser.id).push({
        id: sid,
        device: deviceInfo.device,
        browser: `${deviceInfo.browser} · ${deviceInfo.os}`,
        ip,
        lastActive: now,
        isCurrent: true,
      });

      logAudit({ userId: foundUser.id, action: 'admin_login', ip, details: '管理员登录成功（WebAuthn/FIDO2）', success: true });
      console.warn('\n═══════════════════════════════════════════════════');
      console.warn('  🔐 管理员登录成功 [WebAuthn/FIDO2]');
      console.warn(`  用户: ${foundUser.email} (${foundUser.id})`);
      console.warn(`  IP: ${ip}`);
      console.warn(`  设备: ${deviceInfo.device} | ${deviceInfo.browser} · ${deviceInfo.os}`);
      console.warn(`  时间: ${new Date().toLocaleString('zh-CN')}`);
      console.warn('═══════════════════════════════════════════════════\n');
      setAccessTokenCookie(res, token);
      setRefreshTokenCookie(res, refreshToken);

      return res.json({
        success: true,
        data: {
          user: { id: foundUser.id, email: foundUser.email, username: foundUser.username, avatar: foundUser.avatar, role: foundUser.role },
          token,
          refreshToken,
          sessionId: sid,
        },
      });
    } catch (err) {
      await adminTrust.recordFailedAttempt(ip);
      logAudit({ userId: foundUser.id, action: 'admin_login_failed', ip, details: `WebAuthn 错误: ${err.message}`, success: false });
      return res.status(400).json({ success: false, code: err.code || 'WEBAUTHN_ERROR', message: err.message });
    }
  });

  // ======================================================================
  // 路由：管理员问卷列表
  // ======================================================================

  router.get('/admin/surveys', authMiddleware, requireAdmin, (req, res) => {
    res.json({ success: true, data: surveys });
  });

  // ======================================================================
  // 路由：创建管理员账号（军工级多重防护）
  // 必须同时满足：
  //   1. 已登录管理员 + 二次身份验证（requireAdminReauth）
  //   2. 环境变量口令 ADMIN_CREATE_SECRET（两者都要：口令 + 现有管理员触发）
  //   3. 图形验证码（adminCaptchaStore）
  //   4. TOTP 动态验证码（adminTOTPSecrets）
  // ======================================================================
  router.post('/admin/create-admin', authMiddleware, requireAdmin, requireAdminReauth, async (req, res) => {
    const operatorId = req.tokenPayload?.userId;
    const operator = usersDB.get(operatorId);
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    // —— 校验 1：环境变量口令（固定口令，运维持有）——
    const createSecret = sanitizeInput(req.body.createSecret);
    if (!ADMIN_CREATE_SECRET) {
      logAudit({ userId: operatorId, action: 'admin_create_failed', ip, details: 'ADMIN_CREATE_SECRET 未配置，拒绝创建', success: false });
      return res.status(500).json({ success: false, code: 'ADMIN_CREATE_NOT_CONFIGURED', message: '系统未配置管理员创建口令，禁止创建' });
    }
    if (!createSecret || createSecret !== ADMIN_CREATE_SECRET) {
      logAudit({ userId: operatorId, action: 'admin_create_failed', ip, details: '管理员创建口令错误', success: false });
      return res.status(403).json({ success: false, code: 'ADMIN_CREATE_SECRET_INVALID', message: '创建口令错误' });
    }

    // —— 校验 2：图形验证码 ——
    const captchaId = sanitizeInput(req.body.captchaId);
    const captchaCode = (req.body.captchaCode || '').toString().trim().toLowerCase();
    const storedCaptcha = captchaId ? adminCaptchaStore.get(captchaId) : null;
    if (!storedCaptcha) {
      logAudit({ userId: operatorId, action: 'admin_create_failed', ip, details: '图形验证码无效或已过期', success: false });
      return res.status(400).json({ success: false, code: 'CAPTCHA_INVALID', message: '图形验证码无效，请刷新后重试' });
    }
    if (Date.now() > storedCaptcha.expires || storedCaptcha.code !== captchaCode) {
      adminCaptchaStore.delete(captchaId);
      logAudit({ userId: operatorId, action: 'admin_create_failed', ip, details: '图形验证码错误或过期', success: false });
      return res.status(400).json({ success: false, code: 'CAPTCHA_MISMATCH', message: '图形验证码错误，请重新输入' });
    }
    adminCaptchaStore.delete(captchaId); // 一次性消费

    // —— 校验 3：TOTP 动态验证码（操作管理员本人）——
    const totpCode = (req.body.totpCode || '').toString().trim();
    if (!operator?.adminTotpEnabled) {
      logAudit({ userId: operatorId, action: 'admin_create_failed', ip, details: '操作管理员未开启 TOTP，拒绝创建管理员', success: false });
      return res.status(403).json({ success: false, code: 'ADMIN_TOTP_REQUIRED', message: '操作管理员必须先开启 TOTP 二次验证' });
    }
    const totpSecret = adminTOTPSecrets.get(operatorId)?.secret;
    if (!totpSecret || !speakeasy.totp.verify({ secret: totpSecret, encoding: 'base32', token: totpCode, window: 1 })) {
      logAudit({ userId: operatorId, action: 'admin_create_failed', ip, details: 'TOTP 动态验证码错误', success: false });
      return res.status(403).json({ success: false, code: 'TOTP_INVALID', message: 'TOTP 动态验证码错误' });
    }

    // —— 校验 4：账号字段 ——
    const username = sanitizeInput(req.body.username);
    const email = sanitizeInput(req.body.email);
    const password = req.body.password;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: '请填写完整的账号信息' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: '邮箱格式不正确' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: '密码长度至少 8 位' });
    }
    for (const user of usersDB.values()) {
      if (user.email === email) {
        return res.status(409).json({ success: false, message: '该邮箱已被注册' });
      }
    }

    // —— 创建管理员账号 ——
    const adminId = `admin-${crypto.randomBytes(6).toString('hex')}`;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = {
      id: adminId,
      username,
      email,
      password: hashedPassword,
      avatar: 'https://i.pravatar.cc/150?img=68',
      level: 'advanced',
      createdAt: new Date().toISOString(),
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
      role: 'admin',
      createdBy: operatorId,
    };
    usersDB.set(adminId, newAdmin);
    if (typeof saveUsers === 'function') {
      await saveUsers(usersDB).catch(e => console.warn('[Admin] 保存新管理员失败:', e.message));
    }
    // 军工级：登记为已验证管理员，纳入完整性守卫白名单
    if (adminIntegrityGuard && typeof adminIntegrityGuard.registerVerifiedAdmin === 'function') {
      adminIntegrityGuard.registerVerifiedAdmin(adminId);
    }
    logAudit({ userId: operatorId, action: 'admin_created', ip, details: `创建管理员账号 ${email}（${adminId}）`, success: true });

    return res.json({
      success: true,
      data: { id: adminId, username, email, role: 'admin' },
      message: '管理员账号创建成功',
    });
  });

  return router;
}