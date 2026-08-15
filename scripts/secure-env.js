import { execSync } from 'child_process'
import os from 'os'
import path from 'path'

const envPath = path.join(os.homedir(), '.lingualeap-secrets', '.env.local')
const username = os.userInfo().username

console.log(`[secure-env] 目标文件: ${envPath}`)
console.log(`[secure-env] 当前用户: ${username}`)

try {
  // 移除继承权限，仅允许当前用户和 SYSTEM 读取
  execSync(
    `icacls "${envPath}" /inheritance:r /grant "${username}:(R)" /grant "SYSTEM:(R)"`,
    { stdio: 'inherit' }
  )
  console.log('[secure-env] .env.local 访问权限已收紧')
} catch {
  console.error('[secure-env] 设置 ACL 失败，请右键以管理员身份运行：')
  console.error(`  icacls "${envPath}" /inheritance:r /grant "${username}:(R)" /grant "SYSTEM:(R)"`)
  process.exit(1)
}
