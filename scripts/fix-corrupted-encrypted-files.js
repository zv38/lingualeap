// 自动检测并修复无法解密的数据文件（开发环境恢复用）
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { readEncryptedFile, writeEncryptedFile, isEncrypted } from '../api/security/privacy/fileVault.js';
import { loadFileEncryptionKeys } from '../api/security/vault/fileEncryptionKeyStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'api', 'data');

const DEFAULTS = {
  'users.json': [],
  'surveys.json': [],
  'notifications.json': [],
  'bug-reports.json': [],
  'isolation-state.json': {},
};

async function main() {
  if (!process.env.FILE_ENCRYPTION_KEY && !process.env.FILE_ENCRYPTION_KEYS) {
    const keys = loadFileEncryptionKeys();
    if (keys) {
      process.env.FILE_ENCRYPTION_KEYS = JSON.stringify(keys);
      console.log('[Fix] 已加载 FILE_ENCRYPTION_KEYS');
    }
  }

  for (const [filename, defaultValue] of Object.entries(DEFAULTS)) {
    const filePath = path.join(DATA_DIR, filename);
    let corrupted = false;
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      if (isEncrypted(raw)) {
        try {
          const plaintext = await readEncryptedFile(filePath);
          JSON.parse(plaintext); // 验证是合法 JSON
          console.log(`[Fix] ${filename} 解密正常，跳过`);
        } catch (err) {
          console.log(`[Fix] ${filename} 无法解密: ${err.message}`);
          corrupted = true;
        }
      } else {
        console.log(`[Fix] ${filename} 为明文，无需修复`);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        corrupted = true;
        console.log(`[Fix] ${filename} 不存在，将创建`);
      } else {
        console.error(`[Fix] ${filename} 读取异常: ${err.message}`);
        corrupted = true;
      }
    }

    if (corrupted) {
      const plaintext = JSON.stringify(defaultValue, null, 2);
      await writeEncryptedFile(filePath, plaintext, { context: `data:${filename}` });
      console.log(`[Fix] ${filename} 已重置并加密`);
    }
  }

  console.log('[Fix] 完成');
}

main().catch(err => {
  console.error('[Fix] 失败:', err.message);
  process.exit(1);
});
