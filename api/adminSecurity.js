import crypto from 'crypto';

// 尝试加载 geoip-lite（兼容未安装的环境）
let geoip = null;
try {
  const geoipModule = await import('geoip-lite');
  geoip = geoipModule.default || geoipModule;
  console.log('[adminSecurity] geoip-lite 已加载，IP 地理位置功能已启用');
} catch {
  console.log('[adminSecurity] geoip-lite 未安装，IP 地理位置功能降级（仅识别本地/私有网络）');
}

const trustedDevices = new Map();
const adminLoginHistory = new Map();

function getGeoFromIP(ip) {
  // 本地回环地址
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') {
    return { country: 'LOCAL', city: 'localhost', latitude: 0, longitude: 0 };
  }
  // 私有网络地址
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || 
      (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31)) {
    return { country: 'PRIVATE', city: 'private_network', latitude: 0, longitude: 0 };
  }
  
  // 使用 geoip-lite 进行真实 IP 地理定位
  if (geoip) {
    const lookup = geoip.lookup(ip);
    if (lookup && lookup.country) {
      return {
        country: lookup.country,
        city: lookup.city || 'unknown',
        region: lookup.region || '',
        latitude: lookup.ll ? lookup.ll[0] : 0,
        longitude: lookup.ll ? lookup.ll[1] : 0,
        timezone: lookup.timezone || '',
      };
    }
  }
  
  return null; // 公网 IP 但无法定位
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function detectImpossibleTravel(adminId, currentGeo) {
  const history = adminLoginHistory.get(adminId);
  if (!history || history.length < 2) return { suspicious: false, score: 0 };
  const lastLogin = history[0];
  if (!lastLogin.geo || !lastLogin.geo.latitude) return { suspicious: false, score: 0 };
  const distance = haversineDistance(
    lastLogin.geo.latitude, lastLogin.geo.longitude,
    currentGeo.latitude, currentGeo.longitude
  );
  const timeDiffHours = (Date.now() - new Date(lastLogin.timestamp).getTime()) / (1000 * 60 * 60);
  if (timeDiffHours < 1) return { suspicious: false, score: 0 };
  const requiredHours = distance / 900;
  if (requiredHours > timeDiffHours) {
    return {
      suspicious: true,
      score: Math.min(25, Math.round((distance / 1000) * 5)),
      detail: `不可能旅行: ${Math.round(distance)}km，仅间隔${Math.round(timeDiffHours)}小时`
    };
  }
  return { suspicious: false, score: 0 };
}

function hashFingerprint(fingerprint) {
  return crypto.createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
}

function scoreDeviceFingerprint(adminId, fingerprint) {
  const known = trustedDevices.get(adminId);
  if (!known || known.length === 0) {
    return { score: 15, detail: '新设备，无可比记录' };
  }
  const currentHash = hashFingerprint(fingerprint);
  for (const device of known) {
    if (device.hash === currentHash) {
      return { score: 0, detail: '已知设备', deviceId: device.id };
    }
  }
  for (const device of known) {
    let matchCount = 0;
    let totalFields = 0;
    for (const [key, value] of Object.entries(fingerprint)) {
      if (key === 'fonts') continue;
      totalFields++;
      if (device.fingerprint?.[key] === value) matchCount++;
    }
    if (totalFields > 0 && matchCount / totalFields > 0.7) {
      return { score: 10, detail: `设备部分匹配 (${matchCount}/${totalFields})` };
    }
  }
  return { score: 20, detail: '全新设备' };
}

function detectProxyVPN(ip) {
  const dataCenterRanges = [
    '13.104.', '13.106.', '13.107.',
    '34.64.', '34.96.', '35.184.', '35.188.', '35.236.',
    '3.0.', '3.1.', '3.2.', '3.3.', '3.4.', '3.5.',
    '52.0.', '52.1.', '52.2.', '52.3.', '52.4.', '52.5.',
    '18.0.', '18.1.', '18.2.', '18.3.',
    '47.88.', '47.89.', '47.90.', '47.91.',
    '123.56.', '123.57.', '123.58.',
  ];
  return dataCenterRanges.some(range => ip.startsWith(range));
}

