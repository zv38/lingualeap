import fs from 'fs/promises';
import fsSync from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { loadFileEncryptionKeys, normalizeKeyStore } from '../vault/fileEncryptionKeyStore.js';

// ============================================================
// FileVault v2 — 服务端文件加密库
// 目标：Envelope 格式、密钥轮换、AAD 绑定、多版本兼容
// ============================================================

const VAULT_PREFIX_V1 = 'enc:v1:';
const VAULT_PREFIX_V2 = 'enc:v2:';
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32; // v2 使用 32 字节 salt 配合 HKDF
const KDF = 'hkdf-sha256';

let keysCache = null;
let keyWarningLogged = false;

function logKeyWarning() {
  if (keyWarningLogged) return;
  keyWarningLogged = true;
  console.warn(
    '[FileVault] FILE_ENCRYPTION_KEY(S) 未设置或无效，文件将以明文存储。' +
    '生产环境请生成 32 字节密钥并以 base64 写入环境变量。'
  );
}

export function generateEncryptionKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

// 解析环境变量中的多版本密钥
// 支持两种形式：
//   1. FILE_ENCRYPTION_KEY=base64key        => { primary: key }
//   2. FILE_ENCRYPTION_KEYS={"primary":"base64key","legacy":"base64key"}
export function loadEncryptionKeys() {
  if (keysCache) return keysCache;

  const singleKey = process.env.FILE_ENCRYPTION_KEY;
  const multiKeys = process.env.FILE_ENCRYPTION_KEYS;

  const result = {
    primaryKeyId: null,
    keys: new Map(),
  };

  if (multiKeys) {
    try {
      const parsed = JSON.parse(multiKeys);
      const normalized = normalizeKeyStore(parsed);
      result.primaryKeyId = normalized.primaryKeyId;
      for (const [keyId, value] of Object.entries(normalized.keys)) {
        const buf = Buffer.from(value, 'base64');
        if (buf.length !== KEY_LENGTH) {
          throw new Error(`密钥 "${keyId}" 长度错误：base64 解码后应为 ${KEY_LENGTH} 字节，实际 ${buf.length} 字节`);
        }
        result.keys.set(keyId, buf);
      }
    } catch (err) {
      console.error('[FileVault] 解析 FILE_ENCRYPTION_KEYS 失败:', err.message);
      logKeyWarning();
      return null;
    }
  } else if (singleKey) {
    try {
      const buf = Buffer.from(singleKey, 'base64');
      if (buf.length !== KEY_LENGTH) {
        throw new Error(`FILE_ENCRYPTION_KEY 长度错误：base64 解码后应为 ${KEY_LENGTH} 字节，实际 ${buf.length} 字节`);
      }
      result.primaryKeyId = 'primary';
      result.keys.set('primary', buf);
    } catch (err) {
      console.error('[FileVault] 解析 FILE_ENCRYPTION_KEY 失败:', err.message);
      logKeyWarning();
      return null;
    }
  } else {
    // 军工级：环境变量未注入时，通过 Secret Vault / DPAPI 抽象层加载多版本密钥
    try {
      const vaultKeys = loadFileEncryptionKeys();
      if (vaultKeys) {
        result.primaryKeyId = vaultKeys.primaryKeyId;
        for (const [keyId, value] of Object.entries(vaultKeys.keys)) {
          const buf = Buffer.from(value, 'base64');
          if (buf.length !== KEY_LENGTH) {
            throw new Error(`Vault 密钥 "${keyId}" 长度错误：base64 解码后应为 ${KEY_LENGTH} 字节，实际 ${buf.length} 字节`);
          }
          result.keys.set(keyId, buf);
        }
      } else {
        logKeyWarning();
        return null;
      }
    } catch (err) {
      console.error('[FileVault] 从 Secret Vault 加载文件加密密钥失败:', err.message);
      logKeyWarning();
      return null;
    }
  }

  keysCache = result;
  return result;
}

