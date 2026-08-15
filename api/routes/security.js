// ===== 安全路由模块 =====
// 从 api/index.js 中提取，通过工厂函数方式接收共享依赖

import express from 'express';
import svgCaptcha from 'svg-captcha';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { BehaviorFingerprint } from '../ai-decision/behaviorFingerprint.js';

/**
 * 创建安全路由路由器
 * @param {Object} deps - 共享依赖
 * @param {Map} deps.usersDB - 用户数据库 Map
 * @param {Map} deps.sessionsDB - 会话数据库 Map
 * @param {Function} deps.authMiddleware - 认证中间件
 * @param {Function} deps.requireAdminReauth - 管理员二次认证中间件
 * @param {Function} deps.getClientIP - 获取客户端 IP
 * @param {Function} deps.logAudit - 审计日志
 * @param {Function} deps.getIPRisk - IP 风险检测
 * @param {Function} deps.invalidateUserSessions - 失效用户会话
 * @param {Function} deps.getSecurityOverview - 获取安全概览
 * @param {Function} deps.getRiskEvents - 获取风险事件
 * @param {Function} deps.markRiskEventsRead - 标记风险事件已读
 * @param {Function} deps.generateRiskChallenge - 生成 PoW 挑战
 * @param {Function} deps.verifyRiskChallenge - 验证 PoW 挑战
 * @param {Object} deps.ACCOUNT_STATUS - 账号状态常量
 * @param {Function} deps.checkTempBanExpiry - 检查临时封禁过期
 * @param {Function} deps.generateAntiOcrNoise - 生成抗 OCR 干扰
 * @param {Function} deps.getCurrentPolicy - 获取当前隐私政策
 * @param {Function} deps.needsAcceptance - 检查是否需要接受
 * @param {Function} deps.getUserAcceptance - 获取用户接受记录
 * @param {Function} deps.getAdaptiveDifficulty - 获取自适应难度
 * @param {Function} deps.getAccountStatusForUser - 获取用户安全状态
 * @param {Function} deps.getUnreadRiskEventCount - 获取未读风险事件数
 * @param {Function} deps.createHumanChallenge - 创建人机挑战
 * @param {Function} deps.generateNumericCaptcha - 数字验证码
 * @param {Function} deps.generateMathCaptcha - 数学验证码
 * @param {Function} deps.generateRotateCaptcha - 旋转验证码
 * @param {Function} deps.generateSequenceCaptcha - 顺序点选验证码
 * @param {Function} deps.generateAudioCaptcha - 语音验证码
 * @param {Function} deps.getImageCaptchaStats - 验证码统计
 * @param {Object} deps.ipReputation - IP 信誉对象
 * @param {Object} deps.requestTracker - 请求追踪对象
 * @param {Function} deps.publicLimiter - 公开限流中间件
 * @param {Function} deps.captchaLimiter - 验证码限流中间件
 * @param {Object} deps.connectionTracker - TCP-WAF 连接追踪器
 * @param {Function} deps.getRuntimeSecurityStatus - 运行态安全状态
 * @param {Function} deps.getRuntimeGuardViolations - 运行态违规记录
 * @param {Function} deps.getAuditLog - 审计日志查询
 */
