/**
 * 生产环境启动安全校验
 * 在服务器启动时强制检查：密钥不是占位符/默认值、人机验证已配置、文件加密已配置、HTTPS 已启用等。
 * 任何致命问题都会直接 process.exit(1)，防止带着脆弱配置上线。
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createKeyStorageProvider, validateFilePermissions, SECRETS_DIR } from '../vault/keyStorageProvider.js';
import { normalizeKeyStore } from '../vault/fileEncryptionKeyStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const isProduction = process.env.NODE_ENV === 'production';

const PLACEHOLDER_PATTERNS = [
  /^\s*$/,
  /^你的/,
  /^替换为/,
  /^请替换/,
  /change[-_]?me/i,
  /placeholder/i,
  /example/i,
  /testtest/i,
  /12345678/,
  /^password$/i,
  /^admin$/i,
];

const LEAKED_OR_WEAK_KEYS = [
  '117b5c751eec5bda370cbf4071d9961f5ef74214c5d95dd051ff09657e7d7f65',
  'e8a4f2c9d1b6e3f7a0c5d2e8b4f1a6c9d3e7b5f2a0c4d1e8f6b3a7c9d0e2f',
];

// Cloudflare Turnstile 官方测试密钥：always-pass，机器人可绕过
const KNOWN_TURNSTILE_TEST_VALUES = [
  '1x0000000000000000000000000000000AA',
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
];

function looksLikePlaceholder(value) {
  if (!value || typeof value !== 'string') return true;
  return PLACEHOLDER_PATTERNS.some(p => p.test(value));
}

function fatal(message) {
  console.error(`[FATAL-SECURITY] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[SECURITY-WARN] ${message}`);
}

export function validateProductionConfig() {
  if (!isProduction) {
    warn('当前非 production 模式，跳过最严格的启动校验。生产环境请务必设置 NODE_ENV=production。');
    return;
  }

  // 1. JWT 密钥
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!jwtSecret) fatal('JWT_SECRET 未设置。生产环境必须通过系统环境变量注入强随机密钥。');
  if (!jwtRefreshSecret) fatal('JWT_REFRESH_SECRET 未设置。');
  if (looksLikePlaceholder(jwtSecret)) fatal('JWT_SECRET 看起来仍是占位符，请替换为真实随机密钥。');
  if (looksLikePlaceholder(jwtRefreshSecret)) fatal('JWT_REFRESH_SECRET 看起来仍是占位符。');
  if (jwtSecret.length < 64) fatal('JWT_SECRET 强度不足：需要至少 256 位（hex 长度 ≥ 64）。');
  if (jwtRefreshSecret.length < 96) fatal('JWT_REFRESH_SECRET 强度不足：需要至少 384 位（hex 长度 ≥ 96）。');
  if (jwtSecret === jwtRefreshSecret) fatal('JWT_SECRET 与 JWT_REFRESH_SECRET 不能相同。');
  if (LEAKED_OR_WEAK_KEYS.includes(jwtSecret) || LEAKED_OR_WEAK_KEYS.includes(jwtRefreshSecret)) {
    fatal('检测到已泄露或已知弱 JWT 密钥，请立即更换。');
  }

  // 2. 密钥存储 Provider（军工级：生产环境必须显式指定，禁止默认使用 DPAPI）
  const keyProvider = process.env.LL_KEY_PROVIDER || 'auto';
  if (keyProvider === 'dpapi' || (keyProvider === 'auto' && process.platform === 'win32')) {
    fatal('生产环境必须显式配置 LL_KEY_PROVIDER=env 或 LL_KEY_PROVIDER=kms，禁止默认使用 Windows DPAPI 存储密钥。');
  }
  if (!['env', 'kms', 'hsm', 'dpapi', 'auto'].includes(keyProvider)) {
    fatal(`LL_KEY_PROVIDER=${keyProvider} 不是受支持的军工级密钥存储后端。`);
  }

  // 2.1 校验密钥存储抽象层实际可用性
  try {
    const provider = createKeyStorageProvider(keyProvider);
    const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'PAYMENT_SECRET', 'TURNSTILE_SECRET_KEY', 'ADMIN_PRIVACY_KEY'];
    for (const name of requiredSecrets) {
      // 生产环境要求每个敏感密钥必须能从当前 Provider 加载（优先环境变量，其次 Provider 持久化）
      const value = provider.load(name);
      if (!value) {
        fatal(`军工级密钥存储校验失败：无法通过 Provider "${provider.name}" 加载 ${name}。`);
      }
      if (looksLikePlaceholder(value)) {
        fatal(`军工级密钥存储校验失败：${name} 看起来仍是占位符。`);
      }
    }

    // 如果使用 DPAPI/Auto（开发环境），校验密钥文件权限
    if ((keyProvider === 'dpapi' || keyProvider === 'auto') && process.platform === 'win32') {
      if (fs.existsSync(SECRETS_DIR)) {
        const entries = fs.readdirSync(SECRETS_DIR);
        for (const entry of entries) {
          if (entry.endsWith('.enc')) {
            const filePath = path.join(SECRETS_DIR, entry);
            validateFilePermissions(filePath, true);
          }
        }
      }
    }
  } catch (err) {
    if (err.message?.startsWith('[FATAL-SECURITY]')) throw err;
    fatal(`军工级密钥存储校验异常: ${err.message}`);
  }

  // 2.2 校验项目根目录 .env 模板未被误填为真实密钥或测试密钥
  const projectEnvPath = path.join(rootDir, '.env');
  if (fs.existsSync(projectEnvPath)) {
    const envContent = fs.readFileSync(projectEnvPath, 'utf-8');
    const sensitiveKeys = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'PAYMENT_SECRET', 'TURNSTILE_SECRET_KEY', 'ADMIN_PRIVACY_KEY', 'ADMIN_PASSWORD_HASH', 'FILE_ENCRYPTION_KEY'];
    for (const keyName of sensitiveKeys) {
      const regex = new RegExp(`^${keyName}\s*=\s*(.+)$`, 'm');
      const match = envContent.match(regex);
      if (match) {
        const value = match[1].trim();
        if (KNOWN_TURNSTILE_TEST_VALUES.includes(value)) {
          fatal(`项目根目录 .env 文件包含 Turnstile 测试密钥 ${keyName}，机器人可绕过验证。请替换为真实密钥或占位符。`);
        }
        if (!looksLikePlaceholder(value) && value.length > 8) {
          fatal(`项目根目录 .env 文件包含疑似明文敏感密钥 ${keyName}，军工级要求：所有敏感密钥必须独立保护，禁止写入仓库内 .env 文件。`);
        }
      }
    }
  }

  // 3. 文件加密密钥（支持单密钥 FILE_ENCRYPTION_KEY 或多版本 FILE_ENCRYPTION_KEYS）
  const singleFileKey = process.env.FILE_ENCRYPTION_KEY;
  const multiFileKeys = process.env.FILE_ENCRYPTION_KEYS;

  if (!singleFileKey && !multiFileKeys) {
    fatal('FILE_ENCRYPTION_KEY 或 FILE_ENCRYPTION_KEYS 未设置，生产环境禁止明文落盘。');
  }

  const fileKeysToCheck = [];

  if (multiFileKeys) {
    let normalized;
    try {
      normalized = normalizeKeyStore(JSON.parse(multiFileKeys));
    } catch (err) {
      fatal(`FILE_ENCRYPTION_KEYS 格式无效：${err.message}`);
    }
    for (const [keyId, value] of Object.entries(normalized.keys)) {
      if (looksLikePlaceholder(value)) fatal(`FILE_ENCRYPTION_KEYS.keys.${keyId} 看起来仍是占位符。`);
      fileKeysToCheck.push({ keyId, value });
    }
  } else {
    if (looksLikePlaceholder(singleFileKey)) fatal('FILE_ENCRYPTION_KEY 看起来仍是占位符。');
    fileKeysToCheck.push({ keyId: 'primary', value: singleFileKey });
  }

  const usedKeyValues = new Set();
  for (const { keyId, value } of fileKeysToCheck) {
    try {
      const buf = Buffer.from(value, 'base64');
      if (buf.length !== 32) {
        fatal(`FILE_ENCRYPTION_KEY(S).${keyId} 长度错误：base64 解码后应为 32 字节，实际 ${buf.length} 字节。`);
      }
      // 检查密钥是否重复（不同版本不应复用同一密钥）
      if (usedKeyValues.has(value)) {
        fatal(`FILE_ENCRYPTION_KEYS 中密钥 "${keyId}" 与其他版本重复，密钥轮换失去意义。`);
      }
      usedKeyValues.add(value);
      // 检查是否使用了已泄露或已知弱密钥
      if (LEAKED_OR_WEAK_KEYS.includes(value)) {
        fatal(`FILE_ENCRYPTION_KEY(S).${keyId} 是已泄露或已知弱密钥，请立即更换。`);
      }
      // 简单熵检查：base64 解码后不应全是相同字节或过于规律
      const uniqueBytes = new Set(buf);
      if (uniqueBytes.size < 8) {
        fatal(`FILE_ENCRYPTION_KEY(S).${keyId} 熵值过低，疑似非随机生成。`);
      }
    } catch (err) {
      if (err.message?.startsWith('[FATAL-SECURITY]')) throw err;
      fatal(`FILE_ENCRYPTION_KEY(S).${keyId} 不是有效的 base64 字符串。`);
    }
  }

  // 3. 支付密钥
  const paymentSecret = process.env.PAYMENT_SECRET;
  if (!paymentSecret) fatal('PAYMENT_SECRET 未设置。');
  if (looksLikePlaceholder(paymentSecret)) fatal('PAYMENT_SECRET 看起来仍是占位符。');
  if (paymentSecret.length < 64) fatal('PAYMENT_SECRET 强度不足：需要至少 256 位（hex 长度 ≥ 64）。');

  // 4. 人机验证（管理员登录强制）
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) fatal('TURNSTILE_SECRET_KEY 未设置，生产环境管理员登录必须开启 Cloudflare Turnstile 人机验证。');
  if (looksLikePlaceholder(turnstileSecret)) fatal('TURNSTILE_SECRET_KEY 看起来仍是占位符。');
  if (KNOWN_TURNSTILE_TEST_VALUES.includes(turnstileSecret)) {
    fatal('生产环境禁止使用 Cloudflare Turnstile 测试密钥，机器人可直接绕过验证。');
  }
  if (process.env.TURNSTILE_ALLOW_TEST_KEY === 'true' || process.env.LL_ALLOW_TURNSTILE_TEST_KEY === 'true') {
    fatal('生产环境禁止设置 TURNSTILE_ALLOW_TEST_KEY=true 或 LL_ALLOW_TURNSTILE_TEST_KEY=true。');
  }

  // 5. 管理员密码必须以 bcrypt 哈希形式存在，禁止明文
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!adminPasswordHash) fatal('ADMIN_PASSWORD_HASH 未设置。生产环境必须注入 bcrypt 哈希，禁止明文 ADMIN_PASSWORD。');
  if (looksLikePlaceholder(adminPasswordHash)) fatal('ADMIN_PASSWORD_HASH 看起来仍是占位符。');
  if (adminPasswordHash.length < 60) fatal('ADMIN_PASSWORD_HASH 不是有效的 bcrypt 哈希（长度不足 60）。');
  if (process.env.ADMIN_PASSWORD) {
    fatal('检测到明文 ADMIN_PASSWORD 环境变量。生产环境必须使用 ADMIN_PASSWORD_HASH。');
  }

  // 6. 管理员隐私字段加密密钥
  const adminPrivacyKey = process.env.ADMIN_PRIVACY_KEY;
  if (!adminPrivacyKey) fatal('ADMIN_PRIVACY_KEY 未设置。生产环境必须使用独立的 32 字节 base64 密钥保护管理员隐私字段。');
  if (looksLikePlaceholder(adminPrivacyKey)) fatal('ADMIN_PRIVACY_KEY 看起来仍是占位符。');
  try {
    const buf = Buffer.from(adminPrivacyKey, 'base64');
    if (buf.length !== 32) fatal(`ADMIN_PRIVACY_KEY 长度错误：base64 解码后应为 32 字节，实际 ${buf.length} 字节。`);
    const uniqueBytes = new Set(buf);
    if (uniqueBytes.size < 8) fatal('ADMIN_PRIVACY_KEY 熵值过低，疑似非随机生成。');
  } catch {
    fatal('ADMIN_PRIVACY_KEY 不是有效的 base64 字符串。');
  }

  // 7. 禁止测试/调试后门
  if (process.env.CAPTCHA_TEST_MODE === 'true') {
    fatal('CAPTCHA_TEST_MODE 在生产环境中被设为 true，这会导致验证码明文泄露，必须移除或设为 false。');
  }

  // 8. Cookie / HTTPS
  if (process.env.ALLOWED_ORIGINS?.includes('http://')) {
    warn('ALLOWED_ORIGINS 中包含明文 http:// 地址，生产环境建议只允许 https://。');
  }

  console.log('[SECURITY] 生产环境启动安全校验通过');
}

export function validateDevelopmentConfig() {
  if (isProduction) return;

  // 开发环境也给出明确警告，但不断绝启动
  if (process.env.CAPTCHA_TEST_MODE === 'true') {
    warn('CAPTCHA_TEST_MODE=true：验证码接口会返回明文，仅供本地自动化测试，切勿用于任何共享/生产环境。');
  }
  if (!process.env.TURNSTILE_SECRET_KEY) {
    fatal('TURNSTILE_SECRET_KEY 未配置，任何环境管理员登录都必须开启人机验证。');
  }
  if (KNOWN_TURNSTILE_TEST_VALUES.includes(process.env.TURNSTILE_SECRET_KEY)) {
    if (process.env.TURNSTILE_ALLOW_TEST_KEY !== 'true' && process.env.LL_ALLOW_TURNSTILE_TEST_KEY !== 'true') {
      fatal('检测到 Turnstile 测试密钥。开发环境如需仅做 UI 调试，请设置 TURNSTILE_ALLOW_TEST_KEY=true 或 LL_ALLOW_TURNSTILE_TEST_KEY=true；否则必须配置真实密钥。');
    }
    warn('当前使用 Cloudflare Turnstile 测试密钥，机器人可绕过验证。仅允许本地 UI 调试使用。');
  }
  if (!process.env.JWT_SECRET) {
    fatal('JWT_SECRET 未设置，无法启动。');
  }
  if (!process.env.ADMIN_PASSWORD_HASH) {
    fatal('ADMIN_PASSWORD_HASH 未设置。开发环境请运行 npm run setup:keys 生成。');
  }
  if (process.env.ADMIN_PASSWORD) {
    fatal('检测到明文 ADMIN_PASSWORD 环境变量。任何环境都禁止使用明文管理员密码，请改用 ADMIN_PASSWORD_HASH。');
  }
}

export function runStartupSecurityChecks() {
  validateProductionConfig();
  validateDevelopmentConfig();
}