export function getEncryptionKey(keyId = null) {
  const keyStore = loadEncryptionKeys();
  if (!keyStore) return null;
  const resolvedKeyId = keyId || keyStore.primaryKeyId;
  return keyStore.keys.get(resolvedKeyId) || null;
}

export function getPrimaryKeyId() {
  const keyStore = loadEncryptionKeys();
  if (!keyStore) return null;
  return keyStore.primaryKeyId;
}

export function hasEncryptionKey() {
  return !!getEncryptionKey();
}

export function listKeyIds() {
  const keyStore = loadEncryptionKeys();
  if (!keyStore) return [];
  return Array.from(keyStore.keys.keys());
}

export function isEncrypted(data) {
  if (typeof data === 'string') {
    return data.startsWith(VAULT_PREFIX_V1) || data.startsWith(VAULT_PREFIX_V2);
  }
  if (Buffer.isBuffer(data)) {
    const head = data.toString('utf-8', 0, Math.max(VAULT_PREFIX_V1.length, VAULT_PREFIX_V2.length));
    return head.startsWith(VAULT_PREFIX_V1) || head.startsWith(VAULT_PREFIX_V2);
  }
  return false;
}

// 安全清零 Buffer，降低内存 dump 泄露风险
function secureClear(buf) {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}

// 使用 HKDF-SHA256 从主密钥派生数据加密密钥（DEK）
// 使用 Node.js 原生 crypto.hkdfSync，避免手写 KDF 的 subtle bug
function deriveDEK(masterKey, salt, keyId) {
  const info = Buffer.from(`filevault-v2|${keyId}|${ALGORITHM}`, 'utf-8');
  return crypto.hkdfSync('sha256', masterKey, salt, info, KEY_LENGTH);
}

function buildAAD(keyId, context) {
  const base = `filevault|v2|${ALGORITHM}|${keyId}`;
  if (context) return Buffer.from(`${base}|${context}`, 'utf-8');
  return Buffer.from(base, 'utf-8');
}

// v2 加密：返回 enc:v2:<base64(envelope_json)>
export function encrypt(plaintext, { keyId = null, context = '' } = {}) {
  const activeKeyId = keyId || getPrimaryKeyId();
  if (!activeKeyId) {
    throw new Error('[FileVault] 未配置 FILE_ENCRYPTION_KEY(S)，无法加密');
  }
  const masterKey = getEncryptionKey(activeKeyId);
  if (!masterKey) {
    throw new Error(`[FileVault] 找不到密钥 "${activeKeyId}"`);
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const dek = deriveDEK(masterKey, salt, activeKeyId);
  const aad = buildAAD(activeKeyId, context);

  const cipher = crypto.createCipheriv(ALGORITHM, dek, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 安全清零临时 DEK
  secureClear(dek);

  const envelope = {
    v: 2,
    alg: ALGORITHM,
    kdf: KDF,
    keyId: activeKeyId,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    aad: aad.toString('base64'),
    ct: ciphertext.toString('base64'),
  };

  const envelopeJson = JSON.stringify(envelope);
  return `${VAULT_PREFIX_V2}${Buffer.from(envelopeJson, 'utf-8').toString('base64')}`;
}

// v2 解密
function decryptV2(envelopeJson) {
  let envelope;
  try {
    envelope = JSON.parse(envelopeJson);
  } catch {
    throw new Error('[FileVault] v2 密文 envelope 不是有效的 JSON');
  }

  if (envelope.v !== 2 || envelope.alg !== ALGORITHM || envelope.kdf !== KDF) {
    throw new Error('[FileVault] 不支持的 v2 加密参数');
  }

  const masterKey = getEncryptionKey(envelope.keyId);
  if (!masterKey) {
    throw new Error(`[FileVault] 找不到解密所需密钥 "${envelope.keyId}"，无法解密`);
  }

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.tag, 'base64');
  const aad = Buffer.from(envelope.aad, 'base64');
  const ciphertext = Buffer.from(envelope.ct, 'base64');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('[FileVault] v2 密文参数长度异常');
  }

  const dek = deriveDEK(masterKey, salt, envelope.keyId);
  let plaintext = null;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf-8');
  } finally {
    // 安全清零临时 DEK 与明文 Buffer
    secureClear(dek);
    secureClear(plaintext);
  }
}

