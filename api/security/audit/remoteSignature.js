import crypto from 'crypto';

const WEBHOOK_URL = process.env.AUDIT_WEBHOOK_URL || process.env.WEBHOOK_URL || '';
const HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || '';
const BATCH_SIZE = Math.max(1, Number(process.env.AUDIT_BATCH_SIZE || 50));
const FLUSH_INTERVAL_MS = Math.max(5000, Number(process.env.AUDIT_FLUSH_INTERVAL_MS || 30000));

let batch = [];
let flushTimer = null;
let lastResult = null;

function signBatchRecords(records) {
  if (!HMAC_SECRET) return null;
  // 对批次内所有记录的 hash 做 HMAC-SHA256，确保批次内容不可抵赖。
  const payload = records
    .map((r) => r.hash || r.id)
    .filter(Boolean)
    .join('\n');
  return crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
}

async function dispatchBatch(records, signature) {
  const body = {
    timestamp: new Date().toISOString(),
    count: records.length,
    records: records.map((r) => ({
      id: r.id,
      hash: r.hash,
      previousHash: r.previousHash,
      timestamp: r.timestamp,
    })),
    signature,
    algorithm: 'HMAC-SHA256',
  };

  if (!WEBHOOK_URL) {
    console.log('[AuditRemoteSignature] 未配置 AUDIT_WEBHOOK_URL，模拟远程签名转发');
    return { ok: true, simulated: true, body };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Audit-Signature': signature || '',
        'X-Audit-Source': 'lingualeap-audit',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, response: text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function flushBatch() {
  if (batch.length === 0) return;
  const records = batch.splice(0, batch.length);
  const signature = signBatchRecords(records);
  lastResult = await dispatchBatch(records, signature);

  if (!lastResult.ok) {
    console.warn('[AuditRemoteSignature] 远程签名转发失败:', lastResult.error || lastResult.response);
  } else {
    console.log(`[AuditRemoteSignature] 已转发 ${records.length} 条审计记录，批次签名=${signature}`);
  }
}

/**
 * 将单条审计记录加入远程签名批次。
 * 达到批次阈值或定时器到期时自动触发签名与转发。
 */
export function appendToRemoteBatch(record) {
  batch.push(record);
  if (batch.length >= BATCH_SIZE) {
    flushBatch().catch(() => {});
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBatch().catch(() => {});
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * 立即刷新并发送当前批次。
 */
export async function flushRemoteSignature() {
  await flushBatch();
}

/**
 * 获取远程签名转发状态。
 */
export function getRemoteSignatureStatus() {
  return { pending: batch.length, lastResult };
}
