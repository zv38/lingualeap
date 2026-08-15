// 数据恢复脚本：将加密损坏的数据文件重置为空状态并重新加密
// 注意：此脚本仅在开发环境使用，用于修复因密钥轮换 bug 导致的数据损坏。
// 生产环境必须有备份恢复策略，严禁直接清空生产数据。

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeEncryptedFile, hasEncryptionKey } from '../api/security/privacy/fileVault.js';
import { loadFileEncryptionKeys } from '../api/security/vault/fileEncryptionKeyStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'api', 'data');

const RESET_FILES = {
  'users.json': [],
  'bug-reports.json': [],
  'notifications.json': [],
  'surveys.json': [],
  'survey-responses.json': [],
  'isolation-state.json': {},
};

async function main() {
  if (!process.env.FILE_ENCRYPTION_KEY && !process.env.FILE_ENCRYPTION_KEYS) {
    const keys = loadFileEncryptionKeys();
    if (keys) {
      process.env.FILE_ENCRYPTION_KEYS = JSON.stringify(keys);
      console.log('[Reset] 已从 DPAPI 保护文件加载 FILE_ENCRYPTION_KEYS');
    }
  }

  if (!hasEncryptionKey()) {
    console.error('[Reset] 错误：未配置 FILE_ENCRYPTION_KEY(S)，无法加密');
    process.exit(1);
  }

  for (const [filename, defaultValue] of Object.entries(RESET_FILES)) {
    const filePath = path.join(DATA_DIR, filename);
    const plaintext = JSON.stringify(defaultValue, null, 2);
    await writeEncryptedFile(filePath, plaintext, { context: `data:${filename}` });
    console.log(`[Reset] ${filename} 已重置并加密`);
  }

  console.log('[Reset] 完成');
}

main().catch(err => {
  console.error('[Reset] 失败:', err.message);
  process.exit(1);
});
