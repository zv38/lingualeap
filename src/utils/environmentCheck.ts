// 环境安全检查 — 已精简为无数据采集的安全桩
// 移除所有浏览器指纹采集、信号上报、自动化检测行为

export interface EnvironmentCheckResult {
  safe: boolean
  score: number
  reason: string
  details: { signal: string; verdict: string; weight: number }[]
}

export async function checkEnvironment(): Promise<EnvironmentCheckResult> {
  return {
    safe: true,
    score: 0,
    reason: '环境检查已禁用',
    details: [],
  }
}