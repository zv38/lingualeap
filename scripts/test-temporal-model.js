// scripts/test-temporal-model.js
import { TemporalModel } from '../api/ai-decision/temporalModel.js'

const model = new TemporalModel({})

function ctx(path, method = 'GET', ip = '198.51.100.10') {
  return { path, method, ip }
}

// 正常浏览序列
for (const p of ['/', '/about', '/contact', '/products', '/products/1']) {
  model.record(ctx(p))
}

// 扫描序列
for (let i = 0; i < 10; i++) {
  model.record(ctx(`/admin/${i}`))
  model.record(ctx(`/config/${i}`))
}

const result = model.record(ctx('/admin/users'))
console.log('扫描序列风险分:', result.score)
console.log('信号:', result.signals.map((s) => s.type))

if (result.score < 0.5) {
  console.error('❌ 扫描序列应触发较高风险分')
  process.exit(1)
}

console.log('✅ 时序模型测试通过')
