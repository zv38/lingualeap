// ============================================================
// Runtime Security — 运行态安全模块统一导出
// 职责：
//   将反调试、内存保护、进程沙箱、运行态完整性等模块统一暴露，
//   供 runtimeGuard.js 或其他安全组件按需集成。
// ============================================================

export {
  detectAntiDebug,
  startAntiDebugMonitoring,
  stopAntiDebugMonitoring,
  setAntiDebugEnabled,
  getAntiDebugStatus,
} from './antiDebug.js'

export {
  ManagedSecureBuffer,
  createSecureBuffer,
  clearSensitiveBuffer,
  runMemoryCleanup,
  startMemoryCleanup,
  stopMemoryCleanup,
  getMemoryGuardStatus,
  scanMemoryForSecrets,
} from './memoryGuard.js'

export {
  createSandboxedProcess,
  terminateSandboxedProcess,
  getSandboxStatus,
  sanitizeEnv,
} from './processSandbox.js'

export {
  checkCriticalFiles,
  scanLoadedModules,
  scanMemoryStrings,
  checkRuntimeIntegrity,
  startRuntimeIntegrityMonitoring,
  stopRuntimeIntegrityMonitoring,
  getRuntimeIntegrityStatus,
} from './runtimeIntegrity.js'
