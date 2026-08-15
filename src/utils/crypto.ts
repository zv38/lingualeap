// ============================================================
// 前端加密工具库 v2
// 目标：统一 Envelope 格式、可持久解密、支持服务端派生密钥
// 算法：AES-256-GCM + HKDF-SHA256
// 注意：本库只提供加密原语，实际 keyMaterial 应从 /api/me/data-key 获取
// ============================================================

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12
const SALT_LENGTH = 32
const KDF = 'hkdf-sha256'
const VAULT_PREFIX = 'enc:v2:'

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

function uint8ArrayToArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(arr.length)
  copy.set(arr)
  return copy.buffer as unknown as ArrayBuffer
}

function toBufferSource(arr: Uint8Array): BufferSource {
  // TypeScript DOM 类型将 Uint8Array.buffer 标记为 ArrayBufferLike，
  // 但 Web Crypto API 运行时接受任何 ArrayBufferView，这里用断言绕过严格类型检查。
  return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength) as unknown as BufferSource
}

async function deriveKey(
  keyMaterial: ArrayBuffer,
  salt: Uint8Array,
  info: string
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', keyMaterial, { name: 'HKDF' }, false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: uint8ArrayToArrayBuffer(salt),
      info: uint8ArrayToArrayBuffer(stringToBuffer(info)),
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

function buildInfo(context: string): string {
  return `lingualeap-client|v2|${ALGORITHM}|${context || 'default'}`
}

function isEncryptedString(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(VAULT_PREFIX)
}

interface EncryptOptions {
  // 服务端 /api/me/data-key 返回的 keyMaterial（base64）
  keyMaterial: string
  // 数据上下文，用于 AAD 绑定，防止密文被挪用到其他场景
  context?: string
}

interface DecryptOptions {
  keyMaterial: string
}

/**
 * 加密任意可序列化数据。
 * keyMaterial 必须从服务端派生获取，不能是客户端随机生成的 sessionStorage 值，
 * 否则切换标签页/设备后将无法解密。
 */
export async function encryptData(data: unknown, options: EncryptOptions): Promise<string> {
  if (!options?.keyMaterial) {
    throw new Error('[Crypto] 缺少 keyMaterial，无法加密')
  }

  const material = base64ToBuffer(options.keyMaterial)
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(uint8ArrayToArrayBuffer(material), salt, buildInfo(options.context || ''))
  const plaintext = stringToBuffer(JSON.stringify(data))
  const aad = stringToBuffer(buildInfo(options.context || ''))

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: toBufferSource(iv), additionalData: toBufferSource(aad) },
    key,
    toBufferSource(plaintext)
  )

  const envelope = {
    v: 2,
    alg: ALGORITHM,
    kdf: KDF,
    context: options.context || '',
    salt: bufferToBase64(uint8ArrayToArrayBuffer(salt)),
    iv: bufferToBase64(uint8ArrayToArrayBuffer(iv)),
    tag: bufferToBase64(uint8ArrayToArrayBuffer(new Uint8Array(encrypted.slice(-16)))),
    aad: bufferToBase64(uint8ArrayToArrayBuffer(aad)),
    ct: bufferToBase64(uint8ArrayToArrayBuffer(new Uint8Array(encrypted.slice(0, -16)))),
  }

  return `${VAULT_PREFIX}${btoa(JSON.stringify(envelope))}`
}

/**
 * 解密前端加密数据。
 */
