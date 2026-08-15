// ===== 安全模块统一 barrel 导出 =====
// 注意：主入口直接从各子目录文件导入，不经过子目录 index.js，避免额外层带来的循环依赖问题。

// core: 审计、限流、请求追踪、CSRF/Blocklist 守卫
export { default as logger, installGlobalConsole, uninstallGlobalConsole, redact, readRuntimeLogs } from './core/logger.js'
export { logAudit, getAuditLog, getAuditLogStats, getClientIP } from './core/auditLogger.js'
export { createRateLimiter, createMemoryRateLimiter } from './core/rateLimiter.js'
export { requestTracker } from './core/requestTracker.js'
export { securityEventsRouter, pendingEvents } from './core/events.js'
export {
  SecurityLogger,
  BlockList,
  generateCsrfToken,
  validateCsrfToken,
  csrfTokenLimiter,
  securityMiddleware,
} from './core/guards.js'

// auth: 人机验证、Turnstile、管理员信任、身份守卫、Token 黑名单
export {
  createHumanChallenge,
  verifyHumanChallenge,
  humanVerificationMiddleware,
  getHumanVerificationStats,
} from './auth/humanVerification.js'
export {
  generateNumericCaptcha,
  generateMathCaptcha,
  generateAntiOcrNoise,
  generateRotateCaptcha,
  generateSequenceCaptcha,
  generateAudioCaptcha,
  verifyImageCaptcha,
  getImageCaptchaStats,
} from './auth/imageCaptcha.js'
export { verifyTurnstile, requireTurnstile } from './auth/turnstile.js'
export { default as AdminTrust } from './auth/adminTrust.js'
export { createAdminIdentityGuard } from './auth/adminIdentityGuard.js'
export {
  revokeToken,
  isTokenRevoked,
  getTokenRevokedAt,
  isTokenRevokedSync,
  cleanupExpiredTokens,
} from './auth/tokenBlacklist.js'
export {
  createAdminReauthSession,
  configureAdminReauth,
  verifyAdminReauth,
  validateAdminReauthToken,
  requireAdminReauth,
  requireFreshAdminReauth,
  revokeAdminReauthSessions,
  revokeAdminReauthBySession,
} from './auth/sharedAdminReauth.js'
export {
  createWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  createWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  getWebAuthnStatus,
  removeWebAuthnCredential,
  getWebAuthnConfig,
} from './auth/webauthn.js'
export {
  verifyAdminClientCertificate,
  requireAdminClientCertificate,
  hasAdminClientCertificate,
  registerAdminClientCertificate,
  revokeAdminClientCertificate,
  getAdminClientCertificates,
  fingerprintFromPemFile,
  isMtlsEnabled,
  isMtlsRequiredForAdmin,
} from './auth/mtlsAuth.js'

// defense: WAF、主动/自适应防御、Prompt 守卫、蜜罐、欺骗模板
export { wafRulesMiddleware, getRules } from './defense/wafRules.js'
export {
  tcpWafMiddleware,
  connectionTracker,
  getRealIP,
  ConnectionTracker,
} from './defense/tcpWaf.js'
export { ActiveDefense, activeDefense } from './defense/activeDefense.js'
export { adaptiveDefense } from './defense/adaptiveDefense.js'
export { PromptGuard } from './defense/promptGuard.js'
export { honeypotRouter, HONEYPOT_PATHS } from './defense/honeypot.js'
export { ipReputation, dynamicHoneypot } from './defense/dynamicHoneypot.js'
export { DECEPTION_TEMPLATES, pickTemplate } from './defense/deceptionTemplates.js'
export { AppError, errorHandler, asyncHandler, createErrorFactory } from './defense/errorHandler.js'
export { validateRequest, clearExpiredNonces, getNonceStats } from './defense/requestReplay.js'
export { signatureMiddleware, verifySignature, getSignatureStatus } from './defense/requestSignature.js'
export { evaluateSecurityEvent, getResponseStats, configureStrategies, resetStats } from './defense/autoResponse.js'
export {
  bodyGuardMiddleware,
  connGuardMiddleware,
  rateGuardMiddleware,
  timeoutGuardMiddleware,
  bodyParserErrorHandler,
  getResourceShieldStatus,
  getResourceShieldSummary,
  cleanupResourceShield,
} from './defense/resourceShield.js'
export {
  createCircuitBreaker,
  recordFailure,
  recordSuccess,
  getCircuitState,
  evaluateThresholdBlock,
  getCircuitBreakerStats,
} from './defense/circuitBreaker.js'
export {
  validate,
  validateByKey,
  validators,
  emailSchema,
  passwordSchema,
  usernameSchema,
  paginationSchema,
  registerSchema,
  loginSchema,
  adminLoginSchema,
  adminReauthSchema,
  createPostSchema,
  createCommentSchema,
  bugReportSchema,
  courseProgressSchema,
  surveyResponseSchema,
  adminUserStatusSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  aiChatSchema,
  createSurveySchema,
  broadcastSchema,
  appealSchema,
  exportDataSchema,
  securityBehaviorSchema,
  environmentCheckSchema,
} from './defense/requestValidator.js'

