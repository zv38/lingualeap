import https from 'https';

// Cloudflare Turnstile 官方测试密钥：always-pass，机器人可轻易绕过
const TURNSTILE_TEST_SECRET_KEYS = [
  '1x0000000000000000000000000000000AA',
];
const TURNSTILE_TEST_SITE_KEYS = [
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
];

function isTestSecretKey(key) {
  return TURNSTILE_TEST_SECRET_KEYS.includes(key);
}

export function isTestSiteKey(key) {
  return TURNSTILE_TEST_SITE_KEYS.includes(key);
}

function isTestKeyAllowed() {
  // 兼容两种开发调试开关，生产环境仍由 startupValidator 统一拦截
  return process.env.TURNSTILE_ALLOW_TEST_KEY === 'true' || process.env.LL_ALLOW_TURNSTILE_TEST_KEY === 'true';
}

/**
 * 验证 Cloudflare Turnstile 令牌
 * @param {string} token 前端提交的 turnstile token
 * @param {string} remoteIp 可选，客户端 IP
 * @returns {Promise<{success: boolean, score?: number, error?: string}>}
 */
export async function verifyTurnstile(token, remoteIp, { urlValidator } = {}) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // 任何环境都必须配置 Turnstile，未配置一律拒绝
  if (!secretKey) {
    return { success: false, error: 'TURNSTILE_SECRET_KEY 未配置' };
  }

  // 军工级：默认拒绝官方测试密钥。只有在显式开启 TURNSTILE_ALLOW_TEST_KEY=true 或 LL_ALLOW_TURNSTILE_TEST_KEY=true 时才允许用于本地 UI 调试，
  // 且该开关在生产环境必须被 startupValidator 拦截。
  if (isTestSecretKey(secretKey) && !isTestKeyAllowed()) {
    return {
      success: false,
      error: '检测到 Turnstile 测试密钥，机器人防护无效。请配置真实密钥或显式开启 TURNSTILE_ALLOW_TEST_KEY=true（仅开发调试）',
      code: 'TURNSTILE_TEST_KEY_BLOCKED',
    };
  }

  if (!token || typeof token !== 'string') {
    return { success: false, error: '缺少 Turnstile 令牌' };
  }

  // 军工级网络边界：出站请求目标必须经过白名单校验
  const targetUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
  if (urlValidator) {
    const allowed = await urlValidator(targetUrl);
    if (!allowed) {
      return { success: false, error: 'Turnstile 请求目标未通过出站安全校验' };
    }
  }

  const postData = new URLSearchParams({
    secret: secretKey,
    response: token,
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'challenges.cloudflare.com',
          path: '/turnstile/v0/siteverify',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData.toString()),
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Turnstile 响应解析失败'));
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Turnstile 请求超时'));
      });

      req.write(postData.toString());
      req.end();
    });

    if (result.success) {
      return { success: true };
    }
    return { success: false, error: 'Turnstile 验证失败', codes: result['error-codes'] };
  } catch (err) {
    return { success: false, error: err.message || 'Turnstile 验证异常' };
  }
}

/**
 * Express 中间件：要求请求携带有效的 Turnstile 令牌
 */
export function requireTurnstile(tokenField = 'turnstileToken', { urlValidator } = {}) {
  return async (req, res, next) => {
    const token = req.body?.[tokenField];
    // 安全规范：Turnstile 校验使用直接连接 IP，不采用可被伪造的 X-Forwarded-For
    const ip = req.socket?.remoteAddress || req.connection?.remoteAddress;
    const result = await verifyTurnstile(token, ip, { urlValidator });

    if (!result.success) {
      return res.status(403).json({
        success: false,
        message: result.error || '人机验证失败',
        code: 'TURNSTILE_FAILED',
      });
    }

    req.turnstile = result;
    next();
  };
}
