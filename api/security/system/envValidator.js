// ============================================================
// envValidator — 军工级环境变量校验层
// 使用 zod 按 schema 校验所有必需配置，缺关键 secret 或配置错误时 fail-fast，
// 确保系统不会带着脆弱/缺失配置运行。
// 校验时机：每次 start-api.js 启动时执行，任何致命错误直接 process.exit(1)。
// ============================================================

import { z } from 'zod'
import crypto from 'crypto'

// Cloudflare Turnstile 官方测试密钥列表
const TURNSTILE_TEST_KEYS = [
  '1x0000000000000000000000000000000AA',
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
]

// 占位符检测
function isPlaceholder(val) {
  if (!val || typeof val !== 'string') return true
  return /^\s*$|^你的|^替换为|^请替换|change[-_]?me|placeholder|example|testtest|12345678|^password$/i.test(val)
}

// 是否是已知弱密钥（已泄露的 hex 密钥）
function isWeakHexKey(val, minLen) {
  if (!val || val.length < minLen) return true
  if (!/^[0-9a-f]{64,}$/i.test(val)) return false // 只检测 hex 密钥
  const LEAKED = [
    '117b5c751eec5bda370cbf4071d9961f5ef74214c5d95dd051ff09657e7d7f65',
    'e8a4f2c9d1b6e3f7a0c5d2e8b4f1a6c9d3e7b5f2a0c4d1e8f6b3a7c9d0e2f',
  ]
  return LEAKED.includes(val.toLowerCase())
}

// 环境变量 zod schema 定义
const EnvSchema = z.object({
  // ===== 运行时 =====
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),

  // ===== JWT 密钥（军工级：至少 256/384 位） =====
  JWT_SECRET: z
    .string()
    .min(64, 'JWT_SECRET 至少需要 64 字符（256 位 hex）')
    .refine((v) => !isPlaceholder(v), 'JWT_SECRET 是占位符，请替换为真实密钥')
    .refine((v) => !isWeakHexKey(v, 64), 'JWT_SECRET 是已知弱密钥，请立即更换'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(96, 'JWT_REFRESH_SECRET 至少需要 96 字符（384 位 hex）')
    .refine((v) => !isPlaceholder(v), 'JWT_REFRESH_SECRET 是占位符')
    .refine((v) => !isWeakHexKey(v, 96), 'JWT_REFRESH_SECRET 是已知弱密钥'),

  // ===== Turnstile 人机验证（任何环境必填，禁用测试密钥） =====
  TURNSTILE_SECRET_KEY: z
    .string()
    .min(1, 'TURNSTILE_SECRET_KEY 未设置')
    .refine((v) => !isPlaceholder(v), 'TURNSTILE_SECRET_KEY 是占位符')
    .refine((v) => !TURNSTILE_TEST_KEYS.includes(v), '禁止使用 Turnstile 测试密钥，机器人可绕过验证'),
  VITE_TURNSTILE_SITE_KEY: z
    .string()
    .min(1, 'VITE_TURNSTILE_SITE_KEY 未设置')
    .refine((v) => !isPlaceholder(v), 'VITE_TURNSTILE_SITE_KEY 是占位符'),

  // ===== 管理员密码哈希（bcrypt） =====
  ADMIN_PASSWORD_HASH: z
    .string()
    .min(60, 'ADMIN_PASSWORD_HASH 不是有效的 bcrypt 哈希（长度不足 60）')
    .refine((v) => !isPlaceholder(v), 'ADMIN_PASSWORD_HASH 是占位符'),
  ADMIN_PASSWORD: z
    .string()
    .optional()
    .refine((v) => !v, '禁止使用明文 ADMIN_PASSWORD 环境变量，请使用 ADMIN_PASSWORD_HASH'),

  // ===== 管理员隐私字段加密密钥 =====
  ADMIN_PRIVACY_KEY: z
    .string()
    .min(1, 'ADMIN_PRIVACY_KEY 未设置')
    .refine((v) => !isPlaceholder(v), 'ADMIN_PRIVACY_KEY 是占位符')
    .refine(
      (v) => {
        try {
          return Buffer.from(v, 'base64').length === 32
        } catch {
          return false
        }
      },
      'ADMIN_PRIVACY_KEY 不是有效的 32 字节 base64 密钥'
    ),

  // ===== 支付密钥 =====
  PAYMENT_SECRET: z
    .string()
    .min(64, 'PAYMENT_SECRET 至少需要 64 字符（256 位 hex）')
    .refine((v) => !isPlaceholder(v), 'PAYMENT_SECRET 是占位符'),

  // ===== 文件加密密钥（至少配置一个） =====
  FILE_ENCRYPTION_KEY: z.string().optional(),
  FILE_ENCRYPTION_KEYS: z.string().optional(),

  // ===== 密钥存储 Provider =====
  LL_KEY_PROVIDER: z.enum(['env', 'dpapi', 'kms', 'hsm', 'auto']).optional(),

  // ===== Turnstile 测试密钥开关（生产环境强制禁止） =====
  TURNSTILE_ALLOW_TEST_KEY: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (process.env.NODE_ENV === 'production' && v === 'true') return false
        return true
      },
      '生产环境禁止设置 TURNSTILE_ALLOW_TEST_KEY=true'
    ),
  LL_ALLOW_TURNSTILE_TEST_KEY: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (process.env.NODE_ENV === 'production' && v === 'true') return false
        return true
      },
      '生产环境禁止设置 LL_ALLOW_TURNSTILE_TEST_KEY=true'
    ),

  // ===== 验证码测试模式 =====
  CAPTCHA_TEST_MODE: z
    .string()
    .optional()
    .refine((v) => v !== 'true', 'CAPTCHA_TEST_MODE=true 会导致验证码明文泄露，已禁止'),

  // ===== 网络与安全 =====
  ALLOWED_ORIGINS: z.string().optional(),
  ADMIN_IP_WHITELIST: z.string().optional(),

  // ===== 可选配置（无安全影响） =====
  ZHIPUAI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_MODELS_MODEL: z.string().optional(),
  AI_MODEL_PRIORITY: z.enum(['primary', 'fallback', 'github-only']).optional(),
  YOUDAO_APP_ID: z.string().optional(),
  YOUDAO_APP_SECRET: z.string().optional(),
  YOUDAO_API_KEY: z.string().optional(),
  ENABLE_WEBAUTHN: z.string().optional(),
  AUDIT_SQLITE_SAVE_INTERVAL_MS: z.coerce.number().int().positive().optional(),
  AI_ENHANCED_DEFENSE: z.string().optional(),
  AI_SMART_ISOLATION: z.string().optional(),
  AI_ACTIVE_DEFENSE: z.string().optional(),
  AI_HONEYPOT_DYNAMIC: z.string().optional(),
  AI_DECEPTION_RESPONSE: z.string().optional(),
  AI_TARPIT_ENABLED: z.string().optional(),
  AI_AUTO_ISOLATION_LINK: z.string().optional(),
  AI_EXTERNAL_THREAT_INTEL: z.string().optional(),
  ADMIN_ALLOW_INITIAL_SETUP_WITHOUT_MFA: z.string().optional(),
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).optional(),
  INTEGRITY_KEY: z.string().optional(),
}).refine(
  (data) => data.FILE_ENCRYPTION_KEY || data.FILE_ENCRYPTION_KEYS,
  'FILE_ENCRYPTION_KEY 或 FILE_ENCRYPTION_KEYS 必须至少配置一个，否则数据文件将以明文存储'
).refine(
  (data) => data.JWT_SECRET !== data.JWT_REFRESH_SECRET,
  'JWT_SECRET 与 JWT_REFRESH_SECRET 不能相同'
)

