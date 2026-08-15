import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import {
  walkDir,
  hashBuffer,
  hashString,
  buildMerkleRoot,
  getSigningKey,
} from './buildSigner.js'

const ROOT_DIR = process.cwd()
const SECURITY_DIR = path.join(ROOT_DIR, '.security')
const SIGNATURE_PATH = path.join(SECURITY_DIR, 'build-signature.json')

/**
 * 从磁盘加载构建签名。
 */
export async function loadSignature(signaturePath = SIGNATURE_PATH) {
  const raw = await fs.readFile(signaturePath, 'utf-8')
  return JSON.parse(raw)
}

/**
 * 将构建签名保存到磁盘。
 */
export async function saveSignature(signature, signaturePath = SIGNATURE_PATH) {
  await fs.mkdir(path.dirname(signaturePath), { recursive: true })
  await fs.writeFile(signaturePath, JSON.stringify(signature, null, 2), 'utf-8')
  return signaturePath
}

/**
 * 运行时校验 dist/ 目录完整性：重新计算哈希树，与签名中的 rootHash 比对，并校验 HMAC 签名。
 */
export async function verifyBuildIntegrity(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR
  const distDir = options.distDir || path.join(rootDir, 'dist')
  const signaturePath = options.signaturePath || SIGNATURE_PATH

  let signature
  try {
    signature = await loadSignature(signaturePath)
  } catch (err) {
    return { ok: false, reason: `Cannot load signature: ${err.message}` }
  }

  const currentFiles = {}
  const leaves = []

  try {
    await fs.access(distDir)
  } catch {
    return { ok: false, reason: `dist directory not found: ${distDir}` }
  }

  for await (const file of walkDir(distDir)) {
    const rel = path.relative(distDir, file).replace(/\\/g, '/')
    const content = await fs.readFile(file)
    const fileHash = hashBuffer(content)
    currentFiles[rel] = fileHash
    leaves.push(hashString(`${rel}|${fileHash}`))
  }

  const currentRoot = buildMerkleRoot(leaves)

  if (currentRoot !== signature.rootHash) {
    const changed = []
    for (const [rel, hash] of Object.entries(currentFiles)) {
      if (signature.files[rel] !== hash) {
        changed.push({ file: rel, expected: signature.files[rel], actual: hash })
      }
    }
    for (const rel of Object.keys(signature.files)) {
      if (!(rel in currentFiles)) {
        changed.push({ file: rel, expected: signature.files[rel], actual: null })
      }
    }
    return { ok: false, reason: 'Merkle root mismatch', changed }
  }

  const signingKey = await getSigningKey(rootDir)
  const expectedSig = crypto.createHmac('sha256', signingKey).update(signature.rootHash).digest('hex')
  if (expectedSig !== signature.signature) {
    return { ok: false, reason: 'Signature verification failed' }
  }

  return {
    ok: true,
    rootHash: currentRoot,
    fileCount: Object.keys(currentFiles).length,
    timestamp: signature.timestamp,
  }
}
