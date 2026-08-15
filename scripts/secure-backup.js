import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ──────────────── 配置常量 ────────────────

const DEFAULT_BACKUP_DIR = path.join(PROJECT_ROOT, 'backup');
const DEFAULT_MAX_BACKUPS = 7;
const KEY_ENV_VAR = 'BACKUP_ENCRYPTION_KEY';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MANIFEST_FILE = 'backup-manifest.json';

// 数据文件目录
const DATA_DIRS = ['api/data'];
// 配置文件（相对于项目根目录）
const CONFIG_GLOBS = [
  '.env',
  '.env.*',
  '.certs',
];
// 审计日志目录
const AUDIT_DIRS = ['.security'];

// ──────────────── 日志工具 ────────────────

function log(level, message, data = null) {
  const ts = new Date().toISOString();
  const prefix = `[Backup]`;
  const extra = data ? ` | ${typeof data === 'string' ? data : JSON.stringify(data)}` : '';
  if (level === 'ERROR') {
    console.error(`${prefix} [${ts}] ERROR: ${message}${extra}`);
  } else if (level === 'WARN') {
    console.warn(`${prefix} [${ts}] WARN: ${message}${extra}`);
  } else {
    console.log(`${prefix} [${ts}] ${level}: ${message}${extra}`);
  }
}

function info(msg, data) { log('INFO', msg, data); }
function warn(msg, data) { log('WARN', msg, data); }
function error(msg, data) { log('ERROR', msg, data); }

// ──────────────── 密钥管理 ────────────────

/**
 * 获取加密密钥。
 * 安全规范：密钥只从环境变量 BACKUP_ENCRYPTION_KEY 读取，绝不写入项目目录明文密钥文件。
 * 密钥与密文必须分离存放，否则加密形同虚设（攻击者拿到备份即可用同目录密钥解密）。
 */
function getEncryptionKey() {
  // 1. 环境变量（唯一合法来源）
  let key = process.env[KEY_ENV_VAR];
  if (key) {
    const buf = Buffer.from(key, 'base64');
    if (buf.length === KEY_LENGTH) return buf;
    warn(`环境变量 ${KEY_ENV_VAR} 长度无效（需要 ${KEY_LENGTH} 字节 base64）`);
  }

  // 2. 无密钥时报错并提示，绝不自动生成明文密钥文件
  throw new Error(
    `未配置加密密钥。请设置环境变量 ${KEY_ENV_VAR}（32 字节 base64），` +
    `生成方式: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"。` +
    `密钥必须保存在安全位置（系统密码库/环境变量），严禁与备份同目录存放。`
  );
}

// ──────────────── 加密/解密 ────────────────

/**
 * 使用 AES-256-GCM 加密数据。
 * 返回格式: base64(iv):base64(authTag):base64(ciphertext)
 */
function encrypt(data, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * 解密由 encrypt() 产生的数据。
 */
function decrypt(encoded, key) {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('加密数据格式无效，预期 3 段 base64 数据');
  }
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ──────────────── 文件扫描 ────────────────

/**
 * 收集需要备份的文件列表。
 * @param {'full'|'data-only'|'config-only'} mode
 * @returns {string[]} 相对于项目根目录的文件路径
 */
function collectFiles(mode) {
  const files = [];

  if (mode === 'full' || mode === 'data-only') {
    for (const dir of DATA_DIRS) {
      const absDir = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(absDir)) { warn(`数据目录不存在: ${absDir}`); continue; }
      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && !entry.name.startsWith('.')) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
  }

  if (mode === 'full' || mode === 'config-only') {
    for (const pattern of CONFIG_GLOBS) {
      if (pattern.endsWith('*')) {
        // glob 通配符 .env.*
        const base = pattern.replace('*', '');
        const dir = path.dirname(base) === '' ? PROJECT_ROOT : path.join(PROJECT_ROOT, path.dirname(base));
        const prefix = path.basename(base);
        if (fs.existsSync(dir)) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.startsWith(prefix)) {
              files.push(path.join(path.dirname(base), entry.name));
            }
          }
        }
      } else {
        const absPath = path.join(PROJECT_ROOT, pattern);
        if (fs.existsSync(absPath)) {
          const stat = fs.statSync(absPath);
          if (stat.isDirectory()) {
            // 递归收集目录下的非隐藏文件
            const collectDir = (baseDir, relPrefix) => {
              const entries = fs.readdirSync(baseDir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(baseDir, entry.name);
                const relPath = path.join(relPrefix, entry.name);
                if (entry.isFile() && !entry.name.startsWith('.')) {
                  files.push(relPath);
                } else if (entry.isDirectory()) {
                  collectDir(fullPath, relPath);
                }
              }
            };
            collectDir(absPath, pattern);
          } else if (stat.isFile()) {
            files.push(pattern);
          }
        }
      }
    }
  }

  if (mode === 'full') {
    for (const dir of AUDIT_DIRS) {
      const absDir = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(absDir)) { continue; }
      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
  }

  return files.sort();
}

