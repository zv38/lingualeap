import AdminTrust from '../api/security/auth/adminTrust.js';

console.log('=== AdminTrust 隐私加密集成测试 ===\n');

const adminTrust = new AdminTrust({ dataDir: 'data/test-admin-trust' });

const userId = 'admin-test-user';
const fingerprint = { ua: 'test-ua', screen: '1920x1080' };
const ip = '203.0.113.45';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// 1. 注册可信设备
await adminTrust.registerTrustedDevice(userId, fingerprint, { ip, userAgent, name: '测试设备' });
console.log('✅ 可信设备已注册');

// 2. 查询设备列表（应返回脱敏数据）
const devices = await adminTrust.getDeviceList(userId);
console.log('设备列表（脱敏）:', JSON.stringify(devices, null, 2));
console.assert(devices.length === 1, '设备数量不对');
console.assert(devices[0].ip === '203.0.x.x', '设备 IP 脱敏失败');
console.assert(devices[0].name === '测试设备', '设备名解密失败');
console.log('✅ 设备列表脱敏正确\n');

// 3. 记录登录历史
await adminTrust.recordLogin(userId, { ip, fingerprint, userAgent, riskScore: 10, riskLevel: 'low', success: true });
await adminTrust.recordLogin(userId, { ip: '198.51.100.22', fingerprint, userAgent, riskScore: 60, riskLevel: 'high_risk', success: true });
console.log('✅ 登录历史已记录');

// 4. 查询登录历史（应返回脱敏数据）
const history = await adminTrust.getLoginHistory(userId, { limit: 10 });
console.log('登录历史（脱敏）:', JSON.stringify(history, null, 2));
console.assert(history.length === 2, '登录历史数量不对');
console.assert(history[0].ip === '198.51.x.x', '登录历史 IP 脱敏失败');
console.assert(history[1].ip === '203.0.x.x', '登录历史 IP 脱敏失败');
console.log('✅ 登录历史脱敏正确\n');

// 5. 查询风险事件
const events = await adminTrust.getRiskEvents(userId, { limit: 10 });
console.log('风险事件（脱敏）:', JSON.stringify(events, null, 2));
console.assert(events.length === 1, '风险事件数量不对');
console.assert(events[0].ip === '198.51.x.x', '风险事件 IP 脱敏失败');
console.log('✅ 风险事件脱敏正确\n');

// 6. 持久化文件验证：里面不应有明文 IP
await adminTrust._forceSave();
import fs from 'fs';
const historyFile = 'data/test-admin-trust/admin-login-history.json';
const historyRaw = fs.readFileSync(historyFile, 'utf-8');
console.assert(!historyRaw.includes(ip), '持久化文件中存在明文 IP！');
console.assert(!historyRaw.includes(userAgent), '持久化文件中存在明文 User-Agent！');
console.log('✅ 持久化文件中未发现明文敏感信息\n');

console.log('=== AdminTrust 隐私加密集成测试通过 ===');
