// 账号风险强化版导出（从 accountRiskV3.js 导出，V2 旧版已清理）
export {
  ACCOUNT_STATUS,
  BAN_TYPE,
  evaluateRegistrationRisk,
  scoreToStatus,
  createUserRiskProfile,
  getRiskProfile,
  updateRiskStatus,
  accountStatusMiddleware,
  requireNormalAccount,
  generateRiskChallenge,
  verifyRiskChallenge,
  addMeritPoints,
  recordRiskEvent,
  getRiskEvents,
  getUnreadRiskEventCount,
  markRiskEventsRead,
  getSecurityOverview,
  executeBan,
  checkTempBanExpiry,
  getAccountStatusForUser,
  STATUS_WEIGHT,
  // V3 新增导出
  requirePoWChallenge,
  invalidateUserSessions,
  getUserLoginSummary,
  updateRiskFromBehavior,
  createBanApproval,
  reviewBanApproval,
  getPendingBanApprovals,
  getAllBanApprovals,
  // V4 新增导出
  getAdaptiveDifficulty,
  getLoginSecurityWarnings,
  notifyUserSecurityStatus,
  recordChallengeFailure,
  resetChallengeFailures,
} from './accountRiskV3.js'

export {
  canSubmitAppeal,
  submitAppeal,
  getAppealsByUser,
  getAppealById,
  getAllAppeals,
  reviewAppeal,
  APPEAL_STATUS,
} from './accountAppeal.js'

export {
  getCurrentPolicy,
  updatePolicy,
  recordAcceptance,
  getUserAcceptance,
  needsAcceptance,
} from './policyManager.js'