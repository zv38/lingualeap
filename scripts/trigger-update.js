// ===== 热更新触发脚本 =====
// 用法: node scripts/trigger-update.js [version] [--force]
// 功能: 通知所有在线的 SSE 客户端有新版本可用
// 场景: 部署/更新后端后，手动触发版本更新推送
//
// 示例:
//   node scripts/trigger-update.js                    # 推送当前版本号
//   node scripts/trigger-update.js 1.1.0              # 推送指定版本号
//   node scripts/trigger-update.js 1.1.0 --force       # 强制更新（用户无法关闭）

const API_BASE = process.env.API_URL || 'http://localhost:3001'
const fs = await import('fs')
const path = await import('path')
const { fileURLToPath } = await import('url')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const versionJsonPath = path.resolve(__dirname, '..', 'public', 'version.json')

async function triggerUpdate() {
  const args = process.argv.slice(2)
  const version = args.find(a => !a.startsWith('--')) || undefined
  const forceUpdate = args.includes('--force')

  console.log(`[Trigger] 正在触发版本更新广播${version ? ' → ' + version : ''}${forceUpdate ? ' (强制更新)' : ''}...`)

  // 读取当前 version.json 中的更新日志
  let changelog = []
  try {
    if (fs.existsSync(versionJsonPath)) {
      const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
      changelog = data.changelog || []
    }
  } catch (err) {
    console.warn('[Trigger] ⚠️ 读取 version.json 失败:', err.message)
  }

  // 第一步：先广播版本更新（携带详细的更新日志）
  try {
    const res = await fetch(`${API_BASE}/api/events/trigger-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, forceUpdate, changelog }),
    })

    const result = await res.json()
    if (result.success) {
      console.log(`[Trigger] ✅ 广播成功! 版本 ${result.data.version} 已推送到 ${result.data.clientsNotified || 'N/A'} 个客户端`)
      console.log(`[Trigger] 📋 本次携带 ${changelog.length} 条更新日志`)
    } else {
      console.error('[Trigger] ❌ 广播失败:', result.error || '未知错误')
      process.exit(1)
    }
  } catch (err) {
    console.error(`[Trigger] ❌ 无法连接到 API 服务器 (${API_BASE}):`, err.message)
    console.error('  请确保 API 服务器正在运行，或设置 API_URL 环境变量')
    process.exit(1)
  }

  // 第二步：广播完成后，更新 public/version.json（用户刷新后获取新版本）
  if (version) {
    try {
      const current = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
      current.version = version
      current.buildTime = new Date().toISOString()

      // 如果没有传入新版本的 changelog，自动添加一条基本信息
      const hasNewVersionLog = current.changelog?.some(c => c.version === version)
      if (!hasNewVersionLog) {
        const newEntry = {
          version,
          date: new Date().toISOString().split('T')[0],
          title: `版本 ${version} 更新`,
          details: version === '1.0.0'
            ? ['基础功能上线']
            : [`版本 ${version} 更新发布，包含多项功能优化与问题修复`],
        }
        current.changelog = current.changelog || []
        current.changelog.unshift(newEntry)
      }

      fs.writeFileSync(versionJsonPath, JSON.stringify(current, null, 2) + '\n')
      console.log(`[Trigger] 📄 已更新 version.json → ${version}（用户刷新后生效）`)
    } catch (err) {
      console.warn('[Trigger] ⚠️ 更新 version.json 失败:', err.message)
    }
  }
}

triggerUpdate()