import { spawn } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import os from 'os'
import fs from 'fs'

// ===== Windows 编码修复 =====
// 确保控制台输出 UTF-8 中文正常显示，避免显示为乱码
if (process.platform === 'win32') {
  // 设置控制台输出编码为 UTF-8
  try {
    const { spawnSync } = await import('child_process')
    spawnSync('cmd.exe', ['/c', 'chcp', '65001'], { stdio: 'ignore' })
  } catch {
    // 编码设置失败不影响启动
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

const isProd = process.argv.includes('--prod')
const defaultEnvFile = resolve(os.homedir(), '.lingualeap-secrets', '.env.local')
const envFile = process.env.LL_ENV_FILE || defaultEnvFile

// Render/容器/K8s 环境：密钥通过系统环境变量注入，本地 .env.local 可能不存在。
// 只要已通过环境变量注入核心密钥，就允许跳过本地文件（环境变量注入模式）。
const envFileExists = fs.existsSync(envFile)
const hasEnvInjectedSecret = !!(process.env.JWT_SECRET && process.env.ADMIN_PASSWORD_HASH)

if (!envFileExists && !hasEnvInjectedSecret) {
  console.error('[start-api] 找不到环境配置文件: ' + envFile)
  console.error('[start-api] 请运行 npm run setup:keys 生成，或通过 LL_ENV_FILE 环境变量指定')
  console.error('[start-api] 若已在平台（Render/容器等）通过系统环境变量注入密钥，则无需本地文件')
  process.exit(1)
}

if (envFileExists) {
  console.log('[start-api] 使用环境配置文件: ' + envFile)
} else {
  console.log('[start-api] 未找到本地环境配置文件，使用系统环境变量注入的密钥（平台/容器模式）')
}

const env = { ...process.env }
if (isProd) {
  env.NODE_ENV = 'production'
}

// 本地开发辅助：解析 .env.local 中的明文配置项（非敏感开关、site key 等），
// 使显式写入该文件的环境变量能被 start-api.js 识别，避免仅依赖子进程 --env-file。
function parseEnvFile(path) {
  const result = {}
  try {
    const content = fs.readFileSync(path, 'utf-8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      // 去除首尾引号
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  } catch {}
  return result
}
const envFileVars = parseEnvFile(envFile)

// 同时加载项目根目录 .env 中的 VITE_* 前端变量（非敏感），传递给子进程
const rootEnvFile = resolve(rootDir, '.env')
if (fs.existsSync(rootEnvFile)) {
  const rootEnvVars = parseEnvFile(rootEnvFile)
  for (const [key, value] of Object.entries(rootEnvVars)) {
    if (key.startsWith('VITE_') && !env[key] && !envFileVars[key]) {
      env[key] = value
    }
  }
}

// ============================================================
// 军工级密钥加载：所有敏感密钥必须独立保护，禁止明文写入 .env.local
// 优先级：
//   1. 系统环境变量显式注入（生产/KMS推荐）
//   2. Windows DPAPI 单独加密的密钥文件
// 加载失败时生产环境直接退出，禁止带脆弱配置运行。
// ============================================================
const secretVault = await import(pathToFileURL(resolve(rootDir, 'api/security/vault/secretVault.js')).href)
const { loadSecretOrExit, loadSecretOrExitSigned, secureZero, validateFilePermissions } = secretVault

// 校验 .env.local 本身权限不过于宽松（仅当本地文件存在时）
if (envFileExists) {
  validateFilePermissions(envFile, isProd)
}

// 加载 env 校验器
const { validateEnv, validateJwtStrength } = await import(pathToFileURL(resolve(rootDir, 'api/security/system/envValidator.js')).href)

// 文件加密密钥（支持多版本密钥轮换）
if (!env.FILE_ENCRYPTION_KEY && !env.FILE_ENCRYPTION_KEYS) {
  try {
    const { loadFileEncryptionKeys } = await import(pathToFileURL(resolve(rootDir, 'api/security/vault/fileEncryptionKeyStore.js')).href)
    const keys = loadFileEncryptionKeys()
    if (keys) {
      env.FILE_ENCRYPTION_KEYS = JSON.stringify(keys)
      console.log('[start-api] 已加载文件加密密钥集合（primary + ' + (Object.keys(keys).length - 1) + ' 个版本）')
    } else {
      const msg = '未找到文件加密密钥，数据文件将以明文存储'
      if (isProd) {
        console.error('[FATAL-SECURITY] ' + msg)
        process.exit(1)
      }
      console.warn('[start-api] ' + msg)
    }
  } catch (err) {
    console.error('[start-api] 加载文件加密密钥失败:', err.message)
    if (isProd) {
      process.exit(1)
    }
  }
}

// JWT 密钥：生产强制加载，开发优先从 DPAPI 文件加载（带完整性校验）
env.JWT_SECRET = loadSecretOrExitSigned('JWT_SECRET', { required: isProd, validateFile: isProd }) || env.JWT_SECRET
env.JWT_REFRESH_SECRET = loadSecretOrExitSigned('JWT_REFRESH_SECRET', { required: isProd, validateFile: isProd }) || env.JWT_REFRESH_SECRET

// 支付密钥（带完整性校验）
env.PAYMENT_SECRET = loadSecretOrExitSigned('PAYMENT_SECRET', { required: isProd, validateFile: isProd }) || env.PAYMENT_SECRET

// Turnstile 人机验证密钥（任何环境都强制，带完整性校验）
// 本地开发允许通过 .env.local 显式覆盖，方便本地调试；生产环境仍强制 DPAPI/系统环境变量注入
const explicitTurnstileKey = env.TURNSTILE_SECRET_KEY || envFileVars.TURNSTILE_SECRET_KEY
env.TURNSTILE_SECRET_KEY = explicitTurnstileKey || loadSecretOrExitSigned('TURNSTILE_SECRET_KEY', { required: !explicitTurnstileKey, validateFile: isProd })

// 管理员隐私字段加密密钥（带完整性校验）
env.ADMIN_PRIVACY_KEY = loadSecretOrExitSigned('ADMIN_PRIVACY_KEY', { required: isProd, validateFile: isProd }) || env.ADMIN_PRIVACY_KEY

// 创建管理员账号的固定口令（带完整性校验，防静默篡改）
// 缺失时创建管理员接口将被拒绝（fail-closed），未经授权无法创建高权限账号
env.ADMIN_CREATE_SECRET = loadSecretOrExitSigned('ADMIN_CREATE_SECRET', { required: false, validateFile: isProd }) || env.ADMIN_CREATE_SECRET || envFileVars.ADMIN_CREATE_SECRET

// 管理员密码哈希（bcrypt）—— 带完整性签名校验，防静默篡改（fail-closed）
env.ADMIN_PASSWORD_HASH = loadSecretOrExitSigned('admin-password-hash', { required: isProd, validateFile: isProd }) || env.ADMIN_PASSWORD_HASH

// 安全：校验完成后，如存在明文 ADMIN_PASSWORD 环境变量，应清零（不再使用）
if (env.ADMIN_PASSWORD) {
  secureZero(env.ADMIN_PASSWORD)
  delete env.ADMIN_PASSWORD
  if (isProd) {
    console.warn('[start-api] 检测到 ADMIN_PASSWORD 明文环境变量，已忽略。请使用 ADMIN_PASSWORD_HASH 或 DPAPI 保护的 admin-password-hash.enc')
  }
}

// ============================================================
// 军工级 env 校验：使用 zod 按 schema 校验所有必需配置
// 缺关键 secret 或配置错误时直接 fail-fast，禁止带病运行
// ============================================================
const envValidation = validateEnv(env, { fatal: isProd })
if (!envValidation.valid && !isProd) {
  // 开发环境也给出警告，但不断绝启动
  console.warn('[start-api] 开发环境跳过部分校验，但建议修复以上问题')
}

// JWT 密钥熵校验
if (env.JWT_SECRET && env.JWT_REFRESH_SECRET) {
  validateJwtStrength(env.JWT_SECRET, env.JWT_REFRESH_SECRET)
}

const nodeArgs = envFileExists ? ['--env-file=' + envFile, 'api/index.js'] : ['api/index.js']
const child = spawn('node', nodeArgs, {
  cwd: rootDir,
  env,
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
