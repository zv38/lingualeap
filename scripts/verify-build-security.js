import fs from 'fs/promises'
import path from 'path'

// 简单递归遍历目录，避免依赖 glob
async function* walkDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkDir(fullPath)
    } else {
      yield fullPath
    }
  }
}

async function collectFiles(dir, pattern) {
  const files = []
  for await (const file of walkDir(dir)) {
    if (pattern.test(file)) files.push(path.relative(dir, file))
  }
  return files
}

// ============================================================
// 前端构建产物安全校验脚本
// 在 npm run build 之后运行，检查：
// 1. 不存在 .map 文件，防止源码泄露
// 2. 构建产物中不包含硬编码的敏感密钥/配置
// 3. 敏感源码路径未被意外打包进输出
// 4. 混淆后的 chunk 不包含大量可读的原始 React 组件名
// ============================================================

const DIST_DIR = path.resolve(process.cwd(), 'dist')
const ASSETS_DIR = path.join(DIST_DIR, 'assets')

const SENSITIVE_PATTERNS = [
  /JWT_SECRET\s*[:=]\s*['"][a-zA-Z0-9+/=]{32,}['"]/i,
  /FILE_ENCRYPTION_KEY\s*[:=]\s*['"][a-zA-Z0-9+/=]{32,}['"]/i,
  /ADMIN_PASSWORD\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /PAYMENT_SECRET\s*[:=]\s*['"][a-zA-Z0-9]{32,}['"]/i,
  /TURNSTILE_SECRET_KEY\s*[:=]\s*['"][^'"]+['"]/i,
  /sk-[a-zA-Z0-9]{48}/i,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  /DATABASE_URL\s*[:=]\s*['"][^'"]+['"]/i,
  /MONGO_URI\s*[:=]\s*['"][^'"]+['"]/i,
  /redis:\/\/[^\s"]+/i,
  /postgres:\/\/[^\s"]+/i,
]

const SUSPICIOUS_PATH_PATTERNS = [
  // 明确的后端/脚本源码文件路径，正常前端产物不应包含
  /\/src\/utils\/environmentCheck\.ts/,
  /\/api\/index\.[cm]?js/,
  /\/api\/security\/[\w-]+\.js/,
  /\/scripts\/[\w-]+\.js/,
  // 环境配置文件
  /\.env\.local/,
  /\.env\.production/,
  /\.env$/,
]

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function checkSourceMaps() {
  const mapFiles = await collectFiles(DIST_DIR, /\.map$/i)
  if (mapFiles.length > 0) {
    throw new Error(`❌ 发现 ${mapFiles.length} 个 Source Map 文件，可能泄露源码：\n${mapFiles.join('\n')}`)
  }
  console.log('✅ 未发现 Source Map 文件')
}

async function checkSensitiveLeakage() {
  const assetFiles = await collectFiles(DIST_DIR, /\.(js|css|html|json)$/i)
  const issues = []

  for (const file of assetFiles) {
    const filePath = path.join(DIST_DIR, file)
    const content = await fs.readFile(filePath, 'utf-8')

    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(`  ${file}: 匹配 ${pattern.toString()}`)
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(`❌ 构建产物中检测到潜在敏感信息泄露：\n${issues.join('\n')}`)
  }
  console.log('✅ 未发现硬编码敏感密钥泄露')
}

async function checkSuspiciousPaths() {
  const assetFiles = await collectFiles(DIST_DIR, /\.(js|css|html)$/i)
  const issues = []

  for (const file of assetFiles) {
    const filePath = path.join(DIST_DIR, file)
    const content = await fs.readFile(filePath, 'utf-8')

    for (const pattern of SUSPICIOUS_PATH_PATTERNS) {
      if (pattern.test(content)) {
        issues.push(`  ${file}: 匹配 ${pattern.toString()}`)
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(`❌ 构建产物中包含可疑路径引用：\n${issues.join('\n')}`)
  }
  console.log('✅ 未发现可疑源码路径泄露')
}

async function checkInlineSourceMapReferences() {
  const assetFiles = await collectFiles(DIST_DIR, /\.(js|css)$/i)
  const issues = []
  for (const file of assetFiles) {
    const content = await fs.readFile(path.join(DIST_DIR, file), 'utf-8')
    if (/\/\/# sourceMappingURL=.*$/m.test(content) || /\/\*# sourceMappingURL=.*\*\//m.test(content)) {
      issues.push(`  ${file}: 仍包含 sourceMappingURL 引用`)
    }
  }
  if (issues.length > 0) {
    throw new Error(`❌ 构建产物中存在 source map 引用：\n${issues.join('\n')}`)
  }
  console.log('✅ 未发现内联 source map 引用')
}

async function checkInsecureHttpFallback() {
  const assetFiles = await collectFiles(DIST_DIR, /\.(js|html)$/i)
  const issues = []
  // 已知的 XML/SVG namespace 与库内部 URL，不属于 API 明文回退
  const ALLOWED_HTTP_PREFIXES = [
    'http://www.w3.org/',
    'http://www.w3.org/XML/1998/namespace',
    'http://www.w3.org/1999/xlink',
    'http://www.w3.org/2000/svg',
    'http://www.w3.org/1998/Math/MathML',
    'http://www.w3.org/1999/xhtml',
    'http://fb.me/',
    'http://purl.org/',
    'http://schema.org/',
    // Workbox 生成的 sw.js 头部包含 Apache 许可证链接，属静态版权声明而非 API 明文回退
    'http://www.apache.org/licenses/LICENSE-2.0',
  ]
  for (const file of assetFiles) {
    const content = await fs.readFile(path.join(DIST_DIR, file), 'utf-8')
    // 检测明文 http:// API 地址（开发环境 localhost 除外，生产环境必须 https）
    const httpUrls = content.match(/http:\/\/[^\s"'`]+/g) || []
    for (const url of httpUrls) {
      if (/localhost|127\.0\.0\.1|::1/.test(url)) continue
      if (ALLOWED_HTTP_PREFIXES.some(prefix => url.startsWith(prefix))) continue
      issues.push(`  ${file}: 包含明文 HTTP 地址 ${url.slice(0, 80)}`)
    }
  }
  if (issues.length > 0) {
    throw new Error(`❌ 构建产物中包含生产环境明文 HTTP 地址：\n${issues.join('\n')}`)
  }
  console.log('✅ 未发现生产环境明文 HTTP 回退地址')
}

async function checkObfuscationHint() {
  // 仅做轻量提示：检查 JS chunk 中是否仍包含大量未混淆的 React 组件名前缀
  // 真正判断混淆强度需要更复杂的指标，这里只输出统计供人工复核
  const jsFiles = await collectFiles(DIST_DIR, /assets[\\/][^\\/]+\.js$/i)
  const adminChunks = jsFiles.filter(f => /admin/i.test(f))

  console.log(`\n📦 构建产物统计：`)
  console.log(`   总 JS 文件数: ${jsFiles.length}`)
  console.log(`   管理员相关 chunk: ${adminChunks.length}`)

  for (const file of adminChunks) {
    const filePath = path.join(DIST_DIR, file)
    const stats = await fs.stat(filePath)
    console.log(`   - ${file}: ${formatSize(stats.size)}`)
  }

  if (adminChunks.length === 0) {
    console.log('   ℹ️  未找到明显标记为 admin 的 chunk，可能已被代码拆分或混淆')
  }
}

async function main() {
  try {
    await fs.access(DIST_DIR)
  } catch {
    throw new Error('❌ dist 目录不存在，请先运行 npm run build')
  }

  console.log('🔒 开始校验前端构建产物安全性...\n')
  await checkSourceMaps()
  await checkInlineSourceMapReferences()
  await checkSensitiveLeakage()
  await checkSuspiciousPaths()
  await checkInsecureHttpFallback()
  await checkObfuscationHint()
  console.log('\n✅ 构建产物安全校验通过')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
