// 创建测试用户脚本
// 用法：node scripts/create-test-user.mjs

import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 先设置环境变量，让 secretVault 能找到密钥
process.env.NODE_ENV = process.env.NODE_ENV || 'development'
process.env.LL_KEY_PROVIDER = 'dpapi'

// 使用项目内的 fileEncryptionKeyStore 加载密钥
const keyStorePath = path.resolve(__dirname, '../api/security/vault/fileEncryptionKeyStore.js')
const { loadFileEncryptionKeys } = await import(pathToFileURL(keyStorePath).href)

const keyStore = loadFileEncryptionKeys()
if (!keyStore) {
  console.error('[ERROR] 无法加载文件加密密钥')
  process.exit(1)
}

// 设置环境变量，让 fileVault 能找到密钥
process.env.FILE_ENCRYPTION_KEY = keyStore.keys[keyStore.primaryKeyId]

// 现在导入 fileVault
const fileVaultPath = path.resolve(__dirname, '../api/security/privacy/fileVault.js')
const fileVault = await import(pathToFileURL(fileVaultPath).href)

const USERS_FILE = path.resolve(__dirname, '../api/data/users.json')
const raw = readFileSync(USERS_FILE, 'utf8').trim()

// 使用 fileVault 解密
let users
try {
  const decrypted = fileVault.decrypt(raw)
  users = JSON.parse(decrypted)
} catch (e) {
  console.error('[ERROR] 解密失败:', e.message)
  process.exit(1)
}

// 添加测试用户
const bcrypt = await import('bcrypt')
const bcryptObj = bcrypt.default || bcrypt
const password = 'Test@123456'
const hash = bcryptObj.hashSync(password, 10)

const testUser = {
  id: 'u-test-' + Date.now(),
  username: '测试用户',
  email: 'test@lingualeap.com',
  password: hash,
  avatar: '',
  level: 'beginner',
  role: 'user',
  createdAt: new Date().toISOString(),
  xp: 0,
  totalXP: 0,
  streakDays: 0,
  longestStreak: 0,
  dailyGoal: 20,
  reminderTime: '08:00',
  theme: 'light',
  language: 'zh',
  followers: [],
  following: [],
}

const existing = users.find(u => u.email === 'test@lingualeap.com')
if (existing) {
  console.log('✅ 测试用户已存在，信息如下：')
} else {
  users.push(testUser)
  // 使用 fileVault 加密
  const encrypted = fileVault.encrypt(JSON.stringify(users))
  writeFileSync(USERS_FILE, encrypted, 'utf8')
  console.log('✅ 测试用户创建成功！')
}

console.log('')
console.log('📧 邮箱: test@lingualeap.com')
console.log('🔑 密码: Test@123456')
console.log('')
console.log('⚠️  请重启后端服务后使用此账号登录')
console.log('   运行: npm run dev:api')