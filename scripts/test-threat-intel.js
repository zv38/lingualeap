// 外部威胁情报模块测试（内存降级路径，无 API key 时验证缓存与降级）
import { queryExternalThreatIntel, getStats } from '../api/ai-decision/externalThreatIntel.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  console.log('🌐 外部威胁情报模块测试\n')

  const stats = getStats()
  console.log('  配置状态:', stats)

  // 1. 无效 IP 返回空结果
  const r1 = await queryExternalThreatIntel('unknown')
  assert(r1.score === 0 && r1.sources.length === 0, '无效 IP 应返回空结果')
  console.log('  ✅ 无效 IP 处理正确')

  // 2. 本地 IP 查询不阻塞、结构正确（使用较长超时等待首次查询完成）
  const r2 = await queryExternalThreatIntel('127.0.0.1', { timeoutMs: 10000 })
  assert(r2.ip === '127.0.0.1', '应返回规范化 IP')
  assert(typeof r2.score === 'number', 'score 应为数字')
  assert(Array.isArray(r2.sources), 'sources 应为数组')
  console.log('  ✅ 本地 IP 查询结构正确')

  // 3. 缓存命中：同一 IP 第二次查询应直接返回缓存，结果与首次一致
  const r3 = await queryExternalThreatIntel('127.0.0.1')
  assert(r3.ip === r2.ip && r3.score === r2.score && r3.pending !== true, '缓存结果应一致且非 pending')
  console.log('  ✅ 缓存命中逻辑正确')

  // 4. IPv4-mapped IPv6 规范化
  const r4 = await queryExternalThreatIntel('::ffff:192.168.1.1')
  assert(r4.ip === '192.168.1.1', 'IPv4-mapped IPv6 应被规范化')
  console.log('  ✅ IP 规范化正确')

  console.log('\n✅ 威胁情报模块测试通过')
  console.log('   提示：未配置 ABUSEIPDB_API_KEY / IPINFO_TOKEN 时仅验证缓存与降级。')
}

main().catch(err => {
  console.error('\n❌ 测试失败:', err.message)
  process.exit(1)
})
