import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const ROOT_DIR = process.cwd()
const SECURITY_DIR = path.join(ROOT_DIR, '.security')
const SIGNATURE_PATH = path.join(SECURITY_DIR, 'build-signature.json')

export async function* walkDir(dir) {
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

export function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

export function hashString(str) {
  return crypto.createHash('sha256').update(str, 'utf-8').digest('hex')
}

/**
 * 构建 Merkle 树根：叶子为 sha256(relativePath|fileHash)，排序后两两哈希归约。
 */
export function buildMerkleRoot(leaves) {
  if (leaves.length === 0) return hashString('')
  let level = [...leaves].sort()
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]
      const right = level[i + 1] || left
      next.push(hashString(left + right))
    }
    level = next
  }
  return level[0]
}

export async function getSigningKey(rootDir) {
  if (process.env.BUILD_SIGNING_KEY) {
    return process.env.BUILD_SIGNING_KEY
  }
  const pkgRaw = await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8').catch(() => '{}')
  const pkg = JSON.parse(pkgRaw)
  return crypto
    .createHash('sha256')
    .update(`${pkg.name || 'unknown'}:${pkg.version || '0.0.0'}:supply-chain-signer`)
    .digest('hex')
}

/**
 * 对 dist/ 目录计算哈希树，使用 HMAC-SHA256 签名，生成 .security/build-signature.json。
 */
export async function signBuild(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR
  const distDir = options.distDir || path.join(rootDir, 'dist')
  const outputPath = options.outputPath || SIGNATURE_PATH
  const signingKey = await getSigningKey(rootDir)

  const files = {}
  const leaves = []

  try {
    await fs.access(distDir)
  } catch {
    throw new Error(`dist directory not found: ${distDir}`)
  }

  for await (const file of walkDir(distDir)) {
    const rel = path.relative(distDir, file).replace(/\\/g, '/')
    const content = await fs.readFile(file)
    const fileHash = hashBuffer(content)
    files[rel] = fileHash
    leaves.push(hashString(`${rel}|${fileHash}`))
  }

  const merkleRoot = buildMerkleRoot(leaves)
  const signature = crypto.createHmac('sha256', signingKey).update(merkleRoot).digest('hex')

  const sig = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    algorithm: 'HMAC-SHA256',
    hashAlgorithm: 'SHA-256',
    treeAlgorithm: 'merkle-sha256',
    distDir: path.relative(rootDir, distDir).replace(/\\/g, '/'),
    rootHash: merkleRoot,
    signature,
    files,
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, JSON.stringify(sig, null, 2), 'utf-8')

  return { path: outputPath, rootHash: merkleRoot, fileCount: Object.keys(files).length }
}
