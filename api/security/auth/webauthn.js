// ============================================================
// WebAuthn / FIDO2 — 管理员无密码/硬件密钥认证模块
// 依赖：@simplewebauthn/server
// 设计目标：
//   - 管理员可使用 FIDO2 安全密钥 / 指纹 / Face ID 登录
//   - 凭证信息加密持久化，防止本地文件泄露后直接可用
//   - 与现有 adminTrust 风险评分、审计日志、会话体系集成
// ============================================================

import crypto from 'crypto'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { readEncryptedFile, writeEncryptedFile } from '../privacy/fileVault.js'
import { logAudit, getClientIP } from '../core/auditLogger.js'

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'LinguaLeap Admin'
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000'
const CREDENTIALS_FILE = process.env.WEBAUTHN_CREDENTIALS_FILE || 'data/webauthn-credentials.json'

// 内存缓存，启动时从加密文件加载
let credentialsCache = null
let credentialsLoaded = false

function sanitizeCredentialForStorage(cred) {
  // 移除运行时对象（如 Buffer 等不可序列化数据）
  const clone = { ...cred }
  if (clone.publicKey && Buffer.isBuffer(clone.publicKey)) {
    clone.publicKey = Buffer.from(clone.publicKey).toString('base64')
  }
  return clone
}

async function loadCredentials() {
  if (credentialsLoaded) return credentialsCache || new Map()
  try {
    const raw = await readEncryptedFile(CREDENTIALS_FILE, { context: 'webauthn-credentials' })
    if (raw) {
      const parsed = JSON.parse(raw)
      credentialsCache = new Map(Object.entries(parsed))
      // 还原 base64 publicKey 为 Buffer（simplewebauthn 需要）
      for (const [userId, list] of credentialsCache.entries()) {
        if (Array.isArray(list)) {
          credentialsCache.set(
            userId,
            list.map(c => ({
              ...c,
              publicKey: c.publicKey ? Buffer.from(c.publicKey, 'base64') : undefined,
            }))
          )
        }
      }
    }
  } catch (err) {
    console.warn('[WebAuthn] 加载凭证失败:', err.message)
  }
  if (!credentialsCache) credentialsCache = new Map()
  credentialsLoaded = true
  return credentialsCache
}

async function saveCredentials() {
  const map = await loadCredentials()
  const serializable = {}
  for (const [userId, list] of map.entries()) {
    serializable[userId] = list.map(sanitizeCredentialForStorage)
  }
  await writeEncryptedFile(CREDENTIALS_FILE, JSON.stringify(serializable), { context: 'webauthn-credentials' })
}

async function getUserCredentials(userId) {
  const map = await loadCredentials()
  return map.get(userId) || []
}

async function addCredential(userId, credential) {
  const map = await loadCredentials()
  const list = map.get(userId) || []
  // 同设备重复注册时覆盖
  const idx = list.findIndex(c => c.credentialID === credential.credentialID)
  if (idx >= 0) list[idx] = credential
  else list.push(credential)
  map.set(userId, list)
  await saveCredentials()
}

async function removeCredential(userId, credentialId) {
  const map = await loadCredentials()
  const list = map.get(userId) || []
  const filtered = list.filter(c => c.credentialID !== credentialId)
  if (filtered.length === list.length) return false
  map.set(userId, filtered)
  await saveCredentials()
  return true
}

// 内存中保存注册/认证挑战（短期有效）
const challenges = new Map()
const CHALLENGE_TTL_MS = 2 * 60 * 1000

function setChallenge(userId, challenge, type) {
  const key = `${type}:${userId}`
  challenges.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS })
}

function consumeChallenge(userId, type) {
  const key = `${type}:${userId}`
  const record = challenges.get(key)
  if (!record) return null
  challenges.delete(key)
  if (Date.now() > record.expiresAt) return null
  return record.challenge
}

setInterval(() => {
  const now = Date.now()
  for (const [key, record] of challenges.entries()) {
    if (now > record.expiresAt) challenges.delete(key)
  }
}, 60 * 1000)

// ============================================================
// 注册流程（管理员登录后，在后台绑定安全密钥）
// ============================================================