// ──────────────── 备份清单 ────────────────

/**
 * 计算文件的 SHA256 校验和。
 */
function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 计算 Buffer 的 SHA256 校验和。
 */
function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// ──────────────── 核心功能 ────────────────

/**
 * 创建备份。
 * @param {Object} options
 * @param {'full'|'data-only'|'config-only'} options.mode - 备份模式（默认 full）
 * @param {string} [options.backupDir] - 备份存储目录（默认 backup/）
 * @param {boolean} [options.verbose] - 是否输出详细日志（默认 false）
 * @returns {Promise<Object>} 备份结果
 */
export async function createBackup(options = {}) {
  const mode = options.mode || 'full';
  const backupDir = options.backupDir || DEFAULT_BACKUP_DIR;
  const verbose = options.verbose || false;

  if (!['full', 'data-only', 'config-only'].includes(mode)) {
    throw new Error(`无效的备份模式: ${mode}（可选: full, data-only, config-only）`);
  }

  info(`开始 ${mode} 模式备份`, { backupDir });

  // 确保备份目录存在
  fs.mkdirSync(backupDir, { recursive: true });

  // 获取加密密钥
  const key = getEncryptionKey();

  // 生成备份 ID
  const timestamp = new Date();
  const backupId = timestamp.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const backupPath = path.join(backupDir, `${backupId}_${mode}`);
  fs.mkdirSync(backupPath, { recursive: true });

  // 收集文件
  const files = collectFiles(mode);
  if (files.length === 0) {
    warn('未找到需要备份的文件');
    return { backupId, backupPath, files: 0, mode, status: 'empty' };
  }

  info(`发现 ${files.length} 个文件待备份`);
  if (verbose) files.forEach(f => info(`  -> ${f}`));

  // 备份清单条目
  const manifestEntries = [];
  const errors = [];

  for (const relPath of files) {
    const sourcePath = path.join(PROJECT_ROOT, relPath);
    const destPath = path.join(backupPath, relPath);

    try {
      if (!fs.existsSync(sourcePath)) {
        warn(`源文件不存在，跳过: ${relPath}`);
        continue;
      }

      // 读取源文件
      const data = fs.readFileSync(sourcePath);
      const checksum = sha256Buffer(data);

      // 加密
      const encrypted = encrypt(data, key);

      // 确保目标目录存在
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      // 写入加密文件
      fs.writeFileSync(destPath + '.enc', encrypted, 'utf-8');

      manifestEntries.push({
        file: relPath,
        checksum,
        checksumAlgorithm: 'sha256',
        encryption: 'aes-256-gcm',
        size: data.length,
        encryptedSize: Buffer.byteLength(encrypted, 'utf-8'),
        timestamp: timestamp.toISOString(),
      });

      if (verbose) info(`  已备份: ${relPath}`);
    } catch (err) {
      error(`备份文件失败: ${relPath}`, err.message);
      errors.push({ file: relPath, error: err.message });
    }
  }

  // 写入备份清单
  const manifest = {
    backupId,
    backupPath,
    mode,
    createdAt: timestamp.toISOString(),
    createdAtEpoch: timestamp.getTime(),
    totalFiles: manifestEntries.length,
    files: manifestEntries,
    errors: errors.length > 0 ? errors : undefined,
    manifestChecksum: '',
  };

  // 计算清单自身的校验和
  const manifestJson = JSON.stringify(manifest, null, 2);
  manifest.manifestChecksum = sha256Buffer(Buffer.from(manifestJson));

  const finalManifest = { ...manifest, manifestChecksum: manifest.manifestChecksum };
  fs.writeFileSync(path.join(backupPath, MANIFEST_FILE), JSON.stringify(finalManifest, null, 2));

  info(`备份完成: ${backupPath}`, { files: manifestEntries.length, errors: errors.length });

  // 清理旧备份
  const cleaned = await cleanupOldBackups(DEFAULT_MAX_BACKUPS, { backupDir, silent: true });
  if (cleaned.removed > 0) {
    info(`已清理 ${cleaned.removed} 个旧备份`);
  }

  return {
    backupId,
    backupPath,
    mode,
    files: manifestEntries.length,
    errors: errors.length,
    status: errors.length > 0 ? 'partial' : 'success',
    manifestChecksum: manifest.manifestChecksum,
  };
}