// account: 账号风险、申诉、政策管理（V3 强化版，从 account/index.js 统一导出）
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
} from './account/index.js'
export {
  canSubmitAppeal,
  submitAppeal,
  getAppealsByUser,
  getAppealById,
  getAllAppeals,
  reviewAppeal,
  APPEAL_STATUS,
} from './account/accountAppeal.js'
export {
  getCurrentPolicy,
  updatePolicy,
  recordAcceptance,
  getUserAcceptance,
  needsAcceptance,
} from './account/policyManager.js'

// privacy: 文件保险箱、文件守护、管理员隐私保险库
export {
  generateEncryptionKey,
  loadEncryptionKeys,
  getEncryptionKey,
  getPrimaryKeyId,
  hasEncryptionKey,
  listKeyIds,
  isEncrypted,
  encrypt,
  decrypt,
  readEncryptedFile,
  writeEncryptedFile,
  deriveKeyFromPassword,
  encryptWithPassword,
  decryptWithPassword,
  deriveUserDataKeyMaterial,
  clearKeyCache,
} from './privacy/fileVault.js'
export { buildBaseline, verifyIntegrity, rebuildBaseline } from './privacy/fileGuardian.js'
export {
  hasPrivacyKey,
  clearPrivacyKeyCache,
  protectIp,
  revealIp,
  maskIp,
  protectText,
  revealText,
  hashFingerprint,
  protectLoginRecord,
  protectDeviceRecord,
  maskLoginRecord,
  maskDeviceRecord,
} from './privacy/adminPrivacyVault.js'

// vault: 密钥轮换引擎与调度器
export { rotateFileEncryptionKeys, verifyEncryptionIntegrity, discoverEncryptedFiles } from './vault/keyRotationEngine.js'
export { startKeyRotationScheduler, stopKeyRotationScheduler, manualRotateKeys, getKeyRotationStatus } from './vault/keyRotationScheduler.js'

// isolation: 自动隔离、智能隔离、隔离通知器
export {
  ISOLATION_LEVELS,
  autoIsolation,
  AutoIsolationSystem,
  isolationMiddleware,
  hashTokenPrefix,
} from './isolation/autoIsolation.js'
export { DEFAULT_POLICIES, SmartIsolation } from './isolation/smartIsolation.js'
export { createIsolationNotifier } from './isolation/isolationNotifier.js'

// system: 启动校验、用户通知、安全后台路由、事件分析器
export {
  validateProductionConfig,
  validateDevelopmentConfig,
  runStartupSecurityChecks,
} from './system/startupValidator.js'
export {
  runtimeGuardMiddleware,
  getRuntimeSecurityStatus,
  getRuntimeGuardViolations,
} from './system/runtimeGuard.js'
export {
  SECURITY_NOTIFICATION_TYPES,
  createSecurityNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from './system/userNotifications.js';
export { createSecurityAdminRouter } from './system/admin-routes.js'
export { analyzeEvents } from './system/analyzer.js'

// vault: 军工级密钥保险库
export {
  loadSecret,
  loadSecretOrExit,
  protectSecret,
  listProtectedSecrets,
  removeProtectedSecret,
  secureZero,
  validateFilePermissions,
} from './vault/secretVault.js'
