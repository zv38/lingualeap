// ===== 认证路由模块 =====
// 从 api/index.js 抽取的认证相关路由，使用工厂函数模式以共享数据存储。
// 挂载方式：app.use('/api', createAuthRouter({ ...dependencies }));

import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getIPRisk } from '../utils/ipapi.js';
import { sendResetCode, getEmailInfo } from '../emailService.js';

export function createAuthRouter({
  // 数据存储（由 index.js 传入，确保共享同一实例）
  usersDB,
  sessionsDB,
  loginHistoryDB,
  passwordResetTokens,
  revokedAccessTokens,
  revokedRefreshTokens,
  captchaStore,
  loginFailureStore,
  // 安全模块导出
  validate,
  registerSchema,
  loginSchema,
  humanVerificationMiddleware,
  requireTurnstile,
  requirePoWChallenge,
  logAudit,
  getClientIP,
  ACCOUNT_STATUS,
  evaluateRegistrationRisk,
  createUserRiskProfile,
  recordRiskEvent,
  getLoginSecurityWarnings,
  addMeritPoints,
  checkTempBanExpiry,
  updateRiskFromBehavior,
  getDeviceFingerprint,
  verifyImageCaptcha,
  requestTracker,
  ipReputation,
  // 认证中间件（用于 /me、/logout 等需鉴权端点）
  authMiddleware,
  // 网络边界
  outboundFilter,
  // JWT 密钥
  getJwtSecret,
  getJwtRefreshSecret,
  KEY_VERSION,
  REFRESH_KEY_VERSION,
}) {
  const router = Router();

  // ============================================================
  // 常量
  // ============================================================
  const IS_DEV = process.env.NODE_ENV !== 'production';
  // [PENTEST-DEV-BYPASS] 仅开发环境且显式开启 LL_LOGIN_DEBUG_BYPASS 时生效：
  // 跳过登录的人机验证三层网关(humanVerification + Turnstile + 图形验证码)，
  // 便于本地调试/渗透测试直接登录查看账号。生产环境(NOD_ENV=production)下恒为 false。
  const DEV_LOGIN_BYPASS = IS_DEV && process.env.LL_LOGIN_DEBUG_BYPASS === 'true';
  const BCRYPT_ROUNDS = 10;
  const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;
  const MAX_EMAIL_FAILED_ATTEMPTS = 5;
  const MAX_IP_FAILED_ATTEMPTS = 10;

  // 设备指纹服务端密钥（派生自 JWT 密钥，不独立存储，重启后稳定）
  const DEVICE_FINGERPRINT_PEPPER = crypto.createHash('sha256')
    .update(getJwtSecret() + ':device-fingerprint-v1')
    .digest('hex')
    .slice(0, 16);

  // ============================================================
  // 辅助函数
  // ============================================================

  /**
   * 对常见 XSS 向量进行转义，防止反射/存储型 XSS 与部分注入攻击
   */
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

  const CAPTCHA_ERROR_MESSAGES = {
    missing: '请完成图形验证',
    expired: '验证码已过期，请刷新后重试',
    not_found: '验证码已失效，请刷新后重试',
    mismatch: '验证码错误，请重新输入',
    ip_mismatch: '验证码与请求来源不匹配',
    ua_mismatch: '验证码与设备不匹配',
  };

  /**
   * 统一验证码校验：优先使用新型图形验证码（imageCaptchaToken + imageCaptchaCode），
   * 未提供时回退到旧版 SVG 验证码（captchaId + captchaCode）。
   */
  function verifyAnyCaptcha(req) {
    const imageToken = sanitizeInput(req.body.imageCaptchaToken);
    const imageCode = sanitizeInput(req.body.imageCaptchaCode);
    const ip = getClientIP(req);
    const isDev = process.env.NODE_ENV !== 'production';

    if (imageToken && imageCode) {
      const result = verifyImageCaptcha(imageToken, imageCode, req);
      if (!result.valid) {
        if (isDev) {
          const time = new Date().toLocaleTimeString('zh-CN');
          console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mCAPTCHA_FAILED\x1b[0m  ${time}`)
          console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
          console.log(`  详情: 图形验证码校验失败 - ${result.reason}`)
        }
        return { valid: false, reason: result.reason, type: 'image' };
      }
      if (isDev) {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\x1b[90m  [Captcha] ${time} 图形验证码校验通过 ← ${ip}\x1b[0m`)
      }
      return { valid: true, type: 'image' };
    }

    const captchaId = sanitizeInput(req.body.captchaId);
    const captchaCode = sanitizeInput(req.body.captchaCode);
    if (!captchaId || !captchaCode) {
      if (isDev) {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mCAPTCHA_MISSING\x1b[0m  ${time}`)
        console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
        console.log(`  详情: 缺少验证码参数`)
      }
      return { valid: false, reason: 'missing', type: 'svg' };
    }

    const storedCaptcha = captchaStore.get(captchaId);
    if (!storedCaptcha || storedCaptcha.expires < Date.now()) {
      captchaStore.delete(captchaId);
      if (isDev) {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mCAPTCHA_EXPIRED\x1b[0m  ${time}`)
        console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
        console.log(`  详情: SVG验证码已过期或不存在`)
      }
      return { valid: false, reason: 'expired', type: 'svg' };
    }

    // 单 captchaId 尝试次数限制
    storedCaptcha.attempts = (storedCaptcha.attempts || 0) + 1;
    if (storedCaptcha.attempts > 3) {
      captchaStore.delete(captchaId);
      if (isDev) {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mCAPTCHA_TOO_MANY\x1b[0m  ${time}`)
        console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
        console.log(`  详情: 验证码尝试次数超限(>3次)`)
      }
      return { valid: false, reason: 'too_many_attempts', type: 'svg' };
    }

    const reqIp = getClientIP(req);
    if (storedCaptcha.ip && storedCaptcha.ip !== reqIp) {
      captchaStore.delete(captchaId);
      if (isDev) {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mCAPTCHA_IP_MISMATCH\x1b[0m  ${time}`)
        console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
        console.log(`  详情: 验证码IP不匹配`)
      }
      return { valid: false, reason: 'ip_mismatch', type: 'svg' };
    }
    const uaHash = crypto.createHash('sha256').update(req.headers['user-agent'] || '').digest('hex').slice(0, 16);
    if (storedCaptcha.uaHash && storedCaptcha.uaHash !== uaHash) {
      captchaStore.delete(captchaId);
      if (isDev) {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mCAPTCHA_UA_MISMATCH\x1b[0m  ${time}`)
        console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
        console.log(`  详情: 验证码UA不匹配`)
      }
      return { valid: false, reason: 'ua_mismatch', type: 'svg' };
    }
    if (storedCaptcha.code.toLowerCase() !== captchaCode.toLowerCase()) {
      if (isDev) {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mCAPTCHA_MISMATCH\x1b[0m  ${time}`)
        console.log(`  路径: ${req.method} ${req.path}  |  来源: ${ip}`)
        console.log(`  详情: 验证码输入错误`)
      }
      return { valid: false, reason: 'mismatch', type: 'svg' };
    }
    captchaStore.delete(captchaId);
    if (isDev) {
      const time = new Date().toLocaleTimeString('zh-CN');
      console.log(`\x1b[90m  [Captcha] ${time} SVG验证码校验通过 ← ${ip}\x1b[0m`)
    }
    return { valid: true, type: 'svg' };
  }

  function hashPassword(password) {
    return bcrypt.hashSync(password, BCRYPT_ROUNDS);
  }

  function comparePassword(password, hash) {
    return bcrypt.compareSync(password, hash);
  }

  function getJwtSecretFn() {
    return getJwtSecret();
  }

  function getJwtRefreshSecretFn() {
    return getJwtRefreshSecret();
  }

  function generateToken(userId, sessionId = null, deviceFingerprint = null) {
    const user = usersDB.get(userId);
    const role = user?.role || 'user';
    const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
    const payload = { userId, type: 'access', kv: KEY_VERSION, sid: sessionId, role };
    if (deviceFingerprint) {
      payload.deviceFingerprint = deviceFingerprint;
    }
    return jwt.sign(payload, getJwtSecretFn(), { expiresIn });
  }

  function generateRefreshToken(userId, sessionId = null) {
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    return jwt.sign({ userId, type: 'refresh', kv: REFRESH_KEY_VERSION, sid: sessionId }, getJwtRefreshSecretFn(), { expiresIn: refreshExpiresIn });
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

  function validateFields(body, requiredFields) {
    const missing = [];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      return `缺少必填字段: ${missing.join(', ')}`;
    }
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return '邮箱格式不正确';
    }
    if (body.password && body.password.length < 8) {
      return '密码长度不能少于8位';
    }
    if (body.password && !/[A-Z]/.test(body.password)) {
      return '密码需要包含大写字母';
    }
    if (body.password && !/[0-9]/.test(body.password)) {
      return '密码需要包含数字';
    }
    if (body.password && !/[^A-Za-z0-9]/.test(body.password)) {
      return '密码需要包含特殊字符';
    }
    if (body.username && (body.username.length < 2 || body.username.length > 30)) {
      return '用户名长度应在2-30个字符之间';
    }
    return null;
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
    } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
      const m = ua.match(/Version\/(\d+)/);
      browser = m ? `Safari ${m[1]}` : 'Safari';
    } else if (/Edg/.test(ua)) {
      const m = ua.match(/Edg\/(\d+)/);
      browser = m ? `Edge ${m[1]}` : 'Edge';
    }

    return { device, browser, os };
  }

  // ============================================================
  // 路由 — POST /register
  // ============================================================
  router.post('/register', validate(registerSchema), humanVerificationMiddleware(), requireTurnstile('turnstileToken', { urlValidator: (url) => outboundFilter.checkUrl(url) }), requirePoWChallenge, async (req, res) => {
    const username = sanitizeInput(req.body.username);
    const email = sanitizeInput(req.body.email);
    // 安全规范：密码不得经过 HTML 转义，否则含 &<>"'/ 的合法密码会被篡改
    const password = req.body.password;

    const errors = [];
    if (!username || username.length < 2 || username.length > 30) errors.push('用户名需要2-30个字符');
    else if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) errors.push('用户名只能包含字母、数字、下划线和中文');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('邮箱格式不正确');

    if (!password || password.length < 8) errors.push('密码至少需要8位');
    else if (!/[A-Z]/.test(password)) errors.push('密码需要包含大写字母');
    else if (!/[0-9]/.test(password)) errors.push('密码需要包含数字');
    else if (!/[^A-Za-z0-9]/.test(password)) errors.push('密码需要包含特殊字符');

    if (errors.length > 0) {
      res.status(400).json({ success: false, message: errors.join('；') });
      return;
    }

    const captchaResult = verifyAnyCaptcha(req);
    if (!captchaResult.valid) {
      res.status(400).json({ success: false, message: CAPTCHA_ERROR_MESSAGES[captchaResult.reason] || '验证码校验失败' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, message: '邮箱格式不正确' });
      return;
    }

    for (const user of usersDB.values()) {
      if (user.email === email) {
        res.status(409).json({ success: false, message: '该邮箱已被注册' });
        return;
      }
      if (user.username === username) {
        res.status(409).json({ success: false, message: '该用户名已被使用' });
        return;
      }
    }

    const userId = 'u' + Date.now();
    const hashedPassword = hashPassword(password);

    // ===== 账号风险评分（V3 增强版：集成 ipapi.is 外部 IP 风险检测） =====
    // 使用服务端可验证的指标评估注册风险，不信任客户端发送的信号
    try {
      const ipReputationBad = req.ipReputation === 'bad' ? 'bad' : null;

      // 异步调用 ipapi.is 获取 IP 风险数据（非阻塞，失败不影响注册）
      const clientIP = getClientIP(req);
      const ipRiskData = await getIPRisk(clientIP).catch(err => {
        console.warn('[Register] ipapi.is 查询失败:', err.message);
        return null;
      });

      const riskResult = evaluateRegistrationRisk(req, email, ipReputationBad, ipRiskData);
      createUserRiskProfile(userId, riskResult);

      // 高风险（RESTRICTED 及以上）直接拒绝注册
      if (riskResult.status === ACCOUNT_STATUS.RESTRICTED || riskResult.status === ACCOUNT_STATUS.FROZEN || riskResult.status === ACCOUNT_STATUS.BANNED) {
        logAudit({ userId, action: 'register_blocked', req, details: `风险评分 ${riskResult.score}：${riskResult.factors.map(f => f.name).join('、')}`, success: false });
        res.status(403).json({
          success: false,
          message: '注册请求被安全策略拒绝',
          code: 'REGISTRATION_BLOCKED',
          riskScore: riskResult.score,
        });
        return;
      }

      // 中等风险（WATCH）需要额外验证
      if (riskResult.status === ACCOUNT_STATUS.WATCH) {
        req.requireExtraVerification = true;
      }

      // 记录风险事件
      if (riskResult.score > 0) {
        recordRiskEvent(userId, 'registration_risk', {
          score: riskResult.score,
          level: riskResult.level,
          factors: riskResult.factors.map(f => f.name),
        });
      }
    } catch (err) {
      console.warn('[Register] 风险评分异常:', err.message);
      // 不阻止注册，但记录异常
    }
    requestTracker.record(getClientIP(req), { registration: true });
    const newUser = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      avatar: 'https://i.pravatar.cc/150?img=' + (Math.floor(Math.random() * 70) + 1),
      level: 'beginner',
      createdAt: new Date().toISOString(),
      xp: 0,
      totalXP: 3000,
      streakDays: 0,
      longestStreak: 0,
      dailyGoal: 30,
      reminderTime: '09:00',
      theme: 'dark',
      language: 'zh',
      followers: [],
      following: []
    };

    usersDB.set(userId, newUser);
    // 注册成功后自动登录：token 同样绑定设备指纹，与登录流程保持一致
    const deviceFingerprint = getDeviceFingerprint(req);
    const token = generateToken(userId, null, deviceFingerprint);
    const refreshToken = generateRefreshToken(userId);
    // 安全规范：token 写入 HttpOnly Cookie，避免前端 localStorage 存储被 XSS 读取
    setAccessTokenCookie(res, token);
    setRefreshTokenCookie(res, refreshToken);
    logAudit({ userId, action: 'register', req, details: '用户注册成功', success: true });
    const { password: _, ...userWithoutPassword } = newUser;
    res.json({ success: true, user: { id: newUser.id, email: newUser.email, username: newUser.username, avatar: newUser.avatar }, token, refreshToken });
  });

  // ============================================================
  // 路由 — POST /login
  // ============================================================
  router.post('/login', DEV_LOGIN_BYPASS ? (req, res, next) => next() : validate(loginSchema), DEV_LOGIN_BYPASS ? (req, res, next) => next() : humanVerificationMiddleware(), DEV_LOGIN_BYPASS ? (req, res, next) => next() : requireTurnstile('turnstileToken', { urlValidator: (url) => outboundFilter.checkUrl(url) }), (req, res) => {
    const email = sanitizeInput(req.body.email);
    // 安全规范：密码不得经过 HTML 转义，否则含 &<>"'/ 的合法密码会被篡改
    const password = req.body.password;
    const ip = getClientIP(req);

    // [PENTEST-DEV-BYPASS] dev 旁路开启时，补一个占位 turnstileToken，
    // 让 zod 必填校验通过（后续 requireTurnstile 中间件已被跳过，不会真实打 Cloudflare）。
    if (DEV_LOGIN_BYPASS && !req.body.turnstileToken) {
      req.body.turnstileToken = 'dev-bypass-placeholder';
    }

    const validationError = validateFields(req.body, ['email', 'password']);
    if (validationError) {
      res.status(400).json({ success: false, message: validationError });
      return;
    }

    // 账号/IP 登录锁定检查：锁定期间统一返回通用 401，不暴露锁定状态
    const emailKey = getLoginLockoutKey(email);
    const ipKey = getLoginLockoutIpKey(ip);
    if (isLoginLocked(emailKey) || isLoginLocked(ipKey)) {
      logAudit({ userId: 'anonymous', action: 'login_lockout', req, details: '账号/IP 处于登录锁定窗口', success: false });
      res.status(401).json({ success: false, message: '邮箱或密码错误' });
      return;
    }

    // [PENTEST-DEV-BYPASS] dev 旁路开启时跳过图形验证码校验
    if (!DEV_LOGIN_BYPASS) {
      const captchaResult = verifyAnyCaptcha(req);
      if (!captchaResult.valid) {
        res.status(400).json({ success: false, message: CAPTCHA_ERROR_MESSAGES[captchaResult.reason] || '验证码校验失败' });
        return;
      }
    }

    let foundUser = null;
    for (const user of usersDB.values()) {
      if (user.email === email) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser || !comparePassword(password, foundUser.password)) {
      recordLoginFailure(email, ip);
      requestTracker.recordFailedLogin(ip, email);
      ipReputation.recordSignal(ip, 'FAILED_LOGIN', 10);
      res.status(401).json({ success: false, message: '邮箱或密码错误' });
      return;
    }

    // 登录成功：清空失败记录并绑定设备指纹
    clearLoginFailures(email, ip);
    const sessionId = crypto.randomUUID();
    const deviceFingerprint = getDeviceFingerprint(req);
    const token = generateToken(foundUser.id, sessionId, deviceFingerprint);
    const refreshToken = generateRefreshToken(foundUser.id, sessionId);
    const userAgent = req.headers['user-agent'] || '';
    const deviceInfo = parseUserAgent(userAgent);
    const now = new Date().toISOString();

    if (!sessionsDB.has(foundUser.id)) sessionsDB.set(foundUser.id, []);
    const userSessions = sessionsDB.get(foundUser.id);
    userSessions.push({
      id: sessionId,
      device: deviceInfo.device,
      browser: `${deviceInfo.browser} · ${deviceInfo.os}`,
      ip,
      fingerprint: deviceFingerprint,
      lastActive: now,
      isCurrent: true,
    });

    if (!loginHistoryDB.has(foundUser.id)) loginHistoryDB.set(foundUser.id, []);
    const userHistory = loginHistoryDB.get(foundUser.id);
    userHistory.unshift({
      id: 'h' + Date.now(),
      dateTime: now,
      device: deviceInfo.device,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ip,
      success: true,
    });

    requestTracker.recordSuccessfulLogin(ip);
    logAudit({ userId: foundUser.id, action: 'login', ip, details: '登录成功', success: true });
    // 安全规范：token 写入 HttpOnly Cookie，避免前端 localStorage 存储被 XSS 读取
    setAccessTokenCookie(res, token);
    setRefreshTokenCookie(res, refreshToken);
    const { password: _, ...userWithoutPassword } = foundUser;

    // V4 安全通知：登录时返回安全警告
    const securityWarnings = getLoginSecurityWarnings(foundUser.id);
    if (securityWarnings.length > 0) {
      res.set('X-Security-Warnings', JSON.stringify(securityWarnings));
    }

    res.json({
      success: true,
      user: { id: foundUser.id, email: foundUser.email, username: foundUser.username, avatar: foundUser.avatar },
      token, refreshToken, sessionId,
      securityWarnings: securityWarnings.length > 0 ? securityWarnings : undefined,
    });
  });

  // ============================================================
  // 路由 — GET /check-username
  // ============================================================
  router.get('/check-username', (req, res) => {
    const username = sanitizeInput(req.query.username);
    // 防止用户名存在性枚举：不对未认证请求暴露真实存在性，仅做格式校验；唯一性由注册提交时服务端判定
    if (!username || username.length < 2) {
      return res.json({ success: true, available: false });
    }
    // 对未登录/普通用户返回恒定可用响应，避免枚举管理员/用户账号
    const isAdmin = req.tokenPayload?.role === 'admin';
    if (isAdmin) {
      let available = true;
      for (const user of usersDB.values()) {
        if (user.username === username) { available = false; break; }
      }
      return res.json({ success: true, available });
    }
    return res.json({ success: true, available: true });
  });

  // ============================================================
  // 路由 — POST /forgot-password
  // ============================================================
  router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ success: false, message: '请提供邮箱地址' });
      return;
    }

    let foundUser = null;
    for (const user of usersDB.values()) {
      if (user.email === email) { foundUser = user; break; }
    }

    // 安全规范：无论邮箱是否存在，都返回统一文案，防止攻击者枚举注册邮箱
    if (foundUser) {
      // 安全规范：使用 8 位字母数字组合（大写字母+数字，约 2.8 万亿空间），替代 6 位纯数字（约 90 万空间）
      const code = crypto.randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) ||
        String(crypto.randomInt(100000000, 999999999)).slice(0, 8);
      passwordResetTokens.set(email, { token: code, expires: Date.now() + 15 * 60 * 1000 });
      const result = await sendResetCode(email, code);
      const emailInfo = getEmailInfo();
      res.json({
        success: true,
        message: '如果该邮箱已注册，验证码将发送至您的邮箱',
        devMode: result.devMode || false,
        resetToken: result.devMode ? code : undefined,
        emailMode: emailInfo.mode,
      });
      return;
    }

    res.json({ success: true, message: '如果该邮箱已注册，验证码将发送至您的邮箱' });
  });

  // ============================================================
  // 路由 — POST /reset-password
  // ============================================================
  router.post('/reset-password', requireTurnstile('turnstileToken', { urlValidator: (url) => outboundFilter.checkUrl(url) }), (req, res) => {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      res.status(400).json({ success: false, message: '参数不完整' });
      return;
    }

    // 安全规范：重置密码必须执行与注册一致的强度策略，防止重置弱密码
    const pwdErrors = [];
    if (password.length < 8) pwdErrors.push('密码至少需要8位');
    else if (!/[A-Z]/.test(password)) pwdErrors.push('密码需要包含大写字母');
    else if (!/[0-9]/.test(password)) pwdErrors.push('密码需要包含数字');
    else if (!/[^A-Za-z0-9]/.test(password)) pwdErrors.push('密码需要包含特殊字符');
    if (pwdErrors.length > 0) {
      res.status(400).json({ success: false, message: pwdErrors.join('；') });
      return;
    }

    const stored = passwordResetTokens.get(email);
    if (!stored || stored.expires < Date.now()) {
      res.status(400).json({ success: false, message: '验证码已过期，请重新获取' });
      return;
    }

    if (stored.token !== token) {
      res.status(400).json({ success: false, message: '验证码错误' });
      return;
    }

    let foundUser = null;
    for (const user of usersDB.values()) {
      if (user.email === email) { foundUser = user; break; }
    }

    if (!foundUser) {
      res.status(400).json({ success: false, message: '用户不存在' });
      return;
    }

    foundUser.password = hashPassword(password);
    passwordResetTokens.delete(email);

    res.json({ success: true, message: '密码已重置' });
  });

  // ============================================================
  // 当前用户信息 — GET /me
  // 页面刷新后前端通过此端点重新获取真实用户与角色，防止本地存储被注入伪造 role。
  // 返回 { success, data: { user } }
  // ============================================================
  router.get('/me', authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在或已注销' });
    }
    const { password: _pwd, ...safeUser } = user;
    res.json({ success: true, data: { user: safeUser } });
  });

  // ============================================================
  // 登出 — POST /logout
  // 吊销当前 access token 与 refresh token，并清除 HttpOnly Cookie。
  // ============================================================
  router.post('/logout', authMiddleware, (req, res) => {
    try {
      const token = req.cookies?.access_token ||
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      if (token) revokedAccessTokens.set(token, Date.now());
      const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
      if (refreshToken) revokedRefreshTokens.set(refreshToken, Date.now());
      const sid = req.tokenPayload?.sid;
      const userId = req.tokenPayload?.userId;
      if (sid && userId && sessionsDB.has(userId)) {
        const sessions = sessionsDB.get(userId);
        const idx = sessions.findIndex((s) => s.id === sid);
        if (idx !== -1) {
          sessions.splice(idx, 1);
          sessionsDB.set(userId, sessions);
        }
      }
      res.clearCookie('access_token', { path: '/', httpOnly: true, secure: !IS_DEV, sameSite: 'strict' });
      res.clearCookie('refresh_token', { path: '/', httpOnly: true, secure: !IS_DEV, sameSite: 'strict' });
      if (userId) logAudit({ userId, action: 'logout', req, details: '手动登出', success: true });
      res.json({ success: true, message: '已退出登录' });
    } catch (err) {
      res.status(500).json({ success: false, message: '登出失败' });
    }
  });

  // ============================================================
  // 修改密码 — POST /user/change-password
  // 请求体：{ current, new }。校验当前密码后更新，并吊销该用户全部会话。
  // ============================================================
  router.post('/user/change-password', authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: '未登录' });
    }
    const { current: currentPwd, new: newPwd } = req.body || {};
    if (!currentPwd || !newPwd) {
      return res.status(400).json({ success: false, message: '请提供当前密码与新密码' });
    }
    if (!comparePassword(currentPwd, user.password)) {
      logAudit({ userId: user.id, action: 'change_password', req, details: '当前密码错误', success: false });
      return res.status(400).json({ success: false, message: '当前密码不正确' });
    }
    if (newPwd.length < 8) {
      return res.status(400).json({ success: false, message: '新密码至少需要8位' });
    }
    if (newPwd === currentPwd) {
      return res.status(400).json({ success: false, message: '新密码不能与当前密码相同' });
    }
    user.password = hashPassword(newPwd);
    // 改密后吊销该用户所有 access/refresh token，强制重新登录
    const collected = [...revokedAccessTokens.keys()];
    for (const t of collected) {
      try {
        const d = jwt.decode(t);
        if (d && d.userId === user.id) revokedAccessTokens.set(t, Date.now());
      } catch {}
    }
    const collectedR = [...revokedRefreshTokens.keys()];
    for (const t of collectedR) {
      try {
        const d = jwt.decode(t);
        if (d && d.userId === user.id) revokedRefreshTokens.set(t, Date.now());
      } catch {}
    }
    if (sessionsDB.has(user.id)) sessionsDB.delete(user.id);
    logAudit({ userId: user.id, action: 'change_password', req, details: '修改密码成功，已吊销全部会话', success: true });
    res.json({ success: true, message: '密码已修改，请重新登录' });
  });

  // ============================================================
  // 会话列表 — GET /auth/sessions
  // ============================================================
  router.get('/auth/sessions', authMiddleware, (req, res) => {
    const userId = req.tokenPayload?.userId;
    if (!userId) return res.status(401).json({ success: false, message: '未登录' });
    const sessions = sessionsDB.get(userId) || [];
    // 标记当前会话
    const currentSid = req.tokenPayload?.sid;
    const data = sessions.map((s) => ({ ...s, isCurrent: s.id === currentSid }));
    res.json({ success: true, data });
  });

  // ============================================================
  // 吊销指定会话 — POST /auth/revoke-session
  // ============================================================
  router.post('/auth/revoke-session', authMiddleware, (req, res) => {
    const userId = req.tokenPayload?.userId;
    if (!userId) return res.status(401).json({ success: false, message: '未登录' });
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ success: false, message: '缺少 sessionId' });
    if (!sessionsDB.has(userId)) return res.json({ success: true, message: '会话列表为空' });
    const sessions = sessionsDB.get(userId);
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return res.status(404).json({ success: false, message: '会话不存在' });
    if (sessionId === req.tokenPayload?.sid) {
      return res.status(400).json({ success: false, message: '不能吊销当前会话' });
    }
    const idx = sessions.findIndex((s) => s.id === sessionId);
    sessions.splice(idx, 1);
    sessionsDB.set(userId, sessions);
    logAudit({ userId, action: 'revoke_session', req, details: `吊销会话 ${sessionId}`, success: true });
    res.json({ success: true, message: '会话已吊销' });
  });

  // ============================================================
  // 登录历史 — GET /auth/login-history
  // ============================================================
  router.get('/auth/login-history', authMiddleware, (req, res) => {
    const userId = req.tokenPayload?.userId;
    if (!userId) return res.status(401).json({ success: false, message: '未登录' });
    const history = loginHistoryDB.get(userId) || [];
    res.json({ success: true, data: history });
  });

  // ============================================================
  // 刷新令牌 — POST /refresh-token
  // 使用 refresh token 换取新的 access token。
  // ============================================================
  router.post('/refresh-token', (req, res) => {
    const refreshToken = getRefreshTokenLocal(req);
    if (!refreshToken) return res.status(401).json({ success: false, message: '缺少刷新令牌' });
    if (revokedRefreshTokens.has(refreshToken)) {
      return res.status(401).json({ success: false, message: '刷新令牌已失效' });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, getJwtRefreshSecretFn(), { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({ success: false, message: '刷新令牌无效或已过期' });
    }
    if (decoded.kv !== REFRESH_KEY_VERSION) {
      return res.status(401).json({ success: false, message: '刷新令牌版本不匹配' });
    }
    const user = usersDB.get(decoded.userId);
    if (!user) return res.status(401).json({ success: false, message: '用户不存在' });
    const sessionId = decoded.sid || crypto.randomUUID();
    const deviceFingerprint = getDeviceFingerprint(req);
    const newToken = generateToken(user.id, sessionId, deviceFingerprint);
    const newRefreshToken = generateRefreshToken(user.id, sessionId);
    revokedRefreshTokens.set(refreshToken, Date.now());
    setAccessTokenCookie(res, newToken);
    setRefreshTokenCookie(res, newRefreshToken);
    logAudit({ userId: user.id, action: 'refresh_token', req, details: '刷新访问令牌', success: true });
    res.json({ success: true, token: newToken, refreshToken: newRefreshToken });
  });

  // ============================================================
  // 隐私同意状态 — GET/POST /user/privacy-consent
  // GET 返回 { consented, aiDataConsent }；POST 请求体 { consent } 更新。
  // ============================================================
  router.get('/user/privacy-consent', authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: '未登录' });
    res.json({
      success: true,
      data: {
        consented: !!user.privacyAgreed,
        aiDataConsent: !!user.aiDataConsent,
      },
    });
  });

  router.post('/user/privacy-consent', authMiddleware, (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: '未登录' });
    const { consent } = req.body || {};
    if (typeof consent !== 'boolean') {
      return res.status(400).json({ success: false, message: 'consent 必须为布尔值' });
    }
    user.privacyAgreed = consent;
    user.aiDataConsent = consent;
    logAudit({ userId: user.id, action: 'update_privacy_consent', req, details: `隐私同意: ${consent}`, success: true });
    res.json({ success: true, data: { consented: consent, aiDataConsent: consent } });
  });

  return router;
}

// 从请求中提取 refresh token（cookie 优先，兼容 body）
function getRefreshTokenLocal(req) {
  if (req.cookies?.refresh_token) return req.cookies.refresh_token;
  if (req.body?.refreshToken) return req.body.refreshToken;
  return null;
}