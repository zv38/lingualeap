export type SecurityEventType =
  | 'UNAUTHORIZED_API_ATTEMPT'
  | 'SENSITIVE_DATA_LEAK'
  | 'SOURCE_CODE_EXPOSED'
  | 'XSS_ATTEMPT'
  | 'ANOMALY_PATTERN'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface SecurityEvent {
  id: string
  type: SecurityEventType
  severity: Severity
  url: string
  details: Record<string, unknown>
  timestamp: number
  userAgent: string
  ip?: string
}

export interface SecurityConfig {
  enabled: boolean
  apiWhitelist: string[]
  sensitiveFields: string[]
  // 安全规范：header 黑名单由后端 WAF 维护，前端不应暴露具体名单，避免攻击者得知被拦截的字段
  blockedHeaders?: string[]
  leakPatterns: RegExp[]
  xssPatterns: RegExp[]
  reportEndpoint: string
  reportBatchSize: number
  reportIntervalMs: number
  reducedMotion: boolean
}

export interface ScanResult {
  type: SecurityEventType
  severity: Severity
  details: Record<string, unknown>
}
