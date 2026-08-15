import crypto from 'crypto';
import svgCaptcha from 'svg-captcha';
import { getClientIP } from '../core/auditLogger.js';

// 图形验证码存储：token -> { answer, expires, type, metadata, attempts }
const imageCaptchaStore = new Map();
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 分钟有效期
const MAX_STORE_SIZE = 5000;

// 验证码校验限流：同一 IP 在窗口期内失败次数过多则锁定
const VERIFY_ATTEMPTS = new Map();
const MAX_VERIFY_ATTEMPTS_PER_IP = 10;
const VERIFY_ATTEMPT_WINDOW_MS = 60 * 1000;
const VERIFY_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_TOKEN = 3;

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function cleanupExpired() {
  const now = Date.now();
  for (const [token, record] of imageCaptchaStore) {
    if (record.expires < now) imageCaptchaStore.delete(token);
  }
  for (const [ip, record] of VERIFY_ATTEMPTS) {
    if (record.lockedUntil && record.lockedUntil < now) {
      VERIFY_ATTEMPTS.delete(ip);
    } else if (!record.lockedUntil && record.lastAttempt + VERIFY_ATTEMPT_WINDOW_MS < now) {
      VERIFY_ATTEMPTS.delete(ip);
    }
  }
}

function enforceStoreLimit() {
  if (imageCaptchaStore.size <= MAX_STORE_SIZE) return;
  const entries = [...imageCaptchaStore.entries()].sort((a, b) => a[1].expires - b[1].expires);
  const toRemove = entries.slice(0, entries.length - MAX_STORE_SIZE);
  for (const [token] of toRemove) imageCaptchaStore.delete(token);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 生成抗 OCR 干扰 SVG 元素，包括：
 * - 贝塞尔曲线（比直线更难被 OCR 过滤）
 * - 随机散布的大小不一的圆点
 * - 随机透明矩形覆盖
 */
function generateAntiOcrNoise(width, height, intensity = 1) {
  let elements = '';
  const count = Math.floor(6 * intensity);

  // 贝塞尔曲线干扰
  for (let i = 0; i < count; i++) {
    const x1 = crypto.randomInt(0, width);
    const y1 = crypto.randomInt(0, height);
    const x2 = crypto.randomInt(0, width);
    const y2 = crypto.randomInt(0, height);
    const cx1 = crypto.randomInt(0, width);
    const cy1 = crypto.randomInt(0, height);
    const cx2 = crypto.randomInt(0, width);
    const cy2 = crypto.randomInt(0, height);
    const opacity = (0.08 + Math.random() * 0.12).toFixed(2);
    const strokeWidth = (1 + Math.random() * 1.5).toFixed(1);
    const hue = crypto.randomInt(0, 360);
    elements += `<path d="M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}" fill="none" stroke="hsl(${hue},30%,60%)" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
  }

  // 大小不一的圆点簇
  for (let i = 0; i < count * 4; i++) {
    const cx = crypto.randomInt(2, width - 2);
    const cy = crypto.randomInt(2, height - 2);
    const r = crypto.randomInt(1, 4);
    const opacity = (0.1 + Math.random() * 0.2).toFixed(2);
    const hue = crypto.randomInt(0, 360);
    elements += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue},20%,50%)" opacity="${opacity}" />`;
  }

  // 窄矩形条干扰
  for (let i = 0; i < Math.floor(count / 2); i++) {
    const x = crypto.randomInt(0, width - 10);
    const y = crypto.randomInt(0, height - 2);
    const w = crypto.randomInt(8, 20);
    const h = crypto.randomInt(1, 3);
    const opacity = (0.05 + Math.random() * 0.1).toFixed(2);
    elements += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#999" opacity="${opacity}" transform="rotate(${crypto.randomInt(-30, 31)}, ${x + w / 2}, ${y + h / 2})" />`;
  }

  return elements;
}

/**
 * 高对比度主题：黑白强对比，适合视力障碍用户
 */
function getTheme(highContrast = false) {
  if (highContrast) {
    return {
      bg: '#ffffff',
      fg: '#000000',
      accent: '#000000',
      border: '#000000',
      grid: '#333333',
      muted: '#666666',
      noiseOpacity: 0.15,
    };
  }
  return {
    bg: '#f6f5f2',
    fg: '#4a4a4a',
    accent: '#6d5dfc',
    border: '#e5e4e0',
    grid: '#d5d4d0',
    muted: '#9b9a96',
    noiseOpacity: 0.08,
  };
}

function generateHighContrastNumericSvg(answer, width, height, noise) {
  const chars = answer.split('');
  const step = width / (chars.length + 1);
  let text = '';
  chars.forEach((ch, i) => {
    const x = step * (i + 1);
    const y = height / 2 + 10;
    const rotate = crypto.randomInt(-12, 13);
    text += `<text x="${x}" y="${y}" text-anchor="middle" font-size="42" font-weight="700" fill="#000000" font-family="monospace" transform="rotate(${rotate}, ${x}, ${y})">${ch}</text>`;
  });

  let noiseSvg = '';
  for (let i = 0; i < noise * 2; i++) {
    const x1 = crypto.randomInt(4, width - 4);
    const y1 = crypto.randomInt(4, height - 4);
    const x2 = x1 + crypto.randomInt(-30, 31);
    const y2 = y1 + crypto.randomInt(-10, 11);
    noiseSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000000" stroke-width="1.5" opacity="0.35" />`;
  }
  for (let i = 0; i < noise * 3; i++) {
    const cx = crypto.randomInt(2, width - 2);
    const cy = crypto.randomInt(2, height - 2);
    noiseSvg += `<circle cx="${cx}" cy="${cy}" r="${crypto.randomInt(1, 3)}" fill="#000000" opacity="0.25" />`;
  }

  const antiOcr = generateAntiOcrNoise(width, height, 1.5);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="高对比度数字验证码">
  <rect width="${width}" height="${height}" fill="#ffffff" />
  ${noiseSvg}
  ${antiOcr}
  ${text}
</svg>`;
}

/**
 * 生成数字图形验证码
 * 返回 { token, svg, dataUrl }
 */
export function generateNumericCaptcha({ length = 4, width = 160, height = 64, noise = 4, color = true, highContrast = false } = {}) {
  cleanupExpired();
  enforceStoreLimit();

  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const answer = String(crypto.randomInt(min, max + 1));

  // 增强噪声：默认 6 条贝塞尔曲线 + 散点 + 矩形条
  const effectiveNoise = Math.max(noise, 6);

  let svg;
  if (highContrast) {
    svg = generateHighContrastNumericSvg(answer, width, height, effectiveNoise);
  } else {
    const captcha = svgCaptcha.create({
      size: length,
      width,
      height,
      noise: effectiveNoise,
      color,
      background: '#f6f5f2',
      fontSize: 46,
      charPreset: '0123456789',
    });
    svg = captcha.data;
    // 注入抗 OCR 干扰元素（贝塞尔曲线、散点、矩形条）
    const antiOcr = generateAntiOcrNoise(width, height, 1.2);
    svg = svg.replace('</svg>', antiOcr + '</svg>');
  }

  const token = generateToken();
  imageCaptchaStore.set(token, {
    answer,
    expires: Date.now() + CAPTCHA_TTL_MS,
    type: 'numeric',
    attempts: 0,
  });

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return { token, svg, dataUrl, answer };
}

/**
 * 生成数学图形验证码
 * 返回 { token, svg, dataUrl, expression }
 */
export function generateMathCaptcha({ width = 180, height = 60, noise = 5, highContrast = false } = {}) {
  cleanupExpired();
  enforceStoreLimit();

  const a = crypto.randomInt(1, 20);
  const b = crypto.randomInt(1, 20);
  const operators = ['+', '-'];
  const op = operators[crypto.randomInt(operators.length)];
  let answer;
  let expression;
  if (op === '+') {
    answer = a + b;
    expression = `${a} + ${b}`;
  } else {
    // 保证结果为正
    const x = Math.max(a, b);
    const y = Math.min(a, b);
    answer = x - y;
    expression = `${x} - ${y}`;
  }

  const captcha = svgCaptcha.createMathExpr({
    mathMin: 1,
    mathMax: 20,
    mathOperator: '+',
    width,
    height,
    noise,
    background: highContrast ? '#ffffff' : '#f6f5f2',
    fontSize: 40,
    color: highContrast ? false : true,
  });

  let svg = captcha.data;
  // 注入抗 OCR 干扰元素
  const antiOcr = generateAntiOcrNoise(width, height, 1.0);
  svg = svg.replace('</svg>', antiOcr + '</svg>');

  const token = generateToken();
  imageCaptchaStore.set(token, {
    answer: String(answer),
    expires: Date.now() + CAPTCHA_TTL_MS,
    type: 'math',
    attempts: 0,
  });

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return { token, svg, dataUrl, expression, answer };
}

/**
 * 生成旋转验证码：用户需将刻度盘旋转到目标角度
 * 返回 { token, svg, dataUrl, targetAngle }
 */
export function generateRotateCaptcha({ size = 160, highContrast = false } = {}) {
  cleanupExpired();
  enforceStoreLimit();

  const theme = getTheme(highContrast);
  const targetAngle = crypto.randomInt(0, 360);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.36;

  // 生成刻度
  let ticks = '';
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30) * Math.PI / 180;
    const x1 = cx + (radius - 8) * Math.cos(angle);
    const y1 = cy + (radius - 8) * Math.sin(angle);
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${theme.grid}" stroke-width="2" />`;
  }

  // 目标标记（红色/黑色高对比圆点）
  const targetRad = targetAngle * Math.PI / 180;
  const tx = cx + (radius - 16) * Math.cos(targetRad);
  const ty = cy + (radius - 16) * Math.sin(targetRad);

  // 噪点
  let noise = '';
  for (let i = 0; i < 12; i++) {
    const nx = crypto.randomInt(8, size - 8);
    const ny = crypto.randomInt(8, size - 8);
    const nr = crypto.randomInt(1, 3);
    noise += `<circle cx="${nx}" cy="${ny}" r="${nr}" fill="${theme.muted}" opacity="${theme.noiseOpacity}" />`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="旋转验证码">
  <rect width="${size}" height="${size}" fill="${theme.bg}" rx="12" />
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${theme.border}" stroke-width="2" />
  ${ticks}
  <circle cx="${tx}" cy="${ty}" r="5" fill="${theme.accent}" />
  <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - radius + 18}" stroke="${theme.fg}" stroke-width="3" stroke-linecap="round" />
  <circle cx="${cx}" cy="${cy}" r="6" fill="${theme.fg}" />
  ${noise}
</svg>`;

  const token = generateToken();
  imageCaptchaStore.set(token, {
    answer: String(targetAngle),
    expires: Date.now() + CAPTCHA_TTL_MS,
    type: 'rotate',
    metadata: { tolerance: 15 },
    attempts: 0,
  });

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return { token, svg, dataUrl, targetAngle };
}

/**
 * 生成顺序点选验证码：按 1-2-3-4 顺序点选编号圆点
 * 返回 { token, svg, dataUrl, sequence }
 */
export function generateSequenceCaptcha({ size = 180, highContrast = false } = {}) {
  cleanupExpired();
  enforceStoreLimit();

  const theme = getTheme(highContrast);
  const count = 4;
  const positions = [];
  const padding = 36;
  const available = size - padding * 2;

  // 随机生成不重叠的位置
  let attempts = 0;
  while (positions.length < count && attempts < 200) {
    attempts++;
    const x = padding + crypto.randomInt(0, available);
    const y = padding + crypto.randomInt(0, available);
    const tooClose = positions.some(p => Math.hypot(p.x - x, p.y - y) < 44);
    if (!tooClose) positions.push({ x, y });
  }

  // 兜底：如果随机失败，使用网格布局
  if (positions.length < count) {
    positions.length = 0;
    const grid = [
      { x: size * 0.3, y: size * 0.3 },
      { x: size * 0.7, y: size * 0.3 },
      { x: size * 0.3, y: size * 0.7 },
      { x: size * 0.7, y: size * 0.7 },
    ];
    positions.push(...grid);
  }

  // 绘制圆点
  let dots = '';
  for (let i = 0; i < count; i++) {
    const { x, y } = positions[i];
    const num = i + 1;
    dots += `
      <g class="captcha-dot" data-id="${num}" transform="translate(${x}, ${y})">
        <circle r="22" fill="${theme.bg}" stroke="${theme.border}" stroke-width="2" />
        <circle r="18" fill="none" stroke="${theme.accent}" stroke-width="1.5" stroke-dasharray="4 2" />
        <text y="5" text-anchor="middle" font-size="18" font-weight="600" fill="${theme.fg}" font-family="system-ui, -apple-system, sans-serif">${num}</text>
      </g>`;
  }

  // 噪点
  let noise = '';
  for (let i = 0; i < 10; i++) {
    const nx = crypto.randomInt(4, size - 4);
    const ny = crypto.randomInt(4, size - 4);
    noise += `<circle cx="${nx}" cy="${ny}" r="${crypto.randomInt(1, 3)}" fill="${theme.muted}" opacity="${theme.noiseOpacity}" />`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="顺序点选验证码，请按 1 到 4 的顺序点选圆点">
  <rect width="${size}" height="${size}" fill="${theme.bg}" rx="12" />
  ${noise}
  ${dots}
</svg>`;

  const token = generateToken();
  const answer = positions.map((_, i) => String(i + 1)).join(',');
  imageCaptchaStore.set(token, {
    answer,
    expires: Date.now() + CAPTCHA_TTL_MS,
    type: 'sequence',
  });

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return { token, svg, dataUrl, sequence: answer };
}

