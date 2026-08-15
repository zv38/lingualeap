// ============================================================
// 文件加密密钥轮换脚本
// 用法：
//   node scripts/rotate-file-encryption-key.js --dry-run    # 预览
//   node scripts/rotate-file-encryption-key.js --apply      # 正式轮换
// 说明：
//   - 生成新的 primary 密钥
//   - 旧 primary 降级为 legacy，保留解密能力
//   - 扫描 api/data 下所有已加密文件并重加密
//   - 新密钥集合写回 DPAPI/Provider 保护文件
// ============================================================

import { rotateFileEncryptionKeys, verifyEncryptionIntegrity } from '../api/security/vault/keyRotationEngine.js'

const dryRun = process.argv.includes('--dry-run')
const apply = process.argv.includes('--apply')

if (!dryRun && !apply) {
  console.error('[rotate-key] 请指定 --dry-run 预览或 --apply 正式执行')
  process.exit(1)
}

async function main() {
  console.log(`[rotate-key] 模式: ${dryRun ? '预览' : '正式轮换'}`)

  const report = await rotateFileEncryptionKeys({ dryRun })

  console.log(`[rotate-key] 旧主密钥 ID: ${report.previousPrimaryKeyId}`)
  console.log(`[rotate-key] 新主密钥 ID: ${report.newPrimaryKeyId}`)
  console.log(`[rotate-key] 处理文件数: ${report.filesProcessed.length}`)

  for (const r of report.filesProcessed) {
    console.log(`  [${r.status}] ${r.filePath}${r.size !== undefined ? ` (${r.size} bytes)` : ''}`)
    if (r.error) {
      console.error(`    错误: ${r.error}`)
    }
  }

  if (!dryRun) {
    console.log('[rotate-key] 正在验证所有文件可用新密钥解密...')
    const integrity = await verifyEncryptionIntegrity()
    const failed = integrity.filter(i => !i.ok)
    if (failed.length > 0) {
      console.error('[rotate-key] 完整性校验失败：')
      for (const f of failed) {
        console.error(`  ${f.filePath}: ${f.error}`)
      }
      process.exit(1)
    }
    console.log('[rotate-key] 完整性校验通过，所有文件可用新密钥解密')
    console.log('[rotate-key] 提示：旧 legacy 密钥可在确认业务正常后手动从 key store 中移除')
  }
}

main().catch(err => {
  console.error('[rotate-key] 轮换失败:', err.message)
  process.exit(1)
})
