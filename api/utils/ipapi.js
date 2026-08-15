/**
 * ipapi.is — IP 风险检测工具
 * 免费额度：每天 1000 次请求，无需 API Key
 * 文档：https://ipapi.is/developers.html
 */

const API_BASE = 'https://api.ipapi.is'

/**
 * 查询 IP 风险信息
 * @param {string} ip - 要查询的 IP 地址
 * @returns {Promise<object|null>} - 风险信息对象，失败返回 null
 */
export async function getIPRisk(ip) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return null
  }

  try {
    const url = `${API_BASE}/?q=${encodeURIComponent(ip)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      console.warn(`[ipapi.is] HTTP ${response.status}: ${response.statusText}`)
      return null
    }

    const data = await response.json()

    // 提取风险相关字段
    return {
      is_datacenter: !!data.is_datacenter,
      is_vpn: !!data.is_vpn,
      is_proxy: !!data.is_proxy,
      is_tor: !!data.is_tor,
      is_abuser: !!data.is_abuser,
      is_education: !!data.is_education,
      // 地理位置
      country: data.country_code || null,
      city: data.city || null,
      // ASN 信息
      asn: data.asn ? {
        asn: data.asn.asn,
        org: data.asn.org,
        type: data.asn.type,
      } : null,
      // 公司信息
      company: data.company ? {
        name: data.company.name,
        abuser_score: data.company.abuser_score,
        is_abuser: data.company.is_abuser,
        is_vpn: data.company.is_vpn,
        is_proxy: data.company.is_proxy,
        is_datacenter: data.company.is_datacenter,
      } : null,
      // 风险评分（综合）
      risk_score: calculateRiskScore(data),
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.warn('[ipapi.is] 请求超时')
    } else {
      console.warn('[ipapi.is] 请求失败:', err.message)
    }
    return null
  }
}

/**
 * 根据 ipapi.is 返回数据计算综合风险评分（0-100）
 */
function calculateRiskScore(data) {
  let score = 0

  if (data.is_tor) score += 40
  if (data.is_vpn) score += 25
  if (data.is_proxy) score += 20
  if (data.is_abuser) score += 30
  if (data.is_datacenter) score += 15

  // 公司级别的风险加成
  if (data.company) {
    if (data.company.is_abuser) score += 10
    if (data.company.abuser_score > 0) {
      score += Math.min(data.company.abuser_score * 5, 15)
    }
  }

  return Math.min(score, 100)
}

/**
 * 生成风险评估因子列表（用于 accountRiskV3）
 */
export function getRiskFactors(ipRiskData) {
  if (!ipRiskData) return []

  const factors = []

  if (ipRiskData.is_tor) {
    factors.push({ id: 'IP_TOR', name: 'IP 为 Tor 出口节点', weight: 30, source: 'ipapi.is' })
  }
  if (ipRiskData.is_vpn) {
    factors.push({ id: 'IP_VPN', name: 'IP 为 VPN', weight: 20, source: 'ipapi.is' })
  }
  if (ipRiskData.is_proxy) {
    factors.push({ id: 'IP_PROXY', name: 'IP 为代理服务器', weight: 15, source: 'ipapi.is' })
  }
  if (ipRiskData.is_datacenter) {
    factors.push({ id: 'IP_DATACENTER', name: 'IP 为数据中心', weight: 10, source: 'ipapi.is' })
  }
  if (ipRiskData.is_abuser) {
    factors.push({ id: 'IP_ABUSER', name: 'IP 有恶意行为记录', weight: 25, source: 'ipapi.is' })
  }
  if (ipRiskData.is_education) {
    factors.push({ id: 'IP_EDUCATION', name: 'IP 为教育机构', weight: 3, source: 'ipapi.is' })
  }

  return factors
}