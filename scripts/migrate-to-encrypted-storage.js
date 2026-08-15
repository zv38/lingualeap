import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readEncryptedFile,
  writeEncryptedFile,
  hasEncryptionKey,
  isEncrypted,
  listKeyIds,
  decrypt,
} from '../api/security/privacy/fileVault.js';
import { loadFileEncryptionKeys } from '../api/security/vault/fileEncryptionKeyStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 注意：不加载项目目录下的 .env / .env.local，避免模板占位符覆盖真实密钥。
// 真实密钥应通过环境变量 FILE_ENCRYPTION_KEY 或 Windows DPAPI 保护文件注入。

const DATA_DIR = path.join(__dirname, '..', 'api', 'data');

// 全部数据文件迁移为加密存储
const FILES_TO_MIGRATE = [
  'users.json',
  'bug-reports.json',
  'notifications.json',
  'surveys.json',
  'survey-responses.json',
  'isolation-state.json',
];

async function migrateFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await fs.readFile(filePath, 'utf-8').catch(() => null);
    if (raw === null) {
      console.log(`[Migrate] ${filename} 不存在，跳过`);
      return;
    }

    if (raw.trim().length === 0) {
      console.log(`[Migrate] ${filename} 为空，跳过`);
      return;
    }

    if (!isEncrypted(raw)) {
      // 明文文件：直接加密为 v2
      await writeEncryptedFile(filePath, raw, { context: `data:${filename}` });
      console.log(`[Migrate] ${filename} 已从明文加密为 v2`);
      return;
    }

    // 已是加密格式
    if (raw.startsWith('enc:v2:')) {
      console.log(`[Migrate] ${filename} 已是 v2 加密格式，跳过`);
      return;
    }

    // v1 文件：先解密再重新加密为 v2
    const plaintext = decrypt(raw);
    await writeEncryptedFile(filePath, plaintext, { context: `data:${filename}` });
    console.log(`[Migrate] ${filename} 已从 v1 升级为 v2`);
  } catch (err) {
    console.error(`[Migrate] ${filename} 迁移失败:`, err.message);
    process.exitCode = 1;
  }
}

async function main() {
  // 优先从环境变量获取；未设置时尝试 Windows DPAPI 保护的多版本密钥文件
  if (!process.env.FILE_ENCRYPTION_KEY && !process.env.FILE_ENCRYPTION_KEYS) {
    try {
      const keys = loadFileEncryptionKeys();
      if (keys) {
        process.env.FILE_ENCRYPTION_KEYS = JSON.stringify(keys);
        console.log('[Migrate] 已从 DPAPI 保护文件加载 FILE_ENCRYPTION_KEYS');
      }
    } catch (err) {
      console.error('[Migrate] 尝试从 DPAPI 加载密钥失败:', err.message);
    }
  }

  if (!hasEncryptionKey()) {
    console.error('[Migrate] 错误：未配置 FILE_ENCRYPTION_KEY(S)，无法加密');
    console.error('[Migrate] 请通过环境变量注入，或在 Windows 下先运行 npm run security:protect-file-vault-key');
    process.exit(1);
  }

  const keyIds = listKeyIds();
  console.log(`[Migrate] 检测到加密密钥版本: ${keyIds.join(', ') || 'primary'}`);
  console.log(`[Migrate] 新写入数据将使用 primary 密钥（v2 Envelope）`);
  console.log('');

  for (const file of FILES_TO_MIGRATE) {
    await migrateFile(file);
  }

  console.log('');
  console.log('[Migrate] 完成');
}

main().catch(err => {
  console.error('[Migrate] 发生意外错误:', err.message);
  process.exit(1);
});
