import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { authApi } from './api'

export interface WebAuthnStatus {
  enabled: boolean
  credentials: { id: string; deviceName: string; createdAt: string }[]
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential === 'function'
  )
}

export async function registerWebAuthnCredential(): Promise<{ success: boolean; message?: string }> {
  try {
    const optionsRes = await authApi.webauthnRegisterOptions()
    if (!optionsRes.success || !optionsRes.data) {
      return { success: false, message: optionsRes.message || '获取注册选项失败' }
    }

    const attestation = await startRegistration({ optionsJSON: optionsRes.data })
    const verifyRes = await authApi.webauthnRegisterVerify(attestation)
    return { success: verifyRes.success, message: verifyRes.message }
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      return { success: false, message: '用户取消了验证，或设备未授权' }
    }
    if (err?.name === 'SecurityError') {
      return { success: false, message: '当前环境不支持生物识别验证' }
    }
    return { success: false, message: err?.message || '注册失败' }
  }
}

export async function loginWithWebAuthn(
  email: string,
  turnstileToken?: string
): Promise<{ success: boolean; message?: string; data?: unknown }> {
  try {
    const optionsRes = await authApi.webauthnLoginOptions(email, turnstileToken)
    if (!optionsRes.success || !optionsRes.data || !optionsRes.data.options) {
      return { success: false, message: optionsRes.message || '获取登录选项失败' }
    }

    const assertion = await startAuthentication({ optionsJSON: optionsRes.data.options })
    const verifyRes = await authApi.webauthnLoginVerify(
      optionsRes.data.userId,
      assertion,
      turnstileToken
    )
    return { success: verifyRes.success, message: verifyRes.message, data: verifyRes.data }
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      return { success: false, message: '验证被取消' }
    }
    if (err?.name === 'SecurityError') {
      return { success: false, message: '当前环境不支持生物识别验证' }
    }
    return { success: false, message: err?.message || '登录失败' }
  }
}

export async function getWebAuthnStatus(): Promise<WebAuthnStatus | null> {
  const res = await authApi.webauthnStatus()
  if (res.success && res.data) {
    return res.data as WebAuthnStatus
  }
  return null
}

export async function removeWebAuthnCredential(credentialId: string): Promise<{ success: boolean; message?: string }> {
  const res = await authApi.webauthnRemoveCredential(credentialId)
  return { success: res.success, message: res.message }
}

// ============================================================
// 管理员 WebAuthn / FIDO2 登录专用接口
// ============================================================

export async function loginAdminWithWebAuthn(sessionId: string): Promise<{
  success: boolean
  message?: string
  data?: unknown
}> {
  try {
    const optionsRes = await authApi.adminWebauthnLoginOptions(sessionId)
    if (!optionsRes.success || !optionsRes.data) {
      return { success: false, message: optionsRes.message || '获取安全密钥登录选项失败' }
    }

    const assertion = await startAuthentication({ optionsJSON: optionsRes.data })
    const verifyRes = await authApi.adminWebauthnLoginVerify(sessionId, assertion)
    return {
      success: verifyRes.success,
      message: verifyRes.message,
      data: verifyRes.data,
    }
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') {
      return { success: false, message: '安全密钥验证被取消' }
    }
    if (err?.name === 'SecurityError') {
      return { success: false, message: '当前环境不支持安全密钥验证' }
    }
    return { success: false, message: err?.message || '安全密钥登录失败' }
  }
}
