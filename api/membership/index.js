import { Router } from 'express';
import crypto from 'crypto';
import { saveUsers } from '../persistence.js';
import { createMemoryRateLimiter } from '../security/core/rateLimiter.js';
import { logAudit, getClientIP } from '../security/core/auditLogger.js';

// 会员计划与定价（单位：分）
const PLANS = {
  basic: {
    name: '基础会员',
    prices: { monthly: 1800, yearly: 16800, lifetime: 29800 },
  },
  pro: {
    name: '高级会员',
    prices: { monthly: 3800, yearly: 36800, lifetime: 59800 },
  },
};

// 权益矩阵
const PRIVILEGES = {
  courses: {
    free: { access: 'basic' },
    basic: { access: 'partial', ratio: 0.6 },
    pro: { access: 'all' },
  },
  aiChatDaily: {
    free: 10,
    basic: 50,
    pro: Infinity,
  },
  dailyChallenge: {
    free: 1,
    basic: 3,
    pro: Infinity,
  },
  battleDaily: {
    free: 3,
    basic: 10,
    pro: Infinity,
  },
  learningReport: {
    free: 'basic',
    basic: 'weekly',
    pro: 'advanced',
  },
  offlineDownload: {
    free: 0,
    basic: 5,
    pro: Infinity,
  },
  advancedSpeech: {
    free: false,
    basic: true,
    pro: true,
  },
  communityBadge: {
    free: 'none',
    basic: 'silver',
    pro: 'gold',
  },
  ads: {
    free: true,
    basic: 'reduced',
    pro: false,
  },
};

const PERIOD_NAMES = {
  monthly: '月卡',
  yearly: '年卡',
  lifetime: '永久',
};

// 内存订单数据库
const subscriptionsDB = new Map();

// ========== 支付保护模块 ==========
const PAYMENT_SECRET = process.env.PAYMENT_SECRET || 'dev-payment-secret-change-me';
const PAYMENT_PROTECTION_ENABLED = process.env.PAYMENT_PROTECTION_ENABLED !== 'false';
const SIGNATURE_TTL_MS = 5 * 60 * 1000; // 订单签名有效期 5 分钟
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 防重放时间窗 5 分钟
const NONCE_TTL_MS = 10 * 60 * 1000; // nonce 存活 10 分钟

// 支付相关审计与防护状态
const paymentStats = {
  protectedOrders: 0,
  blockedAttempts: 0,
  verifiedPayments: 0,
};

// 已使用的 nonce（防重放）
const usedNonces = new Map();

function getPaymentSecret() {
  if (PAYMENT_SECRET === 'dev-payment-secret-change-me' && process.env.NODE_ENV === 'production') {
    console.warn('[PaymentProtection] 正在使用默认支付密钥，请在生产环境设置 PAYMENT_SECRET');
  }
  return PAYMENT_SECRET;
}

function generateSignature(payload) {
  const secret = getPaymentSecret();
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(text).digest('hex');
}

function createOrderSignature(order) {
  const payload = [order.id, order.outTradeNo, order.amount, order.paymentMethod, order.userId].join('|');
  return generateSignature(payload);
}

