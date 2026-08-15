// ===== 性能调控模块导出 =====
export {
  throttledLog,
  registerResource,
  registerResources,
  startGovernor,
  stopGovernor,
  getGovernorSnapshot,
  getGovernorSummary,
  getGovernorStatus,
  forceCleanup,
} from './governor.js'