/**
 * 生成语音验证码对应的文本（音频由前端通过 Web Speech API 朗读）
 * 返回 { token, digits, hint }
 */
export function generateAudioCaptcha({ length = 4 } = {}) {
  cleanupExpired();
  enforceStoreLimit();

  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const answer = String(crypto.randomInt(min, max + 1));

  const token = generateToken();
  imageCaptchaStore.set(token, {
    answer,
    expires: Date.now() + CAPTCHA_TTL_MS,
    type: 'audio',
    attempts: 0,
  });

  return {
    token,
    digits: answer.split(''),
    hint: '请听语音后输入听到的数字',
  };
}

function getIpKey(req) {
  return getClientIP(req) || 'unknown';
}

function isIpVerifyLocked(req) {
  const ip = getIpKey(req);
  const record = VERIFY_ATTEMPTS.get(ip);
  if (!record) return false;
  if (record.lockedUntil && record.lockedUntil > Date.now()) return true;
  if (record.lockedUntil && record.lockedUntil <= Date.now()) {
    VERIFY_ATTEMPTS.delete(ip);
    return false;
  }
  return false;
}

function recordVerifyFailure(req) {
  const ip = getIpKey(req);
  const now = Date.now();
  const record = VERIFY_ATTEMPTS.get(ip) || { count: 0, lastAttempt: 0 };
  record.count += 1;
  record.lastAttempt = now;
  if (record.count >= MAX_VERIFY_ATTEMPTS_PER_IP) {
    record.lockedUntil = now + VERIFY_LOCKOUT_MS;
    console.warn(`[CAPTCHA] IP ${ip} 验证码校验失败 ${record.count} 次，锁定 ${VERIFY_LOCKOUT_MS / 60000} 分钟`);
  }
  VERIFY_ATTEMPTS.set(ip, record);
}

