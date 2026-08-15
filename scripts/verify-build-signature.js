import path from 'path'
import { verifyBuildIntegrity } from '../api/security/supplychain/signatureStore.js'

const DIST_DIR = path.resolve(process.cwd(), 'dist')
const SIGNATURE_PATH = path.resolve(process.cwd(), '.security', 'build-signature.json')

async function main() {
  console.log('🔐 开始校验构建签名完整性...\n')
  const result = await verifyBuildIntegrity({
    distDir: DIST_DIR,
    signaturePath: SIGNATURE_PATH,
  })

  if (!result.ok) {
    console.error(`❌ 构建签名校验失败: ${result.reason}`)
    if (result.changed && result.changed.length > 0) {
      console.error('\n变更文件:')
      for (const c of result.changed) {
        console.error(
          `  - ${c.file}: expected=${c.expected?.slice(0, 16)}... actual=${c.actual?.slice(0, 16)}...`
        )
      }
    }
    process.exit(1)
  }

  console.log('✅ 构建签名校验通过')
  console.log(`   Merkle Root: ${result.rootHash}`)
  console.log(`   文件数量: ${result.fileCount}`)
  console.log(`   签名时间: ${result.timestamp}`)
}

main().catch((err) => {
  console.error('❌ 校验过程发生异常:', err.message)
  process.exit(1)
})