function scoreLoginTime(adminId) {
  const now = new Date();
  const hour = now.getHours();
  const history = adminLoginHistory.get(adminId);
  if (!history || history.length < 5) {
    if (hour >= 1 && hour <= 5) return { score: 15, detail: '凌晨时段登录，无历史记录' };
    return { score: 5, detail: '历史数据不足，基线未建立' };
  }
  const hourCounts = new Array(24).fill(0);
  for (const record of history) {
    const h = new Date(record.timestamp).getHours();
    hourCounts[h]++;
  }
  const totalLogins = history.length;
  const currentHourRatio = hourCounts[hour] / totalLogins;
  if (currentHourRatio < 0.05) {
    return { score: 12, detail: `非常用登录时段 (${hour}:00)` };
  }
  if (currentHourRatio < 0.1) {
    return { score: 5, detail: `低频率登录时段 (${hour}:00)` };
  }
  return { score: 0, detail: '常用登录时段' };
}

function evaluateRisk(adminId, { fingerprint, ip, timestamp }) {
  let totalScore = 0;
  const details = [];

  const deviceResult = scoreDeviceFingerprint(adminId, fingerprint);
  totalScore += deviceResult.score;
  details.push({ factor: 'device', score: deviceResult.score, detail: deviceResult.detail });

  const geo = getGeoFromIP(ip);
  if (geo) {
    const travelResult = detectImpossibleTravel(adminId, geo);
    if (travelResult.suspicious) {
      totalScore += travelResult.score;
      details.push({ factor: 'impossible_travel', score: travelResult.score, detail: travelResult.detail });
    }
  } else {
    totalScore += 10;
    details.push({ factor: 'geo', score: 10, detail: '无法确定IP地理位置' });
  }

  if (detectProxyVPN(ip)) {
    totalScore += 20;
    details.push({ factor: 'proxy_vpn', score: 20, detail: 'IP属于数据中心/云服务商' });
  }

  const timeResult = scoreLoginTime(adminId);
  totalScore += timeResult.score;
  details.push({ factor: 'login_time', score: timeResult.score, detail: timeResult.detail });

  const history = adminLoginHistory.get(adminId);
  if (history && history.length > 0) {
    const recent24h = history.filter(r => Date.now() - new Date(r.timestamp).getTime() < 24 * 60 * 60 * 1000);
    if (recent24h.length > 3) {
      totalScore += 10;
      details.push({ factor: 'frequency', score: 10, detail: `24小时内${recent24h.length}次登录` });
    }
  }

  return {
    score: Math.min(100, totalScore),
    level: totalScore <= 20 ? 'low' : totalScore <= 50 ? 'medium' : totalScore <= 75 ? 'high' : 'critical',
    details,
  };
}

function recordLogin(adminId, ip, fingerprint) {
  if (!adminLoginHistory.has(adminId)) adminLoginHistory.set(adminId, []);
  const history = adminLoginHistory.get(adminId);
  const geo = getGeoFromIP(ip);
  history.unshift({
    timestamp: new Date().toISOString(),
    ip,
    geo: geo || undefined,
    fingerprintHash: fingerprint ? hashFingerprint(fingerprint) : undefined,
  });
  if (history.length > 100) history.pop();
}

function registerTrustedDevice(adminId, fingerprint, deviceName) {
  if (!trustedDevices.has(adminId)) trustedDevices.set(adminId, []);
  const devices = trustedDevices.get(adminId);
  const device = {
    id: `dev-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    hash: hashFingerprint(fingerprint),
    fingerprint: fingerprint || {},
    name: deviceName || '未知设备',
    registeredAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
  };
  devices.push(device);
  if (devices.length > 10) devices.shift();
  return device;
}

function getTrustedDevices(adminId) {
  return trustedDevices.get(adminId) || [];
}

function removeTrustedDevice(adminId, deviceId) {
  const devices = trustedDevices.get(adminId);
  if (!devices) return false;
  const idx = devices.findIndex(d => d.id === deviceId);
  if (idx === -1) return false;
  devices.splice(idx, 1);
  return true;
}

export {
  evaluateRisk,
  recordLogin,
  registerTrustedDevice,
  getTrustedDevices,
  removeTrustedDevice,
  hashFingerprint,
};