// 仅重置已损坏的加密数据文件（开发环境恢复用）
import path from 'path';
import { fileURLToPath } from 'url';
import { writeEncryptedFile } from '../api/security/privacy/fileVault.js';
import { loadFileEncryptionKeys } from '../api/security/vault/fileEncryptionKeyStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'api', 'data');

const RESET_FILES = {
  'users.json': [],
  'isolation-state.json': {},
};

async function main() {
  if (!process.env.FILE_ENCRYPTION_KEY && !process.env.FILE_ENCRYPTION_KEYS) {
    const keys = loadFileEncryptionKeys();
    if (keys) {
      process.env.FILE_ENCRYPTION_KEYS = JSON.stringify(keys);
      console.log('[ResetCorrupted] 已从 DPAPI 保护文件加载 FILE_ENCRYPTION_KEYS');
    }
  }

  for (const [filename, defaultValue] of Object.entries(RESET_FILES)) {
    const filePath = path.join(DATA_DIR, filename);
    const plaintext = JSON.stringify(defaultValue, null, 2);
    await writeEncryptedFile(filePath, plaintext, { context: `data:${filename}` });
    console.log(`[ResetCorrupted] ${filename} 已重置并加密`);
  }

  console.log('[ResetCorrupted] 完成');
}

main().catch(err => {
  console.error('[ResetCorrupted] 失败:', err.message);
  process.exit(1);
});
