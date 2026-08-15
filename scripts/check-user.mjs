// 检查测试用户脚本
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.LL_KEY_PROVIDER = 'dpapi'
process.env.NODE_ENV = 'development'

const keyStorePath = path.resolve(__dirname, '../api/security/vault/fileEncryptionKeyStore.js')
const { loadFileEncryptionKeys } = await import(pathToFileURL(keyStorePath).href)

const keys = loadFileEncryptionKeys()
if (!keys) { console.error('无法加载密钥'); process.exit(1) }

process.env.FILE_ENCRYPTION_KEY = keys.keys[keys.primaryKeyId]

const fileVault = await import(pathToFileURL(path.resolve(__dirname, '../api/security/privacy/fileVault.js')).href)

const raw = readFileSync(path.resolve(__dirname, '../api/data/users.json'), 'utf8').trim()
const decrypted = fileVault.decrypt(raw)
const users = JSON.parse(decrypted)

const testUser = users.find(u => u.email === 'test@lingualeap.com')
if (testUser) {
  console.log('✅ 用户存在:', testUser.email, testUser.username)
  console.log('   密码哈希前24位:', testUser.password.substring(0, 24) + '...')
  console.log('   哈希格式:', testUser.password.startsWith('$2') ? '正确(bcrypt)' : '异常')
  console.log('   哈希长度:', testUser.password.length)
  console.log('   用户角色:', testUser.role)
  
  // 测试密码验证
  const bcrypt = await import('bcrypt')
  const bcryptObj = bcrypt.default || bcrypt
  const testPassword = 'Test@123456'
  const isValid = bcryptObj.compareSync(testPassword, testUser.password)
  console.log('   密码验证:', isValid ? '✅ 通过' : '❌ 失败')
  
  if (!isValid) {
    // 重新生成哈希并保存
    console.log('\n   密码哈希不匹配，重新生成...')
    const newHash = bcryptObj.hashSync(testPassword, 10)
    testUser.password = newHash
    const encrypted = fileVault.encrypt(JSON.stringify(users))
    const { writeFileSync } = await import('fs')
    writeFileSync(path.resolve(__dirname, '../api/data/users.json'), encrypted, 'utf8')
    console.log('   已重新生成并保存密码哈希')
  }
} else {
  console.log('❌ 未找到测试用户')
}