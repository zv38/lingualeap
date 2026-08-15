import { logAudit, getAuditLog, getAuditLogStats } from '../api/security/core/auditLogger.js';

console.log('=== AuditLogger 隐私加密测试 ===\n');

const rawIp = '203.0.113.88';

// 1. 记录审计日志
const record = logAudit({ userId: 'admin-1', action: 'admin_login', ip: rawIp, details: '测试登录', success: true });
console.log('审计记录:', JSON.stringify(record, null, 2));
console.assert(record.ip !== rawIp, '审计日志 IP 未脱敏');
console.assert(record.ip === '203.0.x.x', '审计日志 IP 脱敏格式错误');
console.assert(record.ipHash && record.ipHash.length > 0, '审计日志缺少 IP hash');
console.assert(record.ipEncrypted && record.ipEncrypted.startsWith('enc:v2:'), '审计日志缺少 IP 密文');
console.log('✅ 审计日志 IP 已脱敏并加密\n');

// 2. 查询审计日志（内存/SQLite）
const result = getAuditLog({ userId: 'admin-1', limit: 10 });
console.log('审计查询结果:', JSON.stringify(result.data[0], null, 2));
console.assert(result.data[0].ip !== rawIp, '审计查询返回明文 IP');
console.assert(result.data[0].ipHash === record.ipHash, '审计查询 IP hash 不一致');
console.log('✅ 审计查询返回脱敏数据\n');

console.log('=== AuditLogger 隐私加密测试通过 ===');