export async function createWebAuthnRegistrationOptions(userId, userEmail, userName) {
  const userCredentials = await getUserCredentials(userId)

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(userId, 'utf-8'),
    userName: userEmail || userName || userId,
    userDisplayName: userName || userEmail || userId,
    attestationType: 'direct',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
      authenticatorAttachment: 'cross-platform',
    },
    excludeCredentials: userCredentials.map(c => ({
      id: Buffer.from(c.credentialID, 'base64'),
      type: 'public-key',
      transports: c.transports || [],
    })),
  })

  setChallenge(userId, options.challenge, 'registration')
  return options
}

export async function verifyWebAuthnRegistration(userId, body) {
  const expectedChallenge = consumeChallenge(userId, 'registration')
  if (!expectedChallenge) {
    throw Object.assign(new Error('注册挑战已过期或无效'), { code: 'WEBAUTHN_CHALLENGE_EXPIRED' })
  }

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw Object.assign(new Error('WebAuthn 注册验证失败'), { code: 'WEBAUTHN_REGISTRATION_FAILED' })
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  await addCredential(userId, {
    credentialID: Buffer.from(credential.id).toString('base64'),
    publicKey: Buffer.from(credential.publicKey),
    counter: credential.counter,
    credentialDeviceType,
    credentialBackedUp,
    transports: body.response?.transports || [],
    createdAt: new Date().toISOString(),
  })

  logAudit({ userId, action: 'webauthn_credential_registered', ip: 'system', details: '管理员注册 FIDO2 凭证', success: true })
  return { verified: true }
}

// ============================================================
// 认证流程（用于登录或敏感操作二次确认）
// ============================================================

export async function createWebAuthnAuthenticationOptions(userId) {
  const userCredentials = userId ? await getUserCredentials(userId) : []

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: userCredentials.map(c => ({
      id: Buffer.from(c.credentialID, 'base64'),
      type: 'public-key',
      transports: c.transports || [],
    })),
    userVerification: 'required',
  })

  // 无 userId 时用一个临时 key 保存挑战（登录前置阶段）
  const challengeKey = userId || `anon:${crypto.randomUUID()}`
  setChallenge(challengeKey, options.challenge, 'authentication')
  return { options, challengeKey }
}

export async function verifyWebAuthnAuthentication(userId, body, challengeKey) {
  const lookupUserId = userId || challengeKey
  const expectedChallenge = consumeChallenge(lookupUserId, 'authentication')
  if (!expectedChallenge) {
    throw Object.assign(new Error('认证挑战已过期或无效'), { code: 'WEBAUTHN_CHALLENGE_EXPIRED' })
  }

  const credentials = await getUserCredentials(userId)
  const credential = credentials.find(c => c.credentialID === body.id)
  if (!credential) {
    throw Object.assign(new Error('未找到对应 FIDO2 凭证'), { code: 'WEBAUTHN_CREDENTIAL_NOT_FOUND' })
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    authenticator: {
      credentialID: Buffer.from(credential.credentialID, 'base64'),
      credentialPublicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
    },
    requireUserVerification: true,
  })

  if (!verification.verified) {
    throw Object.assign(new Error('WebAuthn 认证验证失败'), { code: 'WEBAUTHN_AUTHENTICATION_FAILED' })
  }

  // 更新签名计数器，防止重放
  credential.counter = verification.authenticationInfo.newCounter
  await saveCredentials()

  logAudit({ userId, action: 'webauthn_authentication_success', ip: getClientIP(body._req) || 'system', details: 'FIDO2 认证通过', success: true })
  return { verified: true, credentialId: credential.credentialID }
}

// ============================================================
// 状态与删除
// ============================================================

export async function getWebAuthnStatus(userId) {
  const credentials = await getUserCredentials(userId)
  return {
    enabled: credentials.length > 0,
    credentials: credentials.map(c => ({
      id: c.credentialID,
      deviceName: c.credentialDeviceType || '安全密钥',
      createdAt: c.createdAt,
    })),
  }
}

export async function removeWebAuthnCredential(userId, credentialId) {
  const ok = await removeCredential(userId, credentialId)
  if (ok) {
    logAudit({ userId, action: 'webauthn_credential_removed', ip: 'system', details: `删除凭证 ${credentialId}`, success: true })
  }
  return ok
}

// 用于 Express 路由：生成 mTLS 证书认证要求的辅助信息
export function getWebAuthnConfig() {
  return { rpId: RP_ID, rpName: RP_NAME, origin: ORIGIN }
}
