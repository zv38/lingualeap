import crypto from 'crypto';
import { loadSecret } from '../vault/secretVault.js';
import { decrypt as decryptLegacy } from './fileVault.js';

// ============================================================
// Admin Privacy Vault — 管理员隐私字段字段级加密与脱敏
// 目标：IP、User-Agent、设备名、城市等敏感信息在静态存储和
//       内存持久化文件中均以密文形式存在，前端只能看到脱敏结果。
// 密钥策略：
//   - 独立 ADMIN_PRIVACY_KEY（32 字节 base64），与 FILE_ENCRYPTION_KEY 隔离
//   - 通过 HKDF-SHA256 派生三个用途隔离子密钥：
//     * ip-hash   : 用于 IP HMAC（可检索哈希）
//     * field-enc : 用于文本字段 AES-256-GCM 加密
//     * fingerprint : 用于设备指纹 HMAC
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const VAULT_PREFIX = 'apv:v1:';

let privacyMasterKey = null;
let ipHashKey = null;
let fieldEncKey = null;
let fingerprintKey = null;
let devFallbackLogged = false;

function logDevFallback() {
  if (devFallbackLogged) return;
  devFallbackLogged = true;
  console.warn(
    '[AdminPrivacyVault] ADMIN_PRIVACY_KEY 未配置或无效，使用开发环境兜底密钥。' +
    '生产环境必须配置独立的 32 字节 base64 ADMIN_PRIVACY_KEY。'
  );
}

function secureClear(buf) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
}

function loadPrivacyMasterKey() {
  if (privacyMasterKey) return privacyMasterKey;

  // 军工级：优先通过 Secret Vault 加载（环境变量或 DPAPI 保护文件）
  const envKey = process.env.ADMIN_PRIVACY_KEY || loadSecret('ADMIN_PRIVACY_KEY', { required: false });
  if (envKey) {
    const buf = Buffer.from(envKey, 'base64');
    if (buf.length === KEY_LENGTH) {
      privacyMasterKey = buf;
      return privacyMasterKey;
    }
    console.error('[AdminPrivacyVault] ADMIN_PRIVACY_KEY base64 解码后长度必须为 32 字节，已忽略');
  }

  // 生产环境禁止兜底，开发环境仅警告一次
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 ADMIN_PRIVACY_KEY，禁止使用开发兜底密钥');
  }
  logDevFallback();
  privacyMasterKey = crypto.createHash('sha256').update('admin-privacy-vault-dev-key-DO-NOT-USE').digest();
  return privacyMasterKey;
}

function deriveSubkey(purpose) {
  const master = loadPrivacyMasterKey();
  // 固定 salt + 用途 info，确保同一用途总是派生相同子密钥
  const salt = crypto.createHash('sha256').update(`admin-privacy-vault|${purpose}`).digest();
  const info = Buffer.from(`admin-privacy-vault|v1|${purpose}`, 'utf-8');
  return crypto.hkdfSync('sha256', master, salt, info, KEY_LENGTH);
}

function getIpHashKey() {
  if (ipHashKey) return ipHashKey;
  ipHashKey = deriveSubkey('ip-hash');
  return ipHashKey;
}

function getFieldEncKey() {
  if (fieldEncKey) return fieldEncKey;
  fieldEncKey = deriveSubkey('field-enc');
  return fieldEncKey;
}

function getFingerprintKey() {
  if (fingerprintKey) return fingerprintKey;
  fingerprintKey = deriveSubkey('fingerprint');
  return fingerprintKey;
}

function buildAAD(context) {
  return Buffer.from(`admin-privacy-vault|v1|${ALGORITHM}|${context || 'default'}`, 'utf-8');
}

export function hasPrivacyKey() {
  return !!process.env.ADMIN_PRIVACY_KEY;
}

export function clearPrivacyKeyCache() {
  secureClear(privacyMasterKey);
  secureClear(ipHashKey);
  secureClear(fieldEncKey);
  secureClear(fingerprintKey);
  privacyMasterKey = null;
  ipHashKey = null;
  fieldEncKey = null;
  fingerprintKey = null;
}

// 对文本字段进行字段级 AES-256-GCM 加密
function encryptField(plaintext, context = 'text') {
  if (plaintext === null || plaintext === undefined) return '';
  if (typeof plaintext !== 'string') plaintext = String(plaintext);
  if (plaintext.length === 0) return '';

  const key = getFieldEncKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const aad = buildAAD(context);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = {
    v: 1,
    alg: ALGORITHM,
    ctx: context,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    aad: aad.toString('base64'),
    ct: ciphertext.toString('base64'),
  };
  return `${VAULT_PREFIX}${Buffer.from(JSON.stringify(envelope), 'utf-8').toString('base64')}`;
}