// v1 解密（兼容旧数据）
function decryptV1(encryptedText) {
  const masterKey = getEncryptionKey('primary') || getEncryptionKey();
  if (!masterKey) {
    throw new Error('[FileVault] 未配置 FILE_ENCRYPTION_KEY，无法解密 v1 数据');
  }

  const payload = Buffer.from(encryptedText.slice(VAULT_PREFIX_V1.length), 'base64');
  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('[FileVault] v1 密文长度不足');
  }

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf-8');
}

export function decrypt(encryptedText) {
  if (!isEncrypted(encryptedText)) {
    throw new Error('[FileVault] 输入不是有效的加密格式');
  }

  if (encryptedText.startsWith(VAULT_PREFIX_V2)) {
    const envelopeBase64 = encryptedText.slice(VAULT_PREFIX_V2.length);
    const envelopeJson = Buffer.from(envelopeBase64, 'base64').toString('utf-8');
    return decryptV2(envelopeJson);
  }

  if (encryptedText.startsWith(VAULT_PREFIX_V1)) {
    return decryptV1(encryptedText);
  }

  throw new Error('[FileVault] 无法识别的加密版本');
}

export async function readEncryptedFile(filePath, { context = '' } = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (isEncrypted(raw)) {
      return decrypt(raw);
    }
    // 兼容旧明文数据：发现明文时告警，但允许读取
    if (raw.trim().length > 0) {
      console.warn(`[FileVault] ${filePath} 为明文存储，建议运行迁移脚本转为加密`);
    }
    return raw;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function restrictFilePermissions(filePath) {
  try {
    fsSync.chmodSync(filePath, 0o600);
    if (process.platform === 'win32') {
      const user = process.env.USERNAME || process.env.USER;
      if (user) {
        execSync(`icacls "${filePath}" /inheritance:r /grant:r "${user}:(R,W)"`, { stdio: 'ignore' });
      }
    }
  } catch (err) {
    console.warn(`[FileVault] 无法限制 ${filePath} 文件权限:`, err.message);
  }
}

export async function writeEncryptedFile(filePath, plaintext, { context = '', keyId = null } = {}) {
  const keys = loadEncryptionKeys();
  if (!keys) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[FileVault] 生产环境禁止明文写入：${filePath}。必须配置 FILE_ENCRYPTION_KEY(S)。`);
    }
    // 开发环境没有密钥时保持明文，避免数据无法读写
    console.warn(`[FileVault] ${filePath} 将以明文写入（开发环境降级）`);
    await fs.writeFile(filePath, plaintext, 'utf-8');
    restrictFilePermissions(filePath);
    return;
  }

  const encrypted = encrypt(plaintext, { context, keyId });
  const tempFile = `${filePath}.tmp`;
  await fs.writeFile(tempFile, encrypted, 'utf-8');
  await fs.rename(tempFile, filePath);
  restrictFilePermissions(filePath);
}

// ============================================================
// 同步文件加密读写（供启动时/同步模块使用）
// ============================================================

export function readEncryptedFileSync(filePath, { context = '' } = {}) {
  try {
    const raw = fsSync.readFileSync(filePath, 'utf-8');
    if (isEncrypted(raw)) {
      return decrypt(raw);
    }
    if (raw.trim().length > 0) {
      console.warn(`[FileVault] ${filePath} 为明文存储，建议运行迁移脚本转为加密`);
    }
    return raw;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export function writeEncryptedFileSync(filePath, plaintext, { context = '', keyId = null } = {}) {
  const keys = loadEncryptionKeys();
  if (!keys) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`[FileVault] 生产环境禁止明文写入：${filePath}。必须配置 FILE_ENCRYPTION_KEY(S)。`);
    }
    console.warn(`[FileVault] ${filePath} 将以明文写入（开发环境降级）`);
    fsSync.writeFileSync(filePath, plaintext, 'utf-8');
    restrictFilePermissions(filePath);
    return;
  }

  const encrypted = encrypt(plaintext, { context, keyId });
  const tempFile = `${filePath}.tmp`;
  fsSync.writeFileSync(tempFile, encrypted, 'utf-8');
  fsSync.renameSync(tempFile, filePath);
  restrictFilePermissions(filePath);
}

// ============================================================
// 用户级密码派生加密（用于高敏感字段，如导出备份）
// ============================================================

const PASSWORD_KDF = 'pbkdf2-sha256';
const PASSWORD_ITERATIONS = 600000;

export function deriveKeyFromPassword(password, salt) {
  const effectiveSalt = salt || crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, effectiveSalt, PASSWORD_ITERATIONS, KEY_LENGTH, 'sha256');
  return { key, salt: effectiveSalt };
}

export function encryptWithPassword(plaintext, password, { context = '' } = {}) {
  const { key, salt } = deriveKeyFromPassword(password);
  const iv = crypto.randomBytes(IV_LENGTH);
  const aad = buildAAD('password-derived', context);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  secureClear(key);

  const envelope = {
    v: 2,
    alg: ALGORITHM,
    kdf: PASSWORD_KDF,
    iter: PASSWORD_ITERATIONS,
    keyId: 'password-derived',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    aad: aad.toString('base64'),
    ct: ciphertext.toString('base64'),
  };

  return `${VAULT_PREFIX_V2}${Buffer.from(JSON.stringify(envelope), 'utf-8').toString('base64')}`;
}

export function decryptWithPassword(encryptedText, password, { context = '' } = {}) {
  if (!isEncrypted(encryptedText)) {
    throw new Error('[FileVault] 输入不是有效的加密格式');
  }

  const prefix = encryptedText.startsWith(VAULT_PREFIX_V2) ? VAULT_PREFIX_V2 : VAULT_PREFIX_V1;
  const payload = Buffer.from(encryptedText.slice(prefix.length), 'base64').toString('utf-8');
  const envelope = JSON.parse(payload);

  if (envelope.v !== 2 || envelope.kdf !== PASSWORD_KDF) {
    throw new Error('[FileVault] 不支持的密码派生加密格式');
  }

  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.tag, 'base64');
  const aad = Buffer.from(envelope.aad, 'base64');
  const ciphertext = Buffer.from(envelope.ct, 'base64');

  const { key } = deriveKeyFromPassword(password, salt);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf-8');
  } finally {
    key.fill(0);
  }
}

// ============================================================
// 用户级数据密钥材料派生（供前端加密本地敏感数据使用）
// 注意：这是服务端可派生的密钥，适合保护浏览器本地缓存；
// 如需端到端加密，应使用用户密码通过 encryptWithPassword。
// ============================================================

export function deriveUserDataKeyMaterial(userId) {
  if (!userId) return null;
  const primaryKey = getEncryptionKey('primary');
  if (!primaryKey) return null;

  // 使用 HKDF-SHA256 从主密钥派生用户专属 keyMaterial
  // salt/info 均包含 userId，保证不同用户、不同用途的密钥隔离
  const salt = Buffer.from(`lingualeap-udk|${userId}`, 'utf-8');
  const info = Buffer.from(`client-data-key|v2|${userId}`, 'utf-8');
  const prk = crypto.createHmac('sha256', salt).update(primaryKey).digest();
  const okm = crypto.createHmac('sha256', prk).update(info).update(Buffer.from([1])).digest();
  return okm.toString('base64');
}

// 安全清零内存中的密钥缓存（仅用于测试或密钥轮换后）
export function clearKeyCache() {
  if (keysCache) {
    for (const key of keysCache.keys.values()) {
      key.fill(0);
    }
    keysCache = null;
  }
  keyWarningLogged = false;
}
