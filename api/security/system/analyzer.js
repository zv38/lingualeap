export function analyzeEvents(events) {
  const stats = {
    total: events.length,
    byType: {},
    bySeverity: {},
    recentIps: {},
    topThreats: [],
  }

  events.forEach(e => {
    stats.byType[e.type] = (stats.byType[e.type] || 0) + 1
    stats.bySeverity[e.severity] = (stats.bySeverity[e.severity] || 0) + 1
    if (e.ip) {
      stats.recentIps[e.ip] = (stats.recentIps[e.ip] || 0) + 1
    }
  })

  stats.topThreats = Object.entries(stats.recentIps)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }))

  return stats
}
