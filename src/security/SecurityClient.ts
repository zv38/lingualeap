import type { SecurityConfig } from './types'
import { mergeConfig } from './rules/SecurityRules'
import { RequestInterceptor } from './interceptors/RequestInterceptor'
import { PrivacyGuard } from './guards/PrivacyGuard'
import { LeakScanner } from './scanners/LeakScanner'
import { XSSFilter } from './guards/XSSFilter'
import { AuditReporter } from './reporters/AuditReporter'
import { ConsoleGuard } from './guards/ConsoleGuard'
import { ErrorGuard } from './guards/ErrorGuard'
import { DevToolsGuard } from './guards/DevToolsGuard'

export class SecurityClient {
  private config: SecurityConfig
  private reporter: AuditReporter
  private interceptor: RequestInterceptor
  private privacy: PrivacyGuard
  private scanner: LeakScanner
  private xss: XSSFilter
  private consoleGuard: ConsoleGuard
  private errorGuard: ErrorGuard
  private devToolsGuard: DevToolsGuard
  private static instance: SecurityClient | null = null

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = mergeConfig(config)
    this.reporter = new AuditReporter(this.config)
    this.interceptor = new RequestInterceptor(this.config, e => this.reporter.report(e))
    this.privacy = new PrivacyGuard(this.config, e => this.reporter.report(e))
    this.scanner = new LeakScanner(this.config, e => this.reporter.report(e))
    this.xss = new XSSFilter(this.config, e => this.reporter.report(e))
    this.consoleGuard = new ConsoleGuard(this.config, e => this.reporter.report(e))
    this.errorGuard = new ErrorGuard(this.config, e => this.reporter.report(e))
    this.devToolsGuard = new DevToolsGuard(this.config, e => this.reporter.report(e))
  }

  static init(config: Partial<SecurityConfig> = {}): SecurityClient {
    if (!SecurityClient.instance) {
      SecurityClient.instance = new SecurityClient(config)
      SecurityClient.instance.start()
    }
    return SecurityClient.instance
  }

  static getInstance(): SecurityClient | null {
    return SecurityClient.instance
  }

  start() {
    if (!this.config.enabled) return
    // 越早启用越好：错误处理和控制台清理必须在其他初始化之前
    this.errorGuard.protect()
    this.consoleGuard.protect()
    this.reporter.start()
    this.interceptor.intercept()
    this.privacy.protect()
    this.xss.protect()
    this.devToolsGuard.protect()
    // 页面加载完成后扫描一次
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scanner.scan())
    } else {
      this.scanner.scan()
    }
  }

  stop() {
    this.reporter.stop()
  }
}