export async function decryptData<T>(encrypted: string, options: DecryptOptions): Promise<T | null> {
  if (!isEncryptedString(encrypted)) {
    // 不再兼容明文 JSON，防止误将敏感数据以明文落盘/传输
    return null
  }

  if (!options?.keyMaterial) {
    throw new Error('[Crypto] 缺少 keyMaterial，无法解密')
  }

  try {
    const envelopeJson = atob(encrypted.slice(VAULT_PREFIX.length))
    const envelope = JSON.parse(envelopeJson)

    // 严格校验 envelope 所有关键字段，拒绝未知/降级格式
    if (
      envelope.v !== 2 ||
      envelope.alg !== ALGORITHM ||
      envelope.kdf !== KDF ||
      typeof envelope.salt !== 'string' ||
      typeof envelope.iv !== 'string' ||
      typeof envelope.tag !== 'string' ||
      typeof envelope.aad !== 'string' ||
      typeof envelope.ct !== 'string'
    ) {
      return null
    }

    const material = base64ToBuffer(options.keyMaterial)
    const salt = base64ToBuffer(envelope.salt)
    const iv = base64ToBuffer(envelope.iv)
    const tag = base64ToBuffer(envelope.tag)
    const aad = base64ToBuffer(envelope.aad)
    const ciphertext = base64ToBuffer(envelope.ct)

    // 重建密文：ciphertext + authTag
    const combined = new Uint8Array(ciphertext.length + tag.length)
    combined.set(ciphertext, 0)
    combined.set(tag, ciphertext.length)

    const key = await deriveKey(uint8ArrayToArrayBuffer(material), salt, buildInfo(envelope.context || ''))
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: toBufferSource(iv), additionalData: toBufferSource(aad) },
      key,
      uint8ArrayToArrayBuffer(combined)
    )

    return JSON.parse(new TextDecoder().decode(decrypted)) as T
  } catch {
    // 生产环境不输出解密失败细节，防止泄露内部状态
    return null
  }
}

/**
 * 使用用户密码派生密钥进行加密（端到端场景，如本地备份）。
 * 派生参数足够强（PBKDF2 60 万次），但运行会比较慢，不建议高频调用。
 */
export async function encryptWithPassword(data: unknown, password: string, context = ''): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    uint8ArrayToArrayBuffer(stringToBuffer(password)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: uint8ArrayToArrayBuffer(salt),
      iterations: 600000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const plaintext = stringToBuffer(JSON.stringify(data))
  const aad = stringToBuffer(buildInfo(context))
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: toBufferSource(iv), additionalData: toBufferSource(aad) },
    key,
    toBufferSource(plaintext)
  )

  const envelope = {
    v: 2,
    alg: ALGORITHM,
    kdf: 'pbkdf2-sha256',
    iter: 600000,
    context,
    salt: bufferToBase64(uint8ArrayToArrayBuffer(salt)),
    iv: bufferToBase64(uint8ArrayToArrayBuffer(iv)),
    tag: bufferToBase64(uint8ArrayToArrayBuffer(new Uint8Array(encrypted.slice(-16)))),
    aad: bufferToBase64(uint8ArrayToArrayBuffer(aad)),
    ct: bufferToBase64(uint8ArrayToArrayBuffer(new Uint8Array(encrypted.slice(0, -16)))),
  }

  return `${VAULT_PREFIX}${btoa(JSON.stringify(envelope))}`
}

/**
 * 使用用户密码派生密钥进行解密。
 */
export async function decryptWithPassword<T>(encrypted: string, password: string): Promise<T | null> {
  if (!isEncryptedString(encrypted)) return null

  try {
    const envelope = JSON.parse(atob(encrypted.slice(VAULT_PREFIX.length)))
    if (envelope.v !== 2 || envelope.kdf !== 'pbkdf2-sha256') {
      throw new Error('[Crypto] 不支持的密码派生格式')
    }

    const salt = base64ToBuffer(envelope.salt)
    const iv = base64ToBuffer(envelope.iv)
    const tag = base64ToBuffer(envelope.tag)
    const aad = base64ToBuffer(envelope.aad)
    const ciphertext = base64ToBuffer(envelope.ct)

    const combined = new Uint8Array(ciphertext.length + tag.length)
    combined.set(ciphertext, 0)
    combined.set(tag, ciphertext.length)

    const passwordKey = await crypto.subtle.importKey(
      'raw',
      uint8ArrayToArrayBuffer(stringToBuffer(password)),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: uint8ArrayToArrayBuffer(salt),
        iterations: envelope.iter || 600000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    )

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: toBufferSource(iv), additionalData: toBufferSource(aad) },
      key,
      uint8ArrayToArrayBuffer(combined)
    )

    return JSON.parse(new TextDecoder().decode(decrypted)) as T
  } catch (err) {
    console.error('[Crypto] 密码解密失败:', err)
    return null
  }
}
