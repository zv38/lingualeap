import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'backup');
const OLD_KEY_FILE = path.join(PROJECT_ROOT, '.backup-key');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

function decrypt(encoded, key) {
  const parts = encoded.split(':');
  if (parts.length !== 3) throw new Error('加密数据格式无效');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ct = Buffer.from(parts[2], 'base64');
  const d = crypto.createDecipheriv(ALGORITHM, key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

function encrypt(data, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const c = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return `${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

function collectEncFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectEncFiles(full));
    else if (entry.name.endsWith('.enc')) files.push(full);
  }
  return files;
}

// 读取旧密钥（从环境变量或 .backup-key）
let oldKey;
if (process.env.BACKUP_OLD_KEY) {
  oldKey = Buffer.from(process.env.BACKUP_OLD_KEY, 'base64');
} else if (fs.existsSync(OLD_KEY_FILE)) {
  oldKey = Buffer.from(fs.readFileSync(OLD_KEY_FILE, 'utf-8').trim(), 'base64');
} else {
  console.error('未找到旧密钥：请配置 BACKUP_OLD_KEY 或保留 .backup-key');
  process.exit(1);
}

// 生成新密钥
const newKey = crypto.randomBytes(KEY_LENGTH).toString('base64');
const newKeyBuf = Buffer.from(newKey, 'base64');

const encFiles = collectEncFiles(BACKUP_DIR);
let ok = 0;
const failed = [];
for (const f of encFiles) {
  try {
    const enc = fs.readFileSync(f, 'utf-8');
    const plain = decrypt(enc, oldKey);
    fs.writeFileSync(f, encrypt(plain, newKeyBuf), 'utf-8');
    ok++;
    console.log(`✓ ${path.relative(BACKUP_DIR, f)}`);
  } catch (e) {
    failed.push(path.relative(BACKUP_DIR, f));
    console.error(`✗ ${path.relative(BACKUP_DIR, f)}: ${e.message}`);
  }
}

console.log(`\n重加密结果: ${ok}/${encFiles.length}`);

// 仅全部成功才删除明文密钥文件（保护旧备份可恢复性）
if (encFiles.length > 0 && failed.length === 0 && fs.existsSync(OLD_KEY_FILE)) {
  fs.unlinkSync(OLD_KEY_FILE);
  console.log('已删除明文密钥文件 .backup-key');
} else if (failed.length > 0) {
  console.error('存在失败文件，为保护数据恢复，未删除 .backup-key，请排查后重试');
  process.exit(1);
}

console.log('\n!!! 新密钥（请立即保存到系统密码库/环境变量，严禁落盘项目目录）!!!');
console.log(newKey);
console.log('\n设置环境变量: $env:BACKUP_ENCRYPTION_KEY="' + newKey + '"');