import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { verifyAuditChain } from './chainIntegrity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECURITY_DIR = path.resolve('.security');
export const CHAIN_FILE = process.env.AUDIT_CHAIN_FILE
  ? path.resolve(process.env.AUDIT_CHAIN_FILE)
  : path.join(SECURITY_DIR, 'audit-chain.log');

function ensureSecurityDir() {
  if (!fs.existsSync(SECURITY_DIR)) {
    fs.mkdirSync(SECURITY_DIR, { recursive: true, mode: 0o700 });
  }
}

function currentWindowsUserSid() {
  if (process.platform !== 'win32') return null;
  try {
    const output = execSync('whoami /user /fo csv /nh', { encoding: 'utf-8', timeout: 5000 });
    const parts = output.replace(/"/g, '').split(',');
    return parts[1]?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * 将文件权限设置为仅当前用户可读写。
 * Windows 使用 icacls 移除继承并仅授予当前用户 (M) 修改权限；
 * Linux/Mac 使用 chmod 600。
 */
export function lockFilePermissions(filePath) {
  try {
    if (process.platform === 'win32') {
      const sid = currentWindowsUserSid();
      const baseCmd = `icacls "${filePath}" /inheritance:r`;
      if (sid) {
        execSync(
          `${baseCmd} /grant:r *${sid}:(M) /remove "BUILTIN\\Users" "Everyone" "NT AUTHORITY\\Authenticated Users"`,
          { stdio: 'ignore', timeout: 10000 }
        );
      } else {
        execSync(
          `${baseCmd} /remove "Everyone" "BUILTIN\\Users" "NT AUTHORITY\\Authenticated Users"`,
          { stdio: 'ignore', timeout: 10000 }
        );
      }
    } else {
      fs.chmodSync(filePath, 0o600);
    }
  } catch (err) {
    console.warn('[AppendOnlyStore] 设置文件权限失败:', err.message);
  }
}

function ensureChainFile() {
  ensureSecurityDir();
  if (!fs.existsSync(CHAIN_FILE)) {
    fs.writeFileSync(CHAIN_FILE, '', { mode: 0o600 });
    lockFilePermissions(CHAIN_FILE);
  }
}

/**
 * 以只追加方式写入单条审计记录。
 * 不读取、不修改已有内容；文件不存在时自动创建并收紧权限。
 */
export function appendAuditRecord(record) {
  ensureChainFile();
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(CHAIN_FILE, line, { flag: 'a' });
  return CHAIN_FILE;
}

/**
 * 读取只追加审计链全部记录。
 */
export function readAuditChain() {
  if (!fs.existsSync(CHAIN_FILE)) return [];
  const content = fs.readFileSync(CHAIN_FILE, 'utf-8');
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * 验证本地只追加审计链完整性。
 */
export function verifyLocalAppendOnlyChain() {
  return verifyAuditChain(readAuditChain());
}

/**
 * 获取只追加存储文件路径。
 */
export function getAppendOnlyStorePath() {
  return CHAIN_FILE;
}