/**
 * 列出所有备份。
 * @param {string} [backupDir] - 备份存储目录
 * @returns {Array<Object>} 备份列表
 */
export function listBackups(backupDir) {
  const dir = backupDir || DEFAULT_BACKUP_DIR;

  if (!fs.existsSync(dir)) {
    info('备份目录不存在', { dir });
    return [];
  }

  const backups = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(dir, entry.name, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      backups.push({
        backupId: manifest.backupId || entry.name,
        path: path.join(dir, entry.name),
        mode: manifest.mode || 'unknown',
        createdAt: manifest.createdAt || '',
        totalFiles: manifest.totalFiles || 0,
        manifestChecksum: manifest.manifestChecksum || '',
        valid: manifest.manifestChecksum
          ? verifyManifestIntegrity(manifest)
          : false,
      });
    } catch (err) {
      warn(`读取备份清单失败: ${entry.name}`, err.message);
      backups.push({
        backupId: entry.name,
        path: path.join(dir, entry.name),
        mode: 'unknown',
        createdAt: '',
        totalFiles: 0,
        valid: false,
        error: err.message,
      });
    }
  }

  // 按创建时间降序排序
  backups.sort((a, b) => {
    if (!a.createdAt && !b.createdAt) return 0;
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return backups;
}

/**
 * 验证备份清单的完整性。
 */
function verifyManifestIntegrity(manifest) {
  if (!manifest || !manifest.manifestChecksum) return false;
  const storedChecksum = manifest.manifestChecksum;
  const manifestCopy = { ...manifest, manifestChecksum: '' };
  const computed = sha256Buffer(Buffer.from(JSON.stringify(manifestCopy, null, 2)));
  return computed === storedChecksum;
}

/**
 * 验证备份完整性。
 * @param {string} backupPath - 备份路径
 * @returns {Promise<Object>} 验证结果
 */
export async function verifyBackup(backupPath) {
  info(`验证备份完整性: ${backupPath}`);

  if (!fs.existsSync(backupPath)) {
    return { valid: false, error: '备份路径不存在', path: backupPath };
  }

  const manifestPath = path.join(backupPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return { valid: false, error: '备份清单不存在', path: backupPath };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return { valid: false, error: `备份清单解析失败: ${err.message}`, path: backupPath };
  }

  // 验证清单完整性
  const manifestValid = verifyManifestIntegrity(manifest);
  if (!manifestValid) {
    return { valid: false, error: '备份清单校验和不匹配（可能被篡改）', path: backupPath };
  }

  info('备份清单完整性验证通过');

  // 验证密钥可用
  let key;
  try {
    key = getEncryptionKey();
  } catch (err) {
    return { valid: false, error: `无法获取加密密钥: ${err.message}`, path: backupPath };
  }

  // 验证每个文件
  const fileResults = [];
  let allFilesValid = true;

  for (const entry of manifest.files) {
    const encPath = path.join(backupPath, entry.file + '.enc');
    const result = { file: entry.file, valid: false, errors: [] };

    if (!fs.existsSync(encPath)) {
      result.errors.push('加密文件不存在');
      allFilesValid = false;
      fileResults.push(result);
      continue;
    }

    try {
      const encrypted = fs.readFileSync(encPath, 'utf-8');
      const decrypted = decrypt(encrypted, key);
      const checksum = sha256Buffer(decrypted);

      if (checksum !== entry.checksum) {
        result.errors.push(`校验和不匹配: 期望 ${entry.checksum}，实际 ${checksum}`);
        allFilesValid = false;
      } else {
        result.valid = true;
      }
    } catch (err) {
      result.errors.push(`解密/验证失败: ${err.message}`);
      allFilesValid = false;
    }

    fileResults.push(result);
  }

  const valid = manifestValid && allFilesValid;
  const summary = {
    valid,
    path: backupPath,
    backupId: manifest.backupId,
    mode: manifest.mode,
    createdAt: manifest.createdAt,
    totalFiles: manifest.files.length,
    validFiles: fileResults.filter(r => r.valid).length,
    invalidFiles: fileResults.filter(r => !r.valid).length,
    manifestValid,
    files: fileResults,
  };

  if (valid) {
    info(`备份完整性验证通过: ${summary.validFiles}/${summary.totalFiles} 文件有效`);
  } else {
    error(`备份完整性验证失败: ${summary.invalidFiles}/${summary.totalFiles} 文件无效`);
  }

  return summary;
}

/**
 * 从备份恢复数据。
 * @param {string} backupId - 备份 ID（或备份目录名）
 * @param {Object} [options]
 * @param {string} [options.backupDir] - 备份存储目录
 * @param {boolean} [options.dryRun] - 仅模拟恢复，不实际写入文件
 * @param {boolean} [options.skipVerify] - 跳过验证（默认 false）
 * @returns {Promise<Object>} 恢复结果
 */
export async function restoreBackup(backupId, options = {}) {
  const backupDir = options.backupDir || DEFAULT_BACKUP_DIR;
  const dryRun = options.dryRun || false;
  const skipVerify = options.skipVerify || false;

  info(`开始恢复备份: ${backupId}`, { dryRun, skipVerify });

  // 查找备份目录
  let backupPath;
  if (fs.existsSync(path.join(backupDir, backupId))) {
    backupPath = path.join(backupDir, backupId);
  } else {
    // 尝试通过 backupId 匹配
    const entries = fs.readdirSync(backupDir, { withFileTypes: true });
    const found = entries.find(e => e.isDirectory() && e.name.startsWith(backupId));
    if (!found) {
      throw new Error(`未找到备份: ${backupId}（在 ${backupDir} 中）`);
    }
    backupPath = path.join(backupDir, found.name);
  }

  info(`备份路径: ${backupPath}`);

  // 验证备份
  if (!skipVerify) {
    const verification = await verifyBackup(backupPath);
    if (!verification.valid) {
      throw new Error(`备份验证失败，中止恢复：${verification.error || '完整性检查未通过，请使用 --skipVerify 强制恢复'}`);
    }
    info('备份验证通过，继续恢复');
  } else {
    warn('跳过备份验证');
  }

  // 读取清单
  const manifest = JSON.parse(fs.readFileSync(path.join(backupPath, MANIFEST_FILE), 'utf-8'));
  const key = getEncryptionKey();
  const restored = [];
  const errors = [];

  for (const entry of manifest.files) {
    const encPath = path.join(backupPath, entry.file + '.enc');

    try {
      if (!fs.existsSync(encPath)) {
        errors.push({ file: entry.file, error: '加密文件不存在' });
        continue;
      }

      const encrypted = fs.readFileSync(encPath, 'utf-8');
      const decrypted = decrypt(encrypted, key);

      // 验证校验和
      const checksum = sha256Buffer(decrypted);
      if (checksum !== entry.checksum) {
        errors.push({ file: entry.file, error: `校验和不匹配（文件可能已损坏）` });
        continue;
      }

      if (!dryRun) {
        const targetPath = path.join(PROJECT_ROOT, entry.file);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, decrypted);
      }

      restored.push(entry.file);
      info(`  已恢复: ${entry.file}${dryRun ? ' (模拟)' : ''}`);
    } catch (err) {
      errors.push({ file: entry.file, error: err.message });
      error(`恢复失败: ${entry.file}`, err.message);
    }
  }

  const result = {
    backupId: manifest.backupId,
    backupPath,
    mode: manifest.mode,
    dryRun,
    restored: restored.length,
    errors: errors.length,
    fileList: restored,
    errorList: errors.length > 0 ? errors : undefined,
    status: errors.length > 0 ? (restored.length > 0 ? 'partial' : 'failed') : 'success',
  };

  info(`恢复完成: ${result.restored} 文件已恢复, ${result.errors} 错误`);
  return result;
}

