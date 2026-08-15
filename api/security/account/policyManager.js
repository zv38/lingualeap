import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { readEncryptedFile, writeEncryptedFile } from '../privacy/fileVault.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const POLICY_FILE = path.join(__dirname, '..', 'data', 'security-policy.json')

// 默认安全政策内容
const DEFAULT_POLICY = {
  version: '1.0.0',
  effectiveAt: new Date().toISOString(),
  title: 'LinguaLeap 安全与风控政策',
  sections: [
    {
      heading: '我们为什么需要风控',
      content: '为了保护平台学习环境与用户数据安全，我们会对注册与使用行为进行风险分析。系统仅在识别到异常或潜在恶意行为时才会采取限制措施。',
    },
    {
      heading: '我们会收集哪些信息',
      content: '风控系统可能收集的信息包括：IP 地址（哈希化后存储）、设备指纹、User-Agent、注册/登录时间、表单交互行为、操作频率等。敏感信息会经过字段级加密与脱敏处理。',
    },
    {
      heading: '什么行为可能触发限制',
      content: '包括但不限于：批量注册、使用自动化工具、使用一次性邮箱、短时间内大量操作、IP 来自高风险/云主机环境、设备指纹与行为模式异常等。',
    },
    {
      heading: '账号可能进入的状态',
      content: '正常、观察、受限、冻结、永久封禁。观察状态仅轻微限速；受限状态禁止发布、支付与修改安全设置；冻结/封禁账号需通过申诉复核。',
    },
    {
      heading: '申诉与复核',
      content: '如果您认为账号被误判，可在限制提示页提交申诉。每个账号 7 天内只能提交一次申诉，管理员会在后台审核并给出结果。申诉通过后，限制将被解除。',
    },
    {
      heading: '政策更新',
      content: '我们可能会根据安全形势更新本政策。更新后的政策会在生效前通过网站公告或登录提示告知用户，继续使用服务即视为同意。',
    },
  ],
}

let currentPolicy = { ...DEFAULT_POLICY }
let userAcceptances = new Map()
let saveTimer = null

async function loadPolicy() {
  try {
    const data = await readEncryptedFile(POLICY_FILE)
    if (data) {
      const parsed = JSON.parse(data)
      if (parsed.policy) currentPolicy = parsed.policy
      if (parsed.acceptances) {
        userAcceptances = new Map(Object.entries(parsed.acceptances))
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[PolicyManager] 加载政策数据失败:', err.message)
    }
  }
}

async function savePolicy() {
  try {
    const data = JSON.stringify({
      policy: currentPolicy,
      acceptances: Object.fromEntries(userAcceptances),
    }, null, 2)
    await writeEncryptedFile(POLICY_FILE, data)
  } catch (err) {
    console.warn('[PolicyManager] 保存政策数据失败:', err.message)
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => savePolicy().catch(() => {}), 1000)
}

export function getCurrentPolicy() {
  return currentPolicy
}

export async function updatePolicy(adminId, newPolicy) {
  const now = new Date().toISOString()
  currentPolicy = {
    ...currentPolicy,
    ...newPolicy,
    version: bumpVersion(currentPolicy.version),
    effectiveAt: now,
    updatedBy: adminId,
  }
  await savePolicy()
  return currentPolicy
}

function bumpVersion(version) {
  const parts = (version || '1.0.0').split('.').map(Number)
  parts[2] = (parts[2] || 0) + 1
  return parts.join('.')
}

export function recordAcceptance(userId, version) {
  userAcceptances.set(userId, {
    version,
    acceptedAt: new Date().toISOString(),
  })
  scheduleSave()
}

export function getUserAcceptance(userId) {
  return userAcceptances.get(userId) || null
}

export function needsAcceptance(userId) {
  const acceptance = userAcceptances.get(userId)
  if (!acceptance) return true
  return acceptance.version !== currentPolicy.version
}

// 启动时加载
loadPolicy().catch(() => {})

// 进程退出前保存
process.on('SIGINT', () => savePolicy().catch(() => {}))
process.on('SIGTERM', () => savePolicy().catch(() => {}))