/**
 * 验证图形验证码（一次性消费），带 IP 限流与单 token 尝试次数限制
 */
export function verifyImageCaptcha(token, answer, req) {
  if (req && isIpVerifyLocked(req)) {
    return { valid: false, reason: 'ip_locked' };
  }

  if (!token || typeof token !== 'string' || answer === undefined || answer === null) {
    if (req) recordVerifyFailure(req);
    return { valid: false, reason: 'missing_params' };
  }

  const record = imageCaptchaStore.get(token);
  if (!record) {
    if (req) recordVerifyFailure(req);
    return { valid: false, reason: 'not_found' };
  }

  // 单 token 尝试次数限制
  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > MAX_ATTEMPTS_PER_TOKEN) {
    imageCaptchaStore.delete(token);
    if (req) recordVerifyFailure(req);
    return { valid: false, reason: 'too_many_attempts' };
  }

  if (Date.now() > record.expires) {
    imageCaptchaStore.delete(token);
    if (req) recordVerifyFailure(req);
    return { valid: false, reason: 'expired' };
  }

  const userAnswer = String(answer).trim().toLowerCase();
  const storedAnswer = String(record.answer).trim().toLowerCase();

  let matched = false;
  if (record.type === 'rotate') {
    const userAngle = parseInt(userAnswer, 10);
    const targetAngle = parseInt(storedAnswer, 10);
    if (!Number.isNaN(userAngle) && !Number.isNaN(targetAngle)) {
      const tolerance = record.metadata?.tolerance || 15;
      const diff = Math.abs(((userAngle - targetAngle + 180 + 360) % 360) - 180);
      matched = diff <= tolerance;
    }
  } else if (record.type === 'sequence') {
    // 按 1-2-3-4 顺序点选；仅去除分隔符后比较
    const normalizeSeq = (s) => s.replace(/[^0-9]/g, '');
    matched = normalizeSeq(userAnswer) === normalizeSeq(storedAnswer);
  } else {
    // numeric / math / audio
    matched = userAnswer === storedAnswer;
  }

  if (matched) {
    imageCaptchaStore.delete(token);
    return { valid: true };
  }

  if (req) recordVerifyFailure(req);
  return { valid: false, reason: 'mismatch' };
}

/**
 * 获取当前存储统计（用于监控）
 */
export function getImageCaptchaStats() {
  cleanupExpired();
  return { active: imageCaptchaStore.size, max: MAX_STORE_SIZE };
}

export { generateAntiOcrNoise };