/**
 * 清理旧备份，保留最近 N 份。
 * @param {number} maxBackups - 保留的最大备份数（默认 7）
 * @param {Object} [options]
 * @param {string} [options.backupDir] - 备份存储目录
 * @param {boolean} [options.silent] - 静默模式（不输出 INFO 日志）
 * @returns {Promise<Object>} 清理结果
 */
export async function cleanupOldBackups(maxBackups = DEFAULT_MAX_BACKUPS, options = {}) {
  const backupDir = options.backupDir || DEFAULT_BACKUP_DIR;
  const silent = options.silent || false;

  if (!silent) info(`清理旧备份，保留最近 ${maxBackups} 份`, { backupDir });

  if (!fs.existsSync(backupDir)) {
    if (!silent) info('备份目录不存在，无需清理');
    return { removed: 0, remaining: 0, backupDir };
  }

  const backups = listBackups(backupDir);

  if (backups.length <= maxBackups) {
    if (!silent) info(`当前备份数 (${backups.length}) 未超过限制 (${maxBackups})，无需清理`);
    return { removed: 0, remaining: backups.length, backupDir };
  }

  // 删除最旧的备份（列表已按时间降序排列，末尾为最旧）
  const toRemove = backups.slice(maxBackups);
  let removed = 0;

  for (const backup of toRemove) {
    try {
      fs.rmSync(backup.path, { recursive: true, force: true });
      removed++;
      if (!silent) info(`已删除旧备份: ${backup.backupId || backup.path}`);
    } catch (err) {
      warn(`删除备份失败: ${backup.path}`, err.message);
    }
  }

  if (!silent) info(`清理完成: 删除了 ${removed} 个旧备份，剩余 ${backups.length - removed} 个`);
  return { removed, remaining: backups.length - removed, backupDir };
}