/**
 * 校验环境变量配置。
 * @param {Record<string, string>} env - 环境变量对象（通常是 process.env 或自定义 env 对象）
 * @param {object} [options]
 * @param {boolean} [options.fatal=true] - 失败时是否 process.exit(1)
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateEnv(env, { fatal = true } = {}) {
  const result = EnvSchema.safeParse(env)
  const errors = []
  const warnings = []

  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.')
      errors.push(`${path}: ${issue.message}`)
    }
  }

  // 生产环境额外检查
  if (env.NODE_ENV === 'production') {
    if (!env.ALLOWED_ORIGINS || !env.ALLOWED_ORIGINS.includes('https://')) {
      warnings.push('生产环境建议 ALLOWED_ORIGINS 只允许 https:// 地址')
    }
    if (env.LL_KEY_PROVIDER === 'dpapi' || (!env.LL_KEY_PROVIDER && process.platform === 'win32')) {
      errors.push('生产环境禁止使用 DPAPI 密钥存储，请设置 LL_KEY_PROVIDER=env 或 kms')
    }
  }

  // 输出结果
  if (errors.length > 0) {
    console.error('\n═══════════════════════════════════════════════════')
    console.error('  ❌ 环境变量校验失败！')
    for (const err of errors) {
      console.error(`     - ${err}`)
    }
    console.error('═══════════════════════════════════════════════════\n')
    if (fatal) {
      process.exit(1)
    }
  }

  if (warnings.length > 0) {
    for (const warn of warnings) {
      console.warn(`[SECURITY-WARN] ${warn}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 校验 JWT 密钥强度（已通过 zod schema 校验，此为额外硬件熵检查）。
 */
export function validateJwtStrength(jwtSecret, jwtRefreshSecret) {
  const checks = []

  // 检查 JWT 密钥的字节熵
  try {
    const buf = Buffer.from(jwtSecret, 'hex')
    const uniqueBytes = new Set(buf)
    if (uniqueBytes.size < 16) {
      checks.push('JWT_SECRET 熵值过低（不同字节数 < 16），疑似非随机生成')
    }
  } catch {}

  try {
    const buf = Buffer.from(jwtRefreshSecret, 'hex')
    const uniqueBytes = new Set(buf)
    if (uniqueBytes.size < 24) {
      checks.push('JWT_REFRESH_SECRET 熵值过低（不同字节数 < 24），疑似非随机生成')
    }
  } catch {}

  if (checks.length > 0) {
    for (const msg of checks) {
      console.warn(`[SECURITY-WARN] ${msg}`)
    }
  }

  return checks
}