function decryptField(encrypted) {
  if (!encrypted) return '';
  if (typeof encrypted !== 'string') return '';

  // 兼容旧版 fileVault 加密数据（enc:v1:/enc:v2:），迁移期内可解密
  if (encrypted.startsWith('enc:v1:') || encrypted.startsWith('enc:v2:')) {
    try {
      return decryptLegacy(encrypted);
    } catch {
      return '';
    }
  }

  if (!encrypted.startsWith(VAULT_PREFIX)) return encrypted;

  let envelope;
  try {
    envelope = JSON.parse(Buffer.from(encrypted.slice(VAULT_PREFIX.length), 'base64').toString('utf-8'));
  } catch {
    return '';
  }

  if (envelope.v !== 1 || envelope.alg !== ALGORITHM) {
    return '';
  }

  const key = getFieldEncKey();
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.tag, 'base64');
  const aad = Buffer.from(envelope.aad, 'base64');
  const ciphertext = Buffer.from(envelope.ct, 'base64');

  let plaintext = null;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf-8');
  } catch {
    return '';
  } finally {
    secureClear(plaintext);
  }
}

/**
 * 对 IP 进行可检索保护：返回 HMAC 哈希（用于风险计算/白名单匹配）
 * 和字段级密文（用于必要时还原）。
 */
export function protectIp(ip) {
  if (!ip || typeof ip !== 'string') return { hash: '', encrypted: '' };
  const key = getIpHashKey();
  const hash = crypto.createHmac('sha256', key).update(ip).digest('hex');
  const encrypted = encryptField(ip, 'ip');
  return { hash, encrypted };
}

/**
 * 根据密文还原 IP。需要高权限 + Fresh MFA 通过后才能调用。
 */
export function revealIp(encrypted) {
  return decryptField(encrypted);
}

/**
 * IP 脱敏展示：IPv4 只保留前两段，IPv6 只保留前缀，本地地址特殊处理。
 */
export function maskIp(ip) {
  if (!ip) return '-';
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return 'localhost';
  const v4 = ip.split('.');
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.x.x`;
  const v6 = ip.split(':');
  if (v6.length > 2) return `${v6[0]}:${v6[1]}:...`;
  return `${ip.slice(0, 8)}...`;
}

/**
 * 通用文本字段加密（User-Agent、设备名、城市等）。
 */
export function protectText(plaintext, context = 'text') {
  return encryptField(plaintext, context);
}

/**
 * 通用文本字段解密。
 */
export function revealText(encrypted) {
  return decryptField(encrypted);
}

/**
 * 设备指纹哈希：用于设备匹配，不可逆。
 */
export function hashFingerprint(fingerprint) {
  if (!fingerprint) return '';
  const key = getFingerprintKey();
  return crypto.createHmac('sha256', key).update(JSON.stringify(fingerprint)).digest('hex');
}

/**
 * 登录历史记录加密打包。
 */
export function protectLoginRecord(record) {
  const { ip, userAgent, deviceName, ...rest } = record;
  const ipProtected = protectIp(ip);
  return {
    ...rest,
    ipHash: ipProtected.hash,
    ipEncrypted: ipProtected.encrypted,
    userAgentEncrypted: protectText(userAgent, 'user-agent'),
    deviceNameEncrypted: protectText(deviceName, 'device-name'),
  };
}

/**
 * 可信设备记录加密打包。
 */
export function protectDeviceRecord(device) {
  const { ip, userAgent, name, fpHash, ...rest } = device;
  const ipProtected = protectIp(ip);
  return {
    ...rest,
    fpHash,
    ipHash: ipProtected.hash,
    ipEncrypted: ipProtected.encrypted,
    userAgentEncrypted: protectText(userAgent, 'user-agent'),
    nameEncrypted: protectText(name, 'device-name'),
  };
}

/**
 * 脱敏登录历史记录（返回给前端）。
 */
export function maskLoginRecord(record) {
  return {
    id: record.id,
    timestamp: record.timestamp,
    ip: maskIp(revealIp(record.ipEncrypted)),
    deviceName: revealText(record.deviceNameEncrypted) || '未知设备',
    fpHash: record.fpHash,
    riskScore: record.riskScore,
    riskLevel: record.riskLevel,
    success: record.success,
    reason: record.reason,
  };
}

/**
 * 脱敏设备记录（返回给前端）。
 */
export function maskDeviceRecord(device) {
  return {
    fpHash: device.fpHash,
    name: revealText(device.nameEncrypted) || '未知设备',
    ip: maskIp(revealIp(device.ipEncrypted)),
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
  };
}