export default function createSecurityRouter(deps) {
  const router = express.Router();

  const {
    usersDB,
    sessionsDB,
    authMiddleware,
    adminClientCertGate,
    requireAdminReauth,
    getClientIP,
    logAudit,
    getIPRisk,
    invalidateUserSessions,
    getSecurityOverview,
    getRiskEvents,
    markRiskEventsRead,
    generateRiskChallenge,
    verifyRiskChallenge,
    ACCOUNT_STATUS,
    checkTempBanExpiry,
    generateAntiOcrNoise,
    getCurrentPolicy,
    needsAcceptance,
    getUserAcceptance,
    getAdaptiveDifficulty,
    getAccountStatusForUser,
    getUnreadRiskEventCount,
    createHumanChallenge,
    verifyHumanChallenge,
    generateNumericCaptcha,
    generateMathCaptcha,
    generateRotateCaptcha,
    generateSequenceCaptcha,
    generateAudioCaptcha,
    getImageCaptchaStats,
    ipReputation,
    requestTracker,
    publicLimiter,
    captchaLimiter,
    connectionTracker,
    getRuntimeSecurityStatus,
    getRuntimeGuardViolations,
    getAuditLog,
    getGovernorStatus,
    getResourceShieldStatus,
  } = deps;

  // ===== 内存存储 =====
  const captchaStore = new Map();
  const adminCaptchaStore = new Map();
  const riskTokenStore = new Map();
  const behaviorFingerprint = new BehaviorFingerprint();

  // ===== 跨域来源白名单 =====
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://localhost:4173').split(',').map(s => s.trim());

  // ===== 工具函数 =====

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

  // ===== 行为风险令牌校验中间件 =====
  function validateRiskToken(req, res, next) {
    const token = req.headers['x-risk-token'];
    if (!token || typeof token !== 'string') { next(); return; }

    const stored = riskTokenStore.get(token);
    if (!stored || stored.expires < Date.now()) {
      riskTokenStore.delete(token);
      next();
      return;
    }

    req.riskData = {
      score: stored.score,
      sessionId: stored.sessionId,
      level: stored.score > 70 ? 'high' : stored.score > 40 ? 'medium' : 'low',
    };

    next();
  }

  router.use('/security', validateRiskToken);

  // ===================================================================
  // 1. POST /api/security/behavior — 行为风险分析
  // ===================================================================
  router.post('/security/behavior', publicLimiter, async (req, res) => {
    const { sessionId, features } = req.body;

    let riskScore = 0;
    let riskDetails = [];

    if (features) {
      if (features.mouseNaturalness !== undefined) {
        if (features.mouseNaturalness < 0.3) { riskScore += 30; riskDetails.push('鼠标自然度过低'); }
        else if (features.mouseNaturalness < 0.5) { riskScore += 15; riskDetails.push('鼠标自然度偏低'); }
      }
      if (features.keyRhythm !== undefined) {
        if (features.keyRhythm < 0.2) { riskScore += 25; riskDetails.push('键盘节奏异常'); }
        else if (features.keyRhythm < 0.4) { riskScore += 10; riskDetails.push('键盘节奏偏低'); }
      }
      if (features.straightLineRatio > 0.7) { riskScore += 20; riskDetails.push('直线移动比例过高'); }
      if (features.pageFocusLosses > 5) { riskScore += 10; riskDetails.push('焦点丢失次数过多'); }
      if (features.sessionAge < 3000) { riskScore += 15; riskDetails.push('会话时间过短'); }

      // 行为指纹识别 — 检测自动化工具
      const session = {
        events: features.events || [],
        focusLosses: features.pageFocusLosses || 0,
        scrollDepth: features.scrollDepth || 0,
        duration: features.sessionAge || 0,
      };
      const fp = behaviorFingerprint.extract(session);
      const identify = behaviorFingerprint.identify(sessionId || 'anonymous', fp);

      if (identify.isAutomated) {
        riskScore += 40;
        riskDetails.push('行为指纹匹配自动化工具');
      }
    }

    const riskToken = crypto.randomUUID();
    riskTokenStore.set(riskToken, {
      score: riskScore,
      sessionId,
      features,
      expires: Date.now() + 5 * 60 * 1000,
    });

    const riskLevel = riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low';
    res.json({ success: true, riskToken, riskScore, riskLevel, riskDetails });
  });

  // ===================================================================
  // 2. POST /api/security/environment-check — 环境检测
  // ===================================================================
  router.post('/security/environment-check', publicLimiter, (req, res) => {
    const { signals, localScore, localSafe } = req.body;
    if (!signals) { res.status(400).json({ success: false, message: '缺少signals' }); return; }

    const details = [];
    let serverScore = 0;
    let maxScore = 0;

    function add(signal, suspicious, weight) {
      maxScore += weight;
      if (suspicious) serverScore += weight;
      details.push({ signal, verdict: suspicious ? '异常' : '正常', weight });
    }

    add('IP信誉分析', false, 5);
    add('UserAgent与IP不匹配', false, 15);
    add('请求频率异常', false, 10);

    const ip = getClientIP(req);
    const ipScore = ipReputation?.getScore ? ipReputation.getScore(ip) : 0;
    if (ipScore > 50) {
      const existingIp = details.find(d => d.signal === 'IP信誉分析');
      if (existingIp) { existingIp.verdict = '异常'; existingIp.weight = 15; serverScore += 10; }
    }

    const ipRate = requestTracker?.getRate ? requestTracker.getRate(ip) : 0;
    if (ipRate > 20) {
      const existingRate = details.find(d => d.signal === '请求频率异常');
      if (existingRate) { existingRate.verdict = '异常'; existingRate.weight = 15; serverScore = serverScore - 10 + 15; }
    }

    const combinedScore = Math.max(localScore || 0, maxScore > 0 ? Math.round((serverScore / maxScore) * 100) : 0);
    const avgScore = Math.round(((localScore || 0) + combinedScore) / 2);

    let safe = true;
    let reason = '环境正常，放行';
    if (avgScore >= 40) {
      safe = false;
      const anomalyCount = details.filter(d => d.verdict === '异常').length;
      reason = `检测到 ${anomalyCount} 项服务端环境异常，操作被拦截`;
    } else if (avgScore >= 15) {
      reason = '环境存在轻微异常，已记录';
    }

    res.json({ success: true, data: { safe, score: avgScore, reason, details } });
  });

  // ===================================================================
  // 3. GET /api/security/overview — 安全概览
  // ===================================================================
  router.get('/security/overview', authMiddleware, (req, res) => {
    const overview = getSecurityOverview(req.tokenPayload.userId);
    res.json({ success: true, data: overview });
  });

  // ===================================================================
  // 4. GET /api/security/events — 风险事件列表
  // ===================================================================
  router.get('/security/events', authMiddleware, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const events = getRiskEvents(req.tokenPayload.userId, limit);
    res.json({ success: true, data: events });
  });

  // ===================================================================
  // 5. POST /api/security/events/read — 标记风险事件已读
  // ===================================================================
  router.post('/security/events/read', authMiddleware, (req, res) => {
    const { eventIds } = req.body;
    if (!Array.isArray(eventIds)) {
      return res.status(400).json({ success: false, message: '参数无效' });
    }
    markRiskEventsRead(req.tokenPayload.userId, eventIds);
    res.json({ success: true });
  });

  // ===================================================================
  // 6. GET /api/security/status — 安全状态（精简版）
  // ===================================================================
  router.get('/security/status', (req, res) => {
    const token = req.cookies?.access_token;
    if (!token) {
      return res.json({ success: true, data: { status: 'safe', score: 0, needsAttention: false } });
    }
    try {
      const getJwtSecret = () => process.env.JWT_SECRET;
      const payload = jwt.verify(token, getJwtSecret());
      req.tokenPayload = payload;
      const status = getAccountStatusForUser(req);
      res.json({ success: true, data: status });
    } catch {
      res.json({ success: true, data: { status: 'safe', score: 0, needsAttention: false } });
    }
  });

  // ===================================================================
  // 7. GET /api/security/challenge — PoW 挑战
  // ===================================================================
  router.get('/security/challenge', (req, res) => {
    const clientIP = getClientIP(req) || req.ip || '';
    const userId = req.query.userId || null;
    const difficulty = getAdaptiveDifficulty(userId, clientIP);
    const challenge = generateRiskChallenge(difficulty, clientIP);
    if (challenge.error) {
      if (process.env.NODE_ENV !== 'production') {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mPOW_CHALLENGE_BLOCKED\x1b[0m  ${time}`)
        console.log(`  路径: GET /api/security/challenge  |  来源: ${clientIP}`)
        console.log(`  详情: ${challenge.message}`)
      }
      return res.status(429).json({
        success: false,
        message: challenge.message,
        retryAfter: challenge.retryAfter,
      });
    }
    if (process.env.NODE_ENV !== 'production') {
      const time = new Date().toLocaleTimeString('zh-CN');
      console.log(`\x1b[90m  [PoW] ${time} 挑战已发放 difficulty=${difficulty} ← ${clientIP}\x1b[0m`)
    }
    res.json({ success: true, data: challenge });
  });

  // ===================================================================
  // 8. POST /api/security/challenge/verify — 验证 PoW 挑战
  // ===================================================================
  router.post('/security/challenge/verify', (req, res) => {
    const { challengeId, nonce, clientTimestamp } = req.body;
    const clientIP = getClientIP(req) || req.ip || '';
    if (!challengeId || !nonce) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    const result = verifyRiskChallenge(challengeId, nonce, clientTimestamp, clientIP);
    if (process.env.NODE_ENV !== 'production') {
      const time = new Date().toLocaleTimeString('zh-CN');
      if (result.valid) {
        console.log(`\x1b[90m  [PoW] ${time} 挑战验证通过 ← ${clientIP}\x1b[0m`)
      } else {
        console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mPOW_VERIFY_FAILED\x1b[0m  ${time}`)
        console.log(`  路径: POST /api/security/challenge/verify  |  来源: ${clientIP}`)
        console.log(`  详情: ${result.reason || '验证失败'}`)
      }
    }
    res.json({ success: result.valid, data: result });
  });

  // ===================================================================
  // 9. GET /api/security/unread-events — 未读风险事件数量
  // ===================================================================
  router.get('/security/unread-events', authMiddleware, (req, res) => {
    const count = getUnreadRiskEventCount(req.tokenPayload.userId);
    res.json({ success: true, data: { count } });
  });

  // ===================================================================
  // 10. GET /api/security/ban-info — 封禁详情
  // ===================================================================
  router.get('/security/ban-info', authMiddleware, (req, res) => {
    const overview = getSecurityOverview(req.tokenPayload.userId);
    res.json({
      success: true,
      data: {
        banInfo: overview.banInfo,
        banHistory: overview.banHistory,
        appealStatus: overview.appealStatus,
        autoBanCount: overview.autoBanCount,
      }
    });
  });

  // ===================================================================
  // 11. POST /api/security/unblock — 封禁自助解封通道
  // ===================================================================
  // 缓解蜜罐误伤：良性用户被临时隔离后，可通过“人机挑战”证明自己是真人后自助解封。
  // 必须校验一次性人机令牌，防止被封 IP 直接调用绕过封禁。
  router.post('/security/unblock', publicLimiter, async (req, res) => {
    try {
      const { humanToken } = req.body || {};
      const ip = getClientIP(req) || req.ip || '';

      // 1. 人机证明：无有效令牌则拒绝，防止自动化直接解封
      const proof = verifyHumanChallenge(req, humanToken);
      if (!proof.success) {
        if (process.env.NODE_ENV !== 'production') {
          const time = new Date().toLocaleTimeString('zh-CN');
          console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mUNBLOCK_VERIFY_FAILED\x1b[0m  ${time}`)
          console.log(`  路径: POST /api/security/unblock  |  来源: ${ip}`)
          console.log(`  详情: ${proof.reason || '人机验证失败'}`)
        }
        return res.status(403).json({
          success: false,
          message: proof.reason || '人机验证失败，无法解封',
          code: 'HUMAN_VERIFICATION_FAILED',
        });
      }

      // 2. 仅当当前确实处于封禁状态才允许解封并记录
      const wasBlocked = ipReputation.isBlocked(ip);
      ipReputation.unblock(ip);

      if (process.env.NODE_ENV !== 'production') {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\x1b[32m  [Unblock] ${time} IP 已${wasBlocked ? '解封' : '确认未封禁'} ← ${ip}\x1b[0m`);
      }

      res.json({
        success: true,
        data: {
          unblocked: wasBlocked,
          ip,
          message: wasBlocked ? '已解除封禁，请稍候重试' : '当前 IP 未被封禁',
        },
      });
    } catch (err) {
      console.error('[Unblock] 解封失败:', err.message);
      res.status(500).json({ success: false, message: '解封失败，请稍后再试' });
    }
  });

  // ===================================================================
  // 12. POST /api/security/ip-check — IP 风险检测
  // ===================================================================
  router.post('/security/ip-check', publicLimiter, async (req, res) => {
    try {
      const ip = req.body?.ip || getClientIP(req);
      const riskData = await getIPRisk(ip);

      if (!riskData) {
        return res.json({
          success: true,
          data: {
            risk_score: 0,
            is_vpn: false,
            is_proxy: false,
            is_tor: false,
            is_datacenter: false,
            is_abuser: false,
            country: null,
            message: '无法获取 IP 风险信息（本地地址或服务暂不可用）',
          },
        });
      }

      res.json({
        success: true,
        data: riskData,
      });
    } catch (err) {
      console.warn('[IPCheck] 检测失败:', err.message);
      res.status(500).json({ success: false, message: 'IP 风险检测服务暂时不可用' });
    }
  });

  // ===================================================================
  // 12. POST /api/security/invalidate-sessions — 失效会话
  // ===================================================================
  router.post('/security/invalidate-sessions', authMiddleware, async (req, res) => {
    try {
      await invalidateUserSessions(req.tokenPayload.userId);
      res.json({ success: true, message: '所有会话已失效，请重新登录' });
    } catch (err) {
      res.status(500).json({ success: false, message: '操作失败' });
    }
  });

  // ===================================================================
  // 13. GET /api/human-challenge — 人机挑战令牌
  // ===================================================================
  router.get('/human-challenge', (req, res) => {
    try {
      const origin = req.headers.origin || req.headers.referer || '';
      const ip = getClientIP(req) || req.ip || '';
      if (!origin || !isSameOriginUrl(origin)) {
        if (process.env.NODE_ENV !== 'production') {
          const time = new Date().toLocaleTimeString('zh-CN');
          console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mHUMAN_CHALLENGE_BLOCKED\x1b[0m  ${time}`)
          console.log(`  路径: GET /api/human-challenge  |  来源: ${ip}`)
          console.log(`  详情: 非法来源 - ${origin || '无 Origin'}`)
        }
        return res.status(403).json({ success: false, message: '非法来源', code: 'HUMAN_CHALLENGE_ORIGIN_BLOCKED' });
      }
      const challenge = createHumanChallenge(req);
      if (!challenge) {
        if (process.env.NODE_ENV !== 'production') {
          const time = new Date().toLocaleTimeString('zh-CN');
          console.log(`\n\x1b[43m\x1b[30m ▲ 警告 \x1b[0m \x1b[33mHUMAN_CHALLENGE_RATE_LIMITED\x1b[0m  ${time}`)
          console.log(`  路径: GET /api/human-challenge  |  来源: ${ip}`)
          console.log(`  详情: 请求过于频繁，触发限流`)
        }
        return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试', code: 'HUMAN_CHALLENGE_RATE_LIMITED' });
      }
      if (process.env.NODE_ENV !== 'production') {
        const time = new Date().toLocaleTimeString('zh-CN');
        console.log(`\x1b[90m  [HumanChallenge] ${time} 挑战令牌已发放 ← ${ip}\x1b[0m`)
      }
      res.json({ success: true, data: { token: challenge.token, expiresAt: challenge.expiresAt } });
    } catch (err) {
      console.error('[HumanChallenge] 生成挑战令牌失败:', err.message);
      res.status(500).json({ success: false, message: '人机验证初始化失败' });
    }
  });

  // ===================================================================
  // 14. GET /api/captcha — SVG 验证码
  // ===================================================================
  router.get('/captcha', captchaLimiter, (req, res) => {
    const captcha = svgCaptcha.create({
      size: 4,
      ignoreChars: '0o1il',
      noise: 5,
      color: true,
      background: '#faf8f5',
      width: 130,
      height: 48,
    });
    const antiOcr = generateAntiOcrNoise(130, 48, 0.8);
    const svg = captcha.data.replace('</svg>', antiOcr + '</svg>');
    const id = crypto.randomUUID();
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '';
    const uaHash = crypto.createHash('sha256').update(ua).digest('hex').slice(0, 16);
    captchaStore.set(id, {
      code: captcha.text.toLowerCase(),
      expires: Date.now() + 5 * 60 * 1000,
      ip,
      uaHash,
      createdAt: Date.now(),
    });
    let ipCount = 0, oldest = Infinity, oldestKey = null;
    for (const [k, v] of captchaStore) {
      if (v.ip === ip) {
        ipCount++;
        if (v.createdAt < oldest) { oldest = v.createdAt; oldestKey = k; }
      }
    }
    if (ipCount > 5 && oldestKey) captchaStore.delete(oldestKey);
    res.json({ success: true, captchaId: id, svg: svg });
  });

  // ===================================================================
  // 15. GET /api/captcha/image — 新型图形验证码
  // ===================================================================
  router.get('/captcha/image', captchaLimiter, (req, res) => {
    const allowedTypes = new Set(['numeric', 'math', 'rotate', 'sequence', 'audio']);
    const type = allowedTypes.has(req.query.type) ? req.query.type : 'numeric';
    const highContrast = req.query.highContrast === 'true';
    try {
      let result;
      let hint;
      switch (type) {
        case 'math':
          result = generateMathCaptcha({ width: 180, height: 64, noise: 4, highContrast });
          hint = '请输入图片中算式的结果';
          break;
        case 'rotate':
          result = generateRotateCaptcha({ size: 160, highContrast });
          hint = '拖动滑块旋转刻度盘，使指针指向圆点标记';
          break;
        case 'sequence':
          result = generateSequenceCaptcha({ size: 180, highContrast });
          hint = '请按 1、2、3、4 的顺序依次点选圆点';
          break;
        case 'audio':
          result = generateAudioCaptcha({ length: 4 });
          hint = result.hint;
          break;
        case 'numeric':
        default:
          result = generateNumericCaptcha({ length: 4, width: 160, height: 64, noise: 4, highContrast });
          hint = '请输入图片中的数字';
          break;
      }

      const response = {
        success: true,
        type,
        token: result.token,
        hint,
        highContrast,
      };

      if (type === 'audio') {
        response.digits = null;
      } else {
        response.image = result.dataUrl;
        if (type === 'sequence' || type === 'rotate') {
          response.svg = result.svg;
        }
      }

      res.json(response);
    } catch (err) {
      console.error('[Captcha] 生成图形验证码失败:', err.message);
      res.status(500).json({ success: false, message: '验证码生成失败，请重试' });
    }
  });

  // ===================================================================
  // 16. GET /api/captcha/image/stats — 图形验证码统计
  // ===================================================================
  router.get('/captcha/image/stats', (req, res) => {
    res.json({ success: true, data: getImageCaptchaStats() });
  });

  // ===================================================================
  // 17. GET /api/privacy/policy — 隐私政策
  // ===================================================================
  router.get('/privacy/policy', (req, res) => {
    res.json({
      success: true,
      data: {
        version: '2.0.0',
        updatedAt: '2026-06-01',
        summary: 'LinguaLeap 致力于保护您的隐私。本政策说明我们如何收集、使用和保护您的个人数据。',
        sections: [
          { title: '收集的信息', content: '我们仅收集账号必需信息（用户名、邮箱）和学习进度数据，用于提供个性化学习体验。' },
          { title: '数据使用方式', content: '数据仅用于改进学习体验、发送课程通知和平台安全维护。不会将个人数据出售给任何第三方。' },
          { title: 'Cookie 政策', content: '使用必要的 Session Cookie 维持登录状态。分析型 Cookie 仅在您明确同意后使用。' },
          { title: '数据保留期限', content: '活跃账户数据保留至您主动删除账户。删除后备份数据在最多90天内完全清除。' },
          { title: '您的权利', content: '您拥有访问权、更正权、删除权（被遗忘权）、限制处理权、数据可携带权和反对权。' },
          { title: '数据安全', content: '采用 AES-256 加密传输、bcrypt 密码哈希、严格 CSP 和定期安全审计保护您的数据。' },
          { title: '联系我们', content: '如有隐私问题请联系 privacy@lingualeap.app，我们承诺72小时内回复。' },
        ],
      },
    });
  });

  // ===================================================================
  // 18. GET /api/security/dashboard — 安全防护系统仪表盘（聚合各模块状态）
  // ===================================================================
  router.get('/security/dashboard', authMiddleware, adminClientCertGate, async (req, res) => {
    try {
      // 1. TCP-WAF 状态
      const wafBlockedIPs = []
      const now = Date.now()
      for (const [ip, info] of connectionTracker.blockedIPs) {
        wafBlockedIPs.push({
          ip,
          reason: info.reason,
          blockedAt: new Date(info.blockedAt).toISOString(),
          blockUntil: new Date(info.blockUntil).toISOString(),
          remainingSeconds: Math.max(0, Math.ceil((info.blockUntil - now) / 1000)),
          duration: info.duration,
        })
      }
      let totalConnections = 0
      let totalRequests = 0
      for (const [, entry] of connectionTracker.connections) {
        totalConnections += entry.sockets?.size || 0
        totalRequests += entry.history?.length || 0
      }

      // 2. RuntimeGuard 状态
      const runtimeStatus = getRuntimeSecurityStatus()
      const recentViolations = getRuntimeGuardViolations(20)

      // 3. 审计日志摘要
      const auditStats = getAuditLog({ limit: 1 })
      const recentLogs = getAuditLog({ limit: 30 })

      // 4. 组装仪表盘数据
      const dashboard = {
        timestamp: new Date().toISOString(),
        tcpWaf: {
          blockedCount: wafBlockedIPs.length,
          blockedIPs: wafBlockedIPs,
          activeConnections: totalConnections,
          totalTrackedIPs: connectionTracker.connections.size,
          totalRequestsInWindow: totalRequests,
        },
        runtimeGuard: {
          status: runtimeStatus.status,
          lastCheckAt: runtimeStatus.lastCheckAt,
          checksPassed: runtimeStatus.checksPassed,
          checksFailed: runtimeStatus.checksFailed,
          violationCount: runtimeStatus.violationCount,
          seriousViolation: runtimeStatus.seriousViolation,
          antiDebug: runtimeStatus.antiDebug,
          memoryGuard: runtimeStatus.memoryGuard,
          processSandbox: runtimeStatus.processSandbox,
          runtimeIntegrity: runtimeStatus.runtimeIntegrity,
          recentViolations: recentViolations.map(v => ({
            type: v.type,
            detail: v.detail,
            at: v.at,
            serious: v.serious,
          })),
        },
        auditLog: {
          total: auditStats.total || 0,
          recentEvents: recentLogs.data?.slice(0, 20) || [],
        },
        // 5. 性能调控器数据
        governor: getGovernorStatus(),
        // 6. 资源护盾数据
        resourceShield: getResourceShieldStatus(),
      }

      res.json({ success: true, data: dashboard })
    } catch (err) {
      console.error('[SecurityDashboard] 获取仪表盘数据失败:', err.message)
      res.status(500).json({ success: false, message: '获取安全仪表盘数据失败' })
    }
  })

  return router;
}