// ──────────────── 命令行入口 ────────────────

// 当直接运行脚本时提供 CLI 支持
const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
);

if (isMain) {
  const args = process.argv.slice(2);
  const command = args[0] || 'backup';

  async function main() {
    try {
      switch (command) {
        case 'backup':
        case 'create': {
          const mode = args[1] || 'full';
          const result = await createBackup({ mode, verbose: true });
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case 'list': {
          const backupDir = args[1] || DEFAULT_BACKUP_DIR;
          const backups = listBackups(backupDir);
          console.log(JSON.stringify(backups, null, 2));
          break;
        }
        case 'restore': {
          const backupId = args[1];
          if (!backupId) throw new Error('请指定备份 ID');
          const dryRun = args.includes('--dry-run');
          const skipVerify = args.includes('--skip-verify');
          const result = await restoreBackup(backupId, { dryRun, skipVerify });
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case 'verify': {
          const backupPath = args[1];
          if (!backupPath) throw new Error('请指定备份路径');
          const result = await verifyBackup(backupPath);
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        case 'cleanup': {
          const maxBackups = parseInt(args[1], 10) || DEFAULT_MAX_BACKUPS;
          const result = await cleanupOldBackups(maxBackups);
          console.log(JSON.stringify(result, null, 2));
          break;
        }
        default:
          console.log(`
用法:
  node scripts/secure-backup.js <command> [options]

命令:
  backup [mode]     创建备份（mode: full|data-only|config-only，默认 full）
  list [dir]        列出所有备份
  restore <id>      恢复备份（--dry-run 模拟，--skip-verify 跳过验证）
  verify <path>     验证备份完整性
  cleanup [N]       清理旧备份（保留最近 N 份，默认 7）

环境变量:
  BACKUP_ENCRYPTION_KEY    AES-256-GCM 加密密钥（32字节 base64）
          `);
      }
    } catch (err) {
      error('命令执行失败', err.message);
      process.exit(1);
    }
  }

  main();
}