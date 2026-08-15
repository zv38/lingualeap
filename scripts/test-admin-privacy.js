import {
  protectIp,
  revealIp,
  maskIp,
  protectText,
  revealText,
  protectLoginRecord,
  maskLoginRecord,
  protectDeviceRecord,
  maskDeviceRecord,
} from '../api/security/privacy/adminPrivacyVault.js';

console.log('=== Admin Privacy Vault 单元测试 ===\n');

// 1. IP 加解密
const rawIp = '192.168.1.100';
const ipProtected = protectIp(rawIp);
console.log('原始 IP:', rawIp);
console.log('IP Hash:', ipProtected.hash);
console.log('IP 密文前缀:', ipProtected.encrypted.slice(0, 20) + '...');
const revealedIp = revealIp(ipProtected.encrypted);
console.log('解密后 IP:', revealedIp);
console.log('IP 脱敏:', maskIp(rawIp));
console.assert(revealedIp === rawIp, 'IP 加解密失败');
console.assert(maskIp(rawIp) === '192.168.x.x', 'IP 脱敏失败');
console.log('✅ IP 保护测试通过\n');

// 2. 文本加解密
const rawText = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const encryptedText = protectText(rawText, 'user-agent');
const revealedText = revealText(encryptedText);
console.assert(revealedText === rawText, '文本加解密失败');
console.log('✅ 文本保护测试通过\n');

// 3. 登录记录保护
const loginRecord = protectLoginRecord({
  id: 'login-123',
  timestamp: Date.now(),
  ip: '10.0.0.5',
  userAgent: rawText,
  deviceName: 'Chrome · Windows · 桌面端',
  fpHash: 'abc123',
  riskScore: 15,
  riskLevel: 'medium',
  success: true,
  reason: '',
});
console.log('登录记录加密后:', JSON.stringify(loginRecord, null, 2));
const maskedLogin = maskLoginRecord(loginRecord);
console.log('登录记录脱敏后:', JSON.stringify(maskedLogin, null, 2));
console.assert(maskedLogin.ip === '10.0.x.x', '登录记录 IP 脱敏失败');
console.assert(maskedLogin.deviceName === 'Chrome · Windows · 桌面端', '登录记录设备名解密失败');
console.log('✅ 登录记录保护测试通过\n');

// 4. 可信设备保护
const deviceRecord = protectDeviceRecord({
  fpHash: 'abc123',
  name: 'Chrome · Windows · 桌面端',
  ip: '172.16.0.1',
  userAgent: rawText,
  createdAt: Date.now(),
  lastSeenAt: Date.now(),
  trusted: true,
});
const maskedDevice = maskDeviceRecord(deviceRecord);
console.log('设备记录脱敏后:', JSON.stringify(maskedDevice, null, 2));
console.assert(maskedDevice.ip === '172.16.x.x', '设备 IP 脱敏失败');
console.assert(maskedDevice.name === 'Chrome · Windows · 桌面端', '设备名解密失败');
console.log('✅ 可信设备保护测试通过\n');

console.log('=== 所有隐私保护测试通过 ===');
