import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * 生成本地开发用自签名 TLS 证书
 * 用法：node scripts/generate-local-ssl.mjs
 * 生成位置：.certs/localhost-key.pem, .certs/localhost-cert.pem
 */

const CERT_DIR = path.resolve('.certs');
const KEY_FILE = path.join(CERT_DIR, 'localhost-key.pem');
const CERT_FILE = path.join(CERT_DIR, 'localhost-cert.pem');

if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
  console.log('[SSL] 本地证书已存在，跳过生成');
  console.log(`  KEY:  ${KEY_FILE}`);
  console.log(`  CERT: ${CERT_FILE}`);
  process.exit(0);
}

try {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${KEY_FILE} -out ${CERT_FILE} -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
    { stdio: 'inherit' }
  );
  console.log('[SSL] 本地证书生成成功');
  console.log(`  KEY:  ${KEY_FILE}`);
  console.log(`  CERT: ${CERT_FILE}`);
  console.log('[SSL] 在 .env 中配置：');
  console.log('  HTTPS_KEY=.certs/localhost-key.pem');
  console.log('  HTTPS_CERT=.certs/localhost-cert.pem');
} catch (err) {
  console.error('[SSL] 生成证书失败，请确保已安装 OpenSSL:', err.message);
  process.exit(1);
}
