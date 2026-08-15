let checkTimer: number | null = null;

function compareVersion(local: string, remote: string): number {
  const a = local.split('.').map(Number);
  const b = remote.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const na = a[i] || 0;
    const nb = b[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

async function getLocalVersion(): Promise<string> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    const data = await res.json();
    return data.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function getRemoteVersion(localVersion: string): Promise<{ version: string; forceUpdate: boolean; buildTime?: string; minClientVersion?: string } | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    const result = await res.json();
    if (result.success && result.data) {
      const remoteVersion = result.data.version || result.data.clientVersion || result.data.serverVersion;
      const minClientVersion = result.data.minClientVersion || remoteVersion;
      // API 兼容性检查：若本地版本低于服务端要求的最低客户端版本，则强制更新
      const belowMinimum = compareVersion(localVersion, minClientVersion) < 0;
      return {
        version: remoteVersion,
        forceUpdate: !!result.data.forceUpdate || belowMinimum,
        buildTime: result.data.buildTime,
        minClientVersion,
      };
    }
  } catch {
    // 网络错误时静默
  }
  return null;
}

type UpdateCallback = (info: { local: string; remote: string; forceUpdate: boolean }) => void;

let onUpdateCallback: UpdateCallback | null = null;

export function setOnUpdate(callback: UpdateCallback) {
  onUpdateCallback = callback;
}

export async function checkVersion() {
  const local = await getLocalVersion();
  const remoteInfo = await getRemoteVersion(local);
  if (!remoteInfo) return;
  const { version: remote, forceUpdate, buildTime } = remoteInfo;

  // 版本号不同 → 新版本发布
  // 或 buildTime 不同 → 服务器重启热更新
  const localBuildTime = await getLocalBuildTime();
  if (compareVersion(local, remote) < 0 || (localBuildTime && buildTime && localBuildTime !== buildTime)) {
    onUpdateCallback?.({ local, remote, forceUpdate });
  }
}

async function getLocalBuildTime(): Promise<string> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    const data = await res.json();
    return data.buildTime || '';
  } catch {
    return '';
  }
}

export function startVersionCheck(intervalMs = 5 * 60 * 1000) {
  checkVersion();
  if (checkTimer) window.clearInterval(checkTimer);
  checkTimer = window.setInterval(() => {
    checkVersion();
  }, intervalMs);
}

export function stopVersionCheck() {
  if (checkTimer) {
    window.clearInterval(checkTimer);
    checkTimer = null;
  }
}
