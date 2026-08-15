import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

const ROOT_DIR = process.cwd()

const KNOWN_VULNERABLE_PATTERNS = [
  { name: 'event-stream', reason: 'Supply chain attack (2018)', severity: 'critical' },
  { name: 'flatmap-stream', reason: 'Malicious dependency injected into event-stream', severity: 'critical' },
  { name: 'rc', reason: 'Compromised version 1.2.9', severity: 'critical' },
  { name: 'colors', reason: 'Intentional infinite loop in versions >=1.4.1', severity: 'high' },
  { name: 'faker', reason: 'Author sabotaged versions >=6.6.6', severity: 'high' },
  { name: 'node-ipc', reason: 'Protestware in versions >=9.2.2', severity: 'high' },
]

const ALLOWED_REGISTRY_HOSTS = [
  'registry.npmjs.org',
  'npm.pkg.github.com',
  'registry.npmmirror.com',
  'registry.yarnpkg.com',
]
const ALLOWED_INTEGRITY_ALGOS = ['sha512', 'sha1', 'sha384', 'sha256']

function runNpmAudit(rootDir) {
  return new Promise((resolve) => {
    const child = spawn('npm audit --json --audit-level=none', {
      cwd: rootDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))

    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout)
        resolve({ ok: true, data: parsed, stderr })
      } catch {
        resolve({ ok: false, raw: stdout || stderr })
      }
    })
  })
}

function countAuditVulnerabilities(vulnerabilities) {
  return Object.values(vulnerabilities || {}).reduce((sum, group) => sum + (group?.total || 0), 0)
}

/**
 * 校验关键依赖的 integrity hash，运行 npm audit，并检测 lock 文件是否被篡改。
 */
export async function verifyDependencies(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR
  const pkgPath = path.join(rootDir, 'package.json')
  const lockPath = path.join(rootDir, 'package-lock.json')

  const [pkgRaw, lockRaw] = await Promise.all([
    fs.readFile(pkgPath, 'utf-8').catch(() => '{}'),
    fs.readFile(lockPath, 'utf-8').catch(() => '{}'),
  ])

  const pkg = JSON.parse(pkgRaw)
  const lock = JSON.parse(lockRaw)

  const report = {
    timestamp: new Date().toISOString(),
    project: { name: pkg.name, version: pkg.version },
    npmAudit: null,
    integrityChecks: [],
    knownVulnerabilities: [],
    lockFileTampering: { tampered: false, anomalies: [] },
    passed: true,
  }

  const audit = await runNpmAudit(rootDir)
  if (audit.ok) {
    const vulnerabilities = audit.data.vulnerabilities || {}
    report.npmAudit = {
      vulnerabilities,
      metadata: audit.data.metadata || {},
      total: countAuditVulnerabilities(vulnerabilities),
    }
    if (report.npmAudit.total > 0) {
      report.passed = false
    }
  } else {
    report.npmAudit = { error: 'Failed to parse npm audit output', raw: audit.raw }
    report.passed = false
  }

  const declaredDeps = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ])

  if (lock.packages) {
    for (const [key, info] of Object.entries(lock.packages)) {
      if (key === '') continue
      const parts = key.split('node_modules/')
      const fullName = parts[parts.length - 1]
      const depth = parts.length - 1
      const isTopLevel = depth === 1

      for (const pattern of KNOWN_VULNERABLE_PATTERNS) {
        if (fullName === pattern.name || fullName.endsWith(`/${pattern.name}`)) {
          report.knownVulnerabilities.push({
            package: fullName,
            version: info.version,
            reason: pattern.reason,
            severity: pattern.severity,
          })
          report.passed = false
        }
      }

      const integrity = info.integrity
      if (!integrity) {
        if (declaredDeps.has(fullName) || isTopLevel) {
          report.integrityChecks.push({
            package: fullName,
            version: info.version,
            ok: false,
            reason: 'Missing integrity hash in lock file',
          })
          report.lockFileTampering.anomalies.push(`Missing integrity: ${fullName}`)
          report.passed = false
        }
      } else {
        const [algo] = integrity.split('-')
        if (!ALLOWED_INTEGRITY_ALGOS.includes(algo)) {
          report.integrityChecks.push({
            package: fullName,
            version: info.version,
            ok: false,
            reason: `Unsupported integrity algorithm: ${algo}`,
          })
          report.lockFileTampering.anomalies.push(`Unsupported integrity algorithm: ${fullName}`)
          report.passed = false
        } else {
          report.integrityChecks.push({
            package: fullName,
            version: info.version,
            ok: true,
            algorithm: algo,
          })
        }
      }

      if (info.resolved) {
        try {
          const url = new URL(info.resolved)
          if (!ALLOWED_REGISTRY_HOSTS.includes(url.hostname)) {
            report.lockFileTampering.anomalies.push(
              `Unexpected registry host for ${fullName}: ${url.hostname}`
            )
            report.lockFileTampering.tampered = true
            report.passed = false
          }
        } catch {
          report.lockFileTampering.anomalies.push(
            `Invalid resolved URL for ${fullName}: ${info.resolved}`
          )
          report.lockFileTampering.tampered = true
          report.passed = false
        }
      }
    }
  }

  if (report.lockFileTampering.anomalies.length > 0) {
    report.lockFileTampering.tampered = true
  }

  return report
}
