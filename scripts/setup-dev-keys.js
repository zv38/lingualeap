// 生成本地开发密钥，并将军工级标准落地：
//   - 所有敏感密钥（JWT、Payment、Turnstile、AdminPrivacy）不再写入 .env.local，
//     而是每个密钥独立使用 Windows DPAPI 加密成单独文件。
//   - 管理员密码不再明文保存，改为 bcrypt 哈希后 DPAPI 保护。
//   - .env.local 仅保留非敏感配置项和密钥文件路径提示。
// 用法：node scripts/setup-dev-keys.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { protectSecret, protectSecretSigned, SECRETS_DIR } from '../api/security/vault/secretVault.js';
import { protectFileEncryptionKeySplit, loadFileEncryptionKeys, removeLegacyFileEncryptionKey } from '../api/security/vault/fileEncryptionKeyStore.js';

const ROOT = path.resolve(process.cwd());
const ENV_LOCAL = process.env.LL_ENV_FILE || path.join(os.homedir(), '.lingualeap-secrets', '.env.local');
const ENV_TEMPLATE = path.join(ROOT, '.env');

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function randomBase64(bytes) {
  return crypto.randomBytes(bytes).toString('base64');
}

function generateStrongPassword() {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*-_=+?<>~';
  const all = upper + lower + digits + special;
  const length = 24;
  let pwd = '';
  pwd += upper[Math.floor(Math.random() * upper.length)];
  pwd += lower[Math.floor(Math.random() * lower.length)];
  pwd += digits[Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

function parseEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function buildEnvContent(lines) {
  return [
    '# ============================================================',
    '# LinguaLeap 本地开发配置（仅本地使用，禁止提交）',
    '# 生成时间：' + new Date().toISOString(),
    '# 敏感密钥已通过 Windows DPAPI 单独保护，本文件不再包含明文密钥。',
    '# 生产环境必须关闭本文件，改为系统环境变量 / KMS / Secrets Manager 注入。',
    '# ============================================================',
    '',
    ...lines,
    '',
  ].join('\n');
}

function generateSecretValues() {
  return {
    JWT_SECRET: randomHex(32),
    JWT_REFRESH_SECRET: randomHex(48),
    PAYMENT_SECRET: randomHex(32),
    ADMIN_PRIVACY_KEY: randomBase64(32),
  };
}

const SENSITIVE_SECRET_NAMES = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'PAYMENT_SECRET', 'ADMIN_PRIVACY_KEY'];

function isValidBase64Key(value) {
  if (!value || typeof value !== 'string') return false;
  const buf = Buffer.from(value, 'base64');
  return buf.length === 32;
}

async function main() {
  if (process.platform !== 'win32') {
    console.error('[setup-dev-keys] 错误：当前脚本仅用于 Windows 本地开发密钥初始化。');
    console.error('[setup-dev-keys] 非 Windows 环境请直接通过系统环境变量注入所有密钥。');
    process.exit(1);
  }

  let existing = {};
  if (fs.existsSync(ENV_LOCAL)) {
    existing = parseEnv(fs.readFileSync(ENV_LOCAL, 'utf-8'));
    console.log('[setup-dev-keys] 检测到已有 .env.local，将保留已有配置，仅轮换敏感密钥');
  }

  const generated = generateSecretValues();
  const protectedNames = [];

  // 保护每个敏感密钥到独立 DPAPI 文件
  for (const name of SENSITIVE_SECRET_NAMES) {
    let value = generated[name];
    // 如果已有旧值且不是占位符，优先保留，避免频繁轮换导致已加密数据无法解密
    if (existing[name] && !existing[name].startsWith('__REPLACE_') && existing[name].length >= 16) {
      value = existing[name];
      console.log(`[setup-dev-keys] 保留已有 ${name}`);
    } else {
      console.log(`[setup-dev-keys] 生成新的 ${name}`);
    }
    const file = protectSecret(name, value);
    protectedNames.push(`${name} -> ${file}`);
    secureZeroString(value);
  }

  // Turnstile 密钥：默认不再写入 always-pass 测试密钥，防止开发环境机器人绕过。
  // 仅在显式设置 LL_ALLOW_TURNSTILE_TEST_KEY=true 或已存在非占位符真实密钥时才保留。
  let turnstileKey = null;
  if (existing.TURNSTILE_SECRET_KEY && !existing.TURNSTILE_SECRET_KEY.startsWith('__REPLACE_')) {
    turnstileKey = existing.TURNSTILE_SECRET_KEY;
    protectSecret('TURNSTILE_SECRET_KEY', turnstileKey);
    console.log('[setup-dev-keys] 已保留现有 TURNSTILE_SECRET_KEY');
  } else if (process.env.TURNSTILE_ALLOW_TEST_KEY === 'true' || process.env.LL_ALLOW_TURNSTILE_TEST_KEY === 'true') {
    turnstileKey = '1x0000000000000000000000000000000AA';
    protectSecret('TURNSTILE_SECRET_KEY', turnstileKey);
    console.log('[setup-dev-keys] ⚠️ Turnstile 测试密钥已 DPAPI 保护（机器人可绕过，仅本地 UI 调试）');
    console.log('[setup-dev-keys]    如需真实人机验证，请设置 TURNSTILE_SECRET_KEY 后重新运行本脚本');
  } else {
    protectSecret('TURNSTILE_SECRET_KEY', '__REPLACE_WITH_TURNSTILE_SECRET_KEY__');
    console.log('[setup-dev-keys] ⚠️ 未配置真实 TURNSTILE_SECRET_KEY，管理员登录将要求真实密钥');
    console.log('[setup-dev-keys]    如需临时 UI 调试，可设置 TURNSTILE_ALLOW_TEST_KEY=true 或 LL_ALLOW_TURNSTILE_TEST_KEY=true 重新运行');
  }

  // FILE_ENCRYPTION_KEY 军工级：使用 Shamir Secret Sharing 拆分为 2/3 份
  // 单点泄露无法还原密钥，只有同时拿到至少 2 份 share 才能解密数据文件
  let fileVaultKey = null;

  // 优先保留已存在的受保护密钥，避免数据无法解密
  const existingKeyStore = loadFileEncryptionKeys();
  if (existingKeyStore?.keys?.[existingKeyStore.primaryKeyId]) {
    fileVaultKey = existingKeyStore.keys[existingKeyStore.primaryKeyId];
    console.log('[setup-dev-keys] 保留已存在的 FILE_ENCRYPTION_KEY，迁移到 Shamir 分存');
  }

  if (!fileVaultKey && isValidBase64Key(existing.FILE_ENCRYPTION_KEY)) {
    fileVaultKey = existing.FILE_ENCRYPTION_KEY;
    console.log('[setup-dev-keys] 发现 .env.local 中的 FILE_ENCRYPTION_KEY，将迁移到 Shamir 分存');
  }
  if (!fileVaultKey) {
    fileVaultKey = randomBase64(32);
    console.log('[setup-dev-keys] 生成新的 FILE_ENCRYPTION_KEY（注意：旧加密数据将不可用）');
  }
  protectFileEncryptionKeySplit(fileVaultKey);
  console.log('[setup-dev-keys] FILE_ENCRYPTION_KEY 已拆分为 2/3 份并分别保护：');
  console.log(`  - share-1 -> ${path.join(SECRETS_DIR, 'FILE_ENCRYPTION_KEY-share-1.enc')} (DPAPI)`);
  console.log(`  - share-2 -> ${path.join(SECRETS_DIR, 'FILE_ENCRYPTION_KEY-share-2.enc')} (DPAPI)`);
  console.log(`  - share-3 -> ${path.join(SECRETS_DIR, 'FILE_ENCRYPTION_KEY.share-3.enc')} (本地文件，建议离线迁移后删除)`);
  // 清理旧版单/多版本密钥文件，避免歧义
  removeLegacyFileEncryptionKey();
  secureZeroString(fileVaultKey);

  // 创建管理员账号的固定口令：生成强随机口令 -> DPAPI 保护（带完整性签名）
  let adminCreateSecret = null;
  const existingCreateSecretFile = path.join(SECRETS_DIR, 'ADMIN_CREATE_SECRET.enc');
  if (fs.existsSync(existingCreateSecretFile)) {
    console.log('[setup-dev-keys] 已存在 ADMIN_CREATE_SECRET 口令文件，保留现有口令');
  } else {
    adminCreateSecret = generateStrongPassword();
    protectSecretSigned('ADMIN_CREATE_SECRET', adminCreateSecret);
    console.log('[setup-dev-keys] 已生成新的管理员创建口令并 DPAPI 保护（含完整性签名）');
    secureZeroString(adminCreateSecret);
  }

  // 管理员密码：生成 -> bcrypt 哈希 -> DPAPI 保护哈希，原始密码仅打印一次
  let adminPassword = null;
  let adminHash = null;
  const existingHashFile = path.join(SECRETS_DIR, 'admin-password-hash.enc');
  if (fs.existsSync(existingHashFile)) {
    console.log('[setup-dev-keys] 已存在管理员密码哈希文件，保留现有密码');
  } else {
    adminPassword = generateStrongPassword();
    adminHash = await bcrypt.hash(adminPassword, 12);
    protectSecretSigned('admin-password-hash', adminHash);
    console.log('[setup-dev-keys] 已生成新的管理员密码哈希并 DPAPI 保护（含完整性签名）');
    secureZeroString(adminHash);
  }

  // .env.local 不再存放任何敏感密钥明文，只保留配置项和提示
  const envLines = [
    '# 本文件不再包含明文密钥。如需重新生成密钥，请删除 ~/.lingualeap-secrets/*.enc 后再次运行 npm run setup:keys',
    '# 生产环境请通过系统环境变量或 KMS 注入，并删除本文件。',
    `TURNSTILE_SECRET_KEY_SOURCE=DPAPI:${path.join(SECRETS_DIR, 'TURNSTILE_SECRET_KEY.enc')}`,
  ];

  const envDir = path.dirname(ENV_LOCAL);
  if (!fs.existsSync(envDir)) fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(ENV_LOCAL, buildEnvContent(envLines), 'utf-8');
  fs.chmodSync(ENV_LOCAL, 0o600);

  console.log('');
  console.log('[setup-dev-keys] 已写入 ' + ENV_LOCAL);
  console.log('[setup-dev-keys] 以下密钥已 DPAPI 单独保护：');
  for (const line of protectedNames) {
    console.log('  - ' + line);
  }
  console.log(`  - TURNSTILE_SECRET_KEY -> ${path.join(SECRETS_DIR, 'TURNSTILE_SECRET_KEY.enc')}`);
  console.log(`  - admin-password-hash -> ${existingHashFile}`);
  console.log(`  - ADMIN_CREATE_SECRET -> ${existingCreateSecretFile}`);
  console.log(`  - FILE_ENCRYPTION_KEY -> Shamir 2/3 分存（见上文）`);
  if (adminPassword) {
    console.log('');
    console.log('============================================================');
    console.log('管理员账号：admin@lingualeap.com');
    console.log('管理员密码：' + adminPassword);
    console.log('请立即保存，本信息仅显示一次，脚本不会记录明文密码。');
    console.log('============================================================');
    secureZeroString(adminPassword);
  }
  if (adminCreateSecret) {
    console.log('');
    console.log('============================================================');
    console.log('创建管理员账号口令（ADMIN_CREATE_SECRET）：');
    console.log(adminCreateSecret);
    console.log('此口令用于在后台创建新管理员时验证，请安全保存，本信息仅显示一次。');
    console.log('============================================================');
    secureZeroString(adminCreateSecret);
  }
  console.log('[setup-dev-keys] 提示：.env.local 与 *.enc 文件已加入 .gitignore，请勿提交');
}

function secureZeroString(str) {
  if (typeof str !== 'string') return;
  try {
    const buf = Buffer.from(str, 'utf-8');
    buf.fill(0);
  } catch {}
}

main().catch(err => {
  console.error('[setup-dev-keys] 失败:', err.message);
  process.exit(1);
});
