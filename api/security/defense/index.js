export { wafRulesMiddleware, getRules } from './wafRules.js'
export {
  tcpWafMiddleware,
  connectionTracker,
  getRealIP,
  ConnectionTracker,
} from './tcpWaf.js'
export { ActiveDefense, activeDefense } from './activeDefense.js'
export { adaptiveDefense } from './adaptiveDefense.js'
export { PromptGuard } from './promptGuard.js'
export { honeypotRouter, HONEYPOT_PATHS } from './honeypot.js'
export { ipReputation, dynamicHoneypot } from './dynamicHoneypot.js'
export { DECEPTION_TEMPLATES, pickTemplate } from './deceptionTemplates.js'
export { AppError, errorHandler, asyncHandler, createErrorFactory } from './errorHandler.js'
export { validateRequest, clearExpiredNonces, getNonceStats } from './requestReplay.js'
export {
  createCircuitBreaker,
  recordFailure,
  recordSuccess,
  getCircuitState,
  evaluateThresholdBlock,
  getCircuitBreakerStats,
} from './circuitBreaker.js'
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
} from './requestValidator.js'
export { evaluateSecurityEvent, getResponseStats, configureStrategies, resetStats } from './autoResponse.js'
export {
  bodyGuardMiddleware,
  connGuardMiddleware,
  rateGuardMiddleware,
  timeoutGuardMiddleware,
  bodyParserErrorHandler,
  getResourceShieldStatus,
  getResourceShieldSummary,
  cleanupResourceShield,
} from './resourceShield.js'
