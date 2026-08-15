// ============================================================
// Key Rotation Engine — 文件加密密钥轮换引擎
// 军工级要求：
//   - 新主密钥生成后立即生效，旧主密钥降级为 legacy（保留只读解密能力）
//   - 所有已加密数据文件使用新主密钥重加密
//   - 重加密过程原子化：先写 .tmp，再 rename，失败可回滚
//   - 轮换后旧版单密钥文件必须清理
// ============================================================

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import {
  loadFileEncryptionKeys,
  protectFileEncryptionKeys,
  removeLegacyFileEncryptionKey,
  generateFileEncryptionKey,
} from './fileEncryptionKeyStore.js'
import {
  readEncryptedFile,
  writeEncryptedFile,
  isEncrypted,
  clearKeyCache,
} from '../privacy/fileVault.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 扫描目录下需要重加密的文件（默认 api/data、data）
 */
export async function discoverEncryptedFiles(dirs) {
  const files = []
  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const filePath = path.join(dir, entry.name)
        const content = await fs.readFile(filePath, 'utf-8').catch(() => '')
        // 只处理已加密文件；明文文件由迁移脚本单独处理
        if (isEncrypted(content)) {
          files.push(filePath)
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[KeyRotation] 无法扫描目录 ${dir}: ${err.message}`)
      }
    }
  }
  return files
}

/**
 * 使用当前密钥集合重加密单个文件。
 * 失败时删除临时文件，原文件不受影响。
 */
export async function reencryptFile(filePath, { dryRun = false } = {}) {
  const plaintext = await readEncryptedFile(filePath)
  if (plaintext === null) {
    return { filePath, status: 'skipped', reason: '文件不存在或无法读取' }
  }

  if (dryRun) {
    return { filePath, status: 'dry-run', size: plaintext.length }
  }

  const tempFile = `${filePath}.rot`
  try {
    await writeEncryptedFile(tempFile, plaintext)
    await fs.rename(tempFile, filePath)
    return { filePath, status: 'reencrypted', size: plaintext.length }
  } catch (err) {
    try { await fs.unlink(tempFile) } catch {}
    throw new Error(`重加密 ${filePath} 失败: ${err.message}`)
  }
}

/**
 * 执行一轮密钥轮换。
 * 关键设计：
 *   - 先用旧密钥集合解密所有文件
 *   - 再用新 primary 密钥重新加密
 *   - 旧密钥保留为 legacy，确保未轮换/备份数据仍可解密
 */
export async function rotateFileEncryptionKeys(options = {}) {
  const dataDirs = options.dataDirs || [
    path.resolve(__dirname, '../../data'),
    path.resolve(__dirname, '../../../data'),
  ]
  const dryRun = options.dryRun ?? false

  const currentStore = loadFileEncryptionKeys()
  if (!currentStore) {
    throw new Error('未找到当前文件加密密钥，无法轮换。请先运行 npm run setup:keys 初始化。')
  }

  const { primaryKeyId: oldPrimaryKeyId, keys: oldKeys } = currentStore
  const { keyId: newKeyId, key: newKey } = generateFileEncryptionKey()

  // 解密阶段：使用当前完整密钥集合（保留所有 keyId 映射）
  process.env.FILE_ENCRYPTION_KEYS = JSON.stringify(currentStore)
  clearKeyCache()

  const files = await discoverEncryptedFiles(dataDirs)
  const plaintexts = []
  for (const filePath of files) {
    try {
      const plaintext = await readEncryptedFile(filePath)
      plaintexts.push({ filePath, plaintext })
    } catch (err) {
      plaintexts.push({ filePath, error: err.message })
    }
  }

  // 加密阶段：新 key 加入集合并设为主密钥；旧密钥保留以解密未轮换/备份数据
  const newStore = {
    primaryKeyId: newKeyId,
    keys: {
      ...oldKeys,
      [newKeyId]: newKey,
    },
  }
  process.env.FILE_ENCRYPTION_KEYS = JSON.stringify(newStore)
  clearKeyCache()

  const results = []
  let hasError = false
  for (const item of plaintexts) {
    if (item.error) {
      results.push({ filePath: item.filePath, status: 'error', error: item.error })
      hasError = true
      continue
    }
    try {
      if (dryRun) {
        results.push({ filePath: item.filePath, status: 'dry-run', size: item.plaintext.length })
      } else {
        const tempFile = `${item.filePath}.rot`
        try {
          await writeEncryptedFile(tempFile, item.plaintext)
          await fs.rename(tempFile, item.filePath)
          results.push({ filePath: item.filePath, status: 'reencrypted', size: item.plaintext.length })
        } catch (err) {
          try { await fs.unlink(tempFile) } catch {}
          throw err
        }
      }
    } catch (err) {
      results.push({ filePath: item.filePath, status: 'error', error: err.message })
      hasError = true
    }
  }

  // 只有全部文件成功重加密后，才持久化新密钥集合；否则保持旧密钥不变，避免锁死数据
  if (!dryRun && !hasError) {
    protectFileEncryptionKeys(newStore)
    removeLegacyFileEncryptionKey()
  }

  return {
    dryRun,
    previousPrimaryKeyId: oldPrimaryKeyId,
    newPrimaryKeyId: newKeyId,
    filesProcessed: results,
    hasError,
  }
}

/**
 * 验证当前密钥集合能否解密所有已加密文件。
 */
export async function verifyEncryptionIntegrity(dataDirs) {
  const dirs = dataDirs || [
    path.resolve(__dirname, '../../data'),
    path.resolve(__dirname, '../../../data'),
  ]
  const files = await discoverEncryptedFiles(dirs)
  const results = []
  for (const filePath of files) {
    try {
      const plaintext = await readEncryptedFile(filePath)
      results.push({ filePath, ok: true, size: plaintext?.length })
    } catch (err) {
      results.push({ filePath, ok: false, error: err.message })
    }
  }
  return results
}