function verifyOrderSignature(order, signature) {
  if (!signature || typeof signature !== 'string') return false;
  const expected = createOrderSignature(order);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

function getRequestFingerprint(req) {
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '';
  return generateSignature(`${ip}|${ua}`).slice(0, 32);
}

function isReplayAttack(nonce, timestamp) {
  if (!nonce || typeof nonce !== 'string' || nonce.length < 8) return true;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return true;
  const now = Date.now();
  if (Math.abs(now - ts) > REPLAY_WINDOW_MS) return true;
  if (usedNonces.has(nonce)) return true;
  return false;
}

function markNonceUsed(nonce) {
  usedNonces.set(nonce, Date.now() + NONCE_TTL_MS);
}

function cleanExpiredNonces() {
  const now = Date.now();
  for (const [nonce, expiry] of usedNonces) {
    if (now > expiry) usedNonces.delete(nonce);
  }
}

setInterval(cleanExpiredNonces, 60 * 1000);

function canTransitionTo(currentStatus, newStatus) {
  const allowed = {
    pending: ['paid', 'closed'],
    paid: [],
    closed: [],
  };
  return allowed[currentStatus]?.includes(newStatus) || false;
}

function upgradeUserMembership(user, order) {
  user.membership = order.plan;
  user.membershipType = order.period;
  user.membershipBoughtAt = new Date().toISOString();
  if (order.period !== 'lifetime') {
    const now = new Date();
    if (order.period === 'monthly') {
      user.membershipExpiresAt = new Date(now.setMonth(now.getMonth() + 1)).toISOString();
    } else if (order.period === 'yearly') {
      user.membershipExpiresAt = new Date(now.setFullYear(now.getFullYear() + 1)).toISOString();
    }
  } else {
    user.membershipExpiresAt = null;
  }
}

function recordOrderSignature(order) {
  order.signature = createOrderSignature(order);
  order.signatureExpiresAt = Date.now() + SIGNATURE_TTL_MS;
  paymentStats.protectedOrders += 1;
}

async function processPaymentSuccess(order, tradeNo, req) {
  if (!canTransitionTo(order.status, 'paid')) {
    return { success: false, code: 'INVALID_STATUS', message: '订单状态异常' };
  }

  order.status = 'paid';
  order.tradeNo = tradeNo;
  order.paidAt = new Date().toISOString();

  const user = [...usersDBGlobal.values()].find(u => u.id === order.userId);
  if (!user) {
    return { success: false, code: 'USER_NOT_FOUND', message: '用户不存在' };
  }

  upgradeUserMembership(user, order);
  await saveUsers(usersDBGlobal);
  paymentStats.verifiedPayments += 1;

  logAudit({
    userId: user.id,
    action: 'MEMBERSHIP_PAYMENT_SUCCESS',
    ip: req ? getClientIP(req) : 'system',
    success: true,
    details: {
      orderId: order.id,
      outTradeNo: order.outTradeNo,
      plan: order.plan,
      period: order.period,
      amount: order.amount,
      paymentMethod: order.paymentMethod,
      tradeNo,
      fingerprint: req ? getRequestFingerprint(req) : null,
    },
  });

  return { success: true, membership: getMembershipStatus(user) };
}

function generateOutTradeNo() {
  return `LL${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function getExpiredMembership(user) {
  if (!user) return { level: 'free', expired: false };
  const level = user.membership || 'free';
  if (level === 'free') return { level: 'free', expired: false };
  if (user.membershipType === 'lifetime') return { level, expired: false };
  const expiresAt = user.membershipExpiresAt ? new Date(user.membershipExpiresAt) : null;
  if (expiresAt && expiresAt < new Date()) {
    return { level: 'free', expired: true, originalLevel: level };
  }
  return { level, expired: false, expiresAt };
}

export function downgradeExpiredUser(user) {
  const status = getExpiredMembership(user);
  if (status.expired) {
    user.membership = 'free';
    user.membershipType = null;
    user.membershipExpiresAt = null;
    user.membershipBoughtAt = null;
    return true;
  }
  return false;
}

export function getMembershipStatus(user) {
  downgradeExpiredUser(user);
  const level = user.membership || 'free';
  return {
    membership: level,
    type: user.membershipType || null,
    expiresAt: user.membershipExpiresAt || null,
    boughtAt: user.membershipBoughtAt || null,
    privileges: Object.fromEntries(
      Object.entries(PRIVILEGES).map(([key, config]) => [key, config[level]])
    ),
  };
}

export function checkPrivilege(user, feature, options = {}) {
  downgradeExpiredUser(user);
  const level = user.membership || 'free';
  const config = PRIVILEGES[feature];
  if (!config) return { allowed: false, reason: '未知权益' };
  const value = config[level];

  if (feature === 'courses') {
    const { isAdvanced, courseId } = options;
    if (level === 'free' && isAdvanced) {
      return { allowed: false, reason: '高级课程需要会员', required: 'basic' };
    }
    if (level === 'basic' && isAdvanced) {
      const hash = parseInt(crypto.createHash('sha256').update(courseId || '').digest('hex').substring(0, 8), 16);
      const inRatio = hash % 100 < 60;
      if (!inRatio) {
        return { allowed: false, reason: '该课程需要高级会员', required: 'pro' };
      }
    }
    return { allowed: true };
  }

  if (typeof value === 'number') {
    const used = options.used || 0;
    if (value === Infinity) return { allowed: true, remaining: Infinity };
    if (used >= value) {
      return { allowed: false, reason: '今日次数已用完', limit: value, remaining: 0 };
    }
    return { allowed: true, limit: value, remaining: value - used };
  }

  if (typeof value === 'boolean') {
    return { allowed: value, reason: value ? undefined : '该功能需要会员' };
  }

  return { allowed: true, value };
}

function validateOrderInput(plan, period, paymentMethod) {
  if (!['basic', 'pro'].includes(plan)) return '会员类型无效';
  if (!['monthly', 'yearly', 'lifetime'].includes(period)) return '购买周期无效';
  if (!['alipay', 'wechat'].includes(paymentMethod)) return '支付方式无效';
  return null;
}

function getPlanAmount(plan, period) {
  return PLANS[plan].prices[period];
}

let usersDBGlobal = new Map();

export function createMembershipRouter({ authMiddleware, usersDB }) {
  const router = Router();
  usersDBGlobal = usersDB;

  // 支付相关限流器
  const orderRateLimiter = createMemoryRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.tokenPayload?.userId || getClientIP(req),
    handler: (req, res) => {
      logAudit({
        userId: req.tokenPayload?.userId,
        action: 'PAYMENT_RATE_LIMITED',
        ip: getClientIP(req),
        success: false,
        details: { path: req.path, reason: '创建订单过于频繁' },
      });
      res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
    },
  });

  const payRateLimiter = createMemoryRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.tokenPayload?.userId || getClientIP(req),
    handler: (req, res) => {
      logAudit({
        userId: req.tokenPayload?.userId,
        action: 'PAYMENT_RATE_LIMITED',
        ip: getClientIP(req),
        success: false,
        details: { path: req.path, reason: '支付确认过于频繁' },
      });
      res.status(429).json({ success: false, message: '操作过于频繁，请稍后再试' });
    },
  });

  router.get('/', authMiddleware, (req, res) => {
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    res.json({ success: true, data: getMembershipStatus(user) });
  });

  // 支付保护状态
  router.get('/payment-protection/status', authMiddleware, (req, res) => {
    res.json({
      success: true,
      data: {
        enabled: PAYMENT_PROTECTION_ENABLED,
        features: [
          { id: 'signature', name: '订单签名防篡改', active: true },
          { id: 'fingerprint', name: '请求指纹追踪', active: true },
          { id: 'rateLimit', name: '支付接口限流', active: true },
          { id: 'replay', name: '防重放攻击', active: true },
          { id: 'stateMachine', name: '订单状态机保护', active: true },
          { id: 'audit', name: '支付审计日志', active: true },
        ],
        stats: {
          protectedOrders: paymentStats.protectedOrders,
          blockedAttempts: paymentStats.blockedAttempts,
          verifiedPayments: paymentStats.verifiedPayments,
        },
      },
    });
  });

  router.post('/order', authMiddleware, orderRateLimiter, (req, res) => {
    const { plan, period, paymentMethod } = req.body || {};
    const validationError = validateOrderInput(plan, period, paymentMethod);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }
    const amount = getPlanAmount(plan, period);
    const orderId = crypto.randomUUID();
    const outTradeNo = generateOutTradeNo();
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

    const order = {
      id: orderId,
      userId: user.id,
      plan,
      period,
      amount,
      currency: 'CNY',
      paymentMethod,
      status: 'pending',
      outTradeNo,
      tradeNo: null,
      paidAt: null,
      createdAt: new Date().toISOString(),
    };

    recordOrderSignature(order);
    subscriptionsDB.set(orderId, order);

    logAudit({
      userId: user.id,
      action: 'MEMBERSHIP_ORDER_CREATED',
      ip: getClientIP(req),
      success: true,
      details: {
        orderId,
        outTradeNo,
        plan,
        period,
        amount,
        paymentMethod,
        fingerprint: getRequestFingerprint(req),
      },
    });

    // 沙箱环境：返回模拟支付链接，前端进入本地收银台
    const payUrl = `/membership/checkout?orderId=${orderId}&sandbox=1`;

    res.json({
      success: true,
      data: {
        orderId,
        outTradeNo,
        payUrl,
        amount,
        signature: order.signature,
        protectionEnabled: PAYMENT_PROTECTION_ENABLED,
      },
    });
  });

  router.get('/order/:id', authMiddleware, (req, res) => {
    const order = subscriptionsDB.get(req.params.id);
    if (!order || order.userId !== req.tokenPayload.userId) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }
    res.json({ success: true, data: order });
  });

  router.get('/check', authMiddleware, (req, res) => {
    const { feature } = req.query;
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    const options = {};
    if (feature === 'courses') {
      options.isAdvanced = req.query.isAdvanced === 'true';
      options.courseId = req.query.courseId;
    } else {
      options.used = parseInt(req.query.used || '0', 10) || 0;
    }
    res.json({ success: true, data: checkPrivilege(user, feature, options) });
  });

  // 沙箱支付：模拟支付成功，经过签名/防重放/状态机校验后升级会员
  router.post('/sandbox-pay', authMiddleware, payRateLimiter, async (req, res) => {
    const { orderId, signature, nonce, timestamp } = req.body || {};
    const user = usersDB.get(req.tokenPayload.userId);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

    const order = subscriptionsDB.get(orderId);
    if (!order || order.userId !== user.id) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }

    if (!PAYMENT_PROTECTION_ENABLED) {
      // 保护关闭时走简化流程（仅开发/测试）
      const result = await processPaymentSuccess(order, `SANDBOX${Date.now()}`, req);
      if (!result.success) return res.status(400).json(result);
      return res.json({ success: true, data: { status: 'paid', membership: result.membership } });
    }

    // 1. 签名校验
    if (!verifyOrderSignature(order, signature)) {
      paymentStats.blockedAttempts += 1;
      logAudit({
        userId: user.id,
        action: 'PAYMENT_SIGNATURE_INVALID',
        ip: getClientIP(req),
        success: false,
        details: { orderId, fingerprint: getRequestFingerprint(req) },
      });
      return res.status(403).json({ success: false, message: '订单签名无效', code: 'SIGNATURE_INVALID' });
    }

    // 2. 签名有效期
    if (Date.now() > (order.signatureExpiresAt || 0)) {
      paymentStats.blockedAttempts += 1;
      return res.status(403).json({ success: false, message: '订单签名已过期', code: 'SIGNATURE_EXPIRED' });
    }

    // 3. 防重放
    if (isReplayAttack(nonce, timestamp)) {
      paymentStats.blockedAttempts += 1;
      logAudit({
        userId: user.id,
        action: 'PAYMENT_REPLAY_BLOCKED',
        ip: getClientIP(req),
        success: false,
        details: { orderId, nonce, timestamp },
      });
      return res.status(403).json({ success: false, message: '请求已失效或存在重放风险', code: 'REPLAY_BLOCKED' });
    }
    markNonceUsed(nonce);

    // 4. 状态机保护
    if (order.status === 'paid') {
      return res.json({ success: true, data: { status: 'paid', membership: getMembershipStatus(user) } });
    }
    if (!canTransitionTo(order.status, 'paid')) {
      paymentStats.blockedAttempts += 1;
      return res.status(400).json({ success: false, message: '订单状态异常', code: 'INVALID_STATUS' });
    }

    // 5. 模拟异步通知处理
    const tradeNo = `SANDBOX${Date.now()}`;
    const result = await processPaymentSuccess(order, tradeNo, req);
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.message, code: result.code });
    }

    res.json({ success: true, data: { status: 'paid', membership: result.membership } });
  });

  // 支付宝异步通知（沙箱模拟）
  router.post('/notify/alipay', async (req, res) => {
    const { out_trade_no, trade_no, sign } = req.body || {};
    const order = [...subscriptionsDB.values()].find(o => o.outTradeNo === out_trade_no);

    if (!order) {
      logAudit({
        action: 'ALIPAY_NOTIFY_FAILED',
        ip: getClientIP(req),
        success: false,
        details: { outTradeNo: out_trade_no, reason: '订单不存在' },
      });
      return res.status(400).send('fail');
    }

    if (PAYMENT_PROTECTION_ENABLED && !verifyOrderSignature(order, sign)) {
      paymentStats.blockedAttempts += 1;
      logAudit({
        userId: order.userId,
        action: 'ALIPAY_NOTIFY_SIGNATURE_INVALID',
        ip: getClientIP(req),
        success: false,
        details: { orderId: order.id, outTradeNo: out_trade_no },
      });
      return res.status(403).send('fail');
    }

    const result = await processPaymentSuccess(order, trade_no || `ALIPAY${Date.now()}`, req);
    if (!result.success) return res.status(400).send('fail');

    res.send('success');
  });

  // 微信支付异步通知（沙箱模拟）
  router.post('/notify/wechat', async (req, res) => {
    const { out_trade_no, transaction_id, sign } = req.body || {};
    const order = [...subscriptionsDB.values()].find(o => o.outTradeNo === out_trade_no);

    if (!order) {
      logAudit({
        action: 'WECHAT_NOTIFY_FAILED',
        ip: getClientIP(req),
        success: false,
        details: { outTradeNo: out_trade_no, reason: '订单不存在' },
      });
      return res.status(400).send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
    }

    if (PAYMENT_PROTECTION_ENABLED && !verifyOrderSignature(order, sign)) {
      paymentStats.blockedAttempts += 1;
      logAudit({
        userId: order.userId,
        action: 'WECHAT_NOTIFY_SIGNATURE_INVALID',
        ip: getClientIP(req),
        success: false,
        details: { orderId: order.id, outTradeNo: out_trade_no },
      });
      return res.status(403).send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
    }

    const result = await processPaymentSuccess(order, transaction_id || `WECHAT${Date.now()}`, req);
    if (!result.success) {
      return res.status(400).send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
    }

    res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
  });

  return router;
}

export { PLANS, PERIOD_NAMES, PRIVILEGES };
