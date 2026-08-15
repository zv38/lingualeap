import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const WATCH_DIR = path.resolve('.security')
const BASELINE_FILE = path.join(WATCH_DIR, 'baseline.json')
const REPORT_FILE = path.join(WATCH_DIR, 'integrity-report.json')

const WATCHED_PATTERNS = [
  { dir: path.resolve('api'), pattern: /\.js$/, critical: true },
  { dir: path.resolve('src'), pattern: /\.(ts|tsx|js|jsx)$/, critical: true },
  { file: path.resolve('.env'), check: true },
  { file: path.resolve('package.json'), check: true },
]

try {
  if (!fs.existsSync(WATCH_DIR)) {
    fs.mkdirSync(WATCH_DIR, { recursive: true })
  }
} catch {}

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath)
    return crypto.createHash('sha3-256').update(content).digest('hex')
  } catch {
    return null
  }
}

function walkDir(dir) {
  const results = []
  try {
    const list = fs.readdirSync(dir)
    for (const item of list) {
      const fullPath = path.join(dir, item)
      if (item === 'node_modules' || item === '.git' || item.startsWith('.')) continue
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        results.push(...walkDir(fullPath))
      } else {
        results.push(fullPath)
      }
    }
  } catch {}
  return results
}

export function buildBaseline() {
  const baseline = {}
  const now = new Date().toISOString()

  for (const entry of WATCHED_PATTERNS) {
    if (entry.dir) {
      const files = walkDir(entry.dir)
      for (const filePath of files) {
        if (entry.pattern.test(filePath)) {
          const hash = hashFile(filePath)
          if (hash) baseline[filePath] = { hash, critical: entry.critical }
        }
      }
    }
    if (entry.file) {
      const hash = hashFile(entry.file)
      if (hash) baseline[entry.file] = { hash, check: entry.check }
    }
  }

  const data = { timestamp: now, files: baseline }
  try {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(data, null, 2), { mode: 0o400 })
  } catch {}
  return data
}

export function verifyIntegrity() {
  try {
    if (!fs.existsSync(BASELINE_FILE)) {
      return { valid: false, error: '基线文件不存在，需要重建' }
    }

    const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'))
    const changes = []

    for (const [filePath, expected] of Object.entries(baseline.files)) {
      const currentHash = hashFile(filePath)
      if (!currentHash) {
        changes.push({ file: filePath, status: 'missing', critical: expected.critical })
        continue
      }
      if (currentHash !== expected.hash) {
        changes.push({ file: filePath, status: 'modified', critical: expected.critical })
      }
    }

    const report = {
      timestamp: new Date().toISOString(),
      totalFiles: Object.keys(baseline.files).length,
      changes: changes.length,
      criticalChanges: changes.filter(c => c.critical).length,
      changes,
    }

    try {
      fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2))
    } catch {}

    return report
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

export { buildBaseline as rebuildBaseline }