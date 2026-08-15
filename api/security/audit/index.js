// ===== 军工级审计不可篡改模块统一导出 =====

// 链式哈希与完整性校验
export { verifyAuditChain, computeAuditHash, GENESIS_HASH } from './chainIntegrity.js';

// 远程 HMAC 签名转发
export {
  appendToRemoteBatch,
  flushRemoteSignature,
  getRemoteSignatureStatus,
} from './remoteSignature.js';

// 只追加存储与文件权限锁定
export {
  appendAuditRecord,
  readAuditChain,
  verifyLocalAppendOnlyChain,
  lockFilePermissions,
  getAppendOnlyStorePath,
  CHAIN_FILE,
} from './appendOnlyStore.js';
