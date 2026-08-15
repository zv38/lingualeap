import fs from 'fs';
import crypto from 'crypto';

// 链式审计的创世哈希；生产环境应通过 AUDIT_GENESIS_HASH 环境变量固定，
// 使整条链在首次部署时即被锚定，防止从头伪造。
export const GENESIS_HASH = process.env.AUDIT_GENESIS_HASH || '0'.repeat(64);

function canonicalizeRecord(record) {
  const { hash, ...rest } = record || {};
  const sortedKeys = Object.keys(rest).sort();
  const canonical = {};
  for (const key of sortedKeys) {
    canonical[key] = rest[key];
  }
  return JSON.stringify(canonical);
}

/**
 * 计算单条审计记录的链式哈希。
 * 结果依赖当前记录全部字段（除 hash 自身）以及前一条记录的 hash，
 * 任何字段或顺序被篡改都会导致哈希验证失败。
 */
export function computeAuditHash(record, previousHash) {
  const canonical = canonicalizeRecord({ ...record, previousHash });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function isNewestFirst(records) {
  if (records.length < 2) return false;
  const first = records[0]?.timestamp || '';
  const last = records[records.length - 1]?.timestamp || '';
  return first >= last;
}

/**
 * 验证审计链完整性。
 * @param {string|Array} source - 只追加日志文件路径（.json 或 .log）或记录数组
 * @returns {{valid: boolean, total: number, firstTamperedIndex: number, firstTamperedId: string|null, errors: string[]}}
 */
export function verifyAuditChain(source) {
  let records;
  if (typeof source === 'string') {
    const content = fs.readFileSync(source, 'utf-8');
    if (source.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(content);
      records = Array.isArray(parsed) ? parsed : [];
    } else {
      records = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
  } else if (Array.isArray(source)) {
    records = source;
  } else {
    throw new Error('verifyAuditChain 需要文件路径或记录数组');
  }

  // 兼容 audit-log.json（新记录在前）与只追加 .log（旧记录在前）两种存储顺序，
  // 统一按时间升序校验。
  const ordered = isNewestFirst(records) ? [...records].reverse() : records;

  const result = {
    valid: true,
    total: ordered.length,
    firstTamperedIndex: -1,
    firstTamperedId: null,
    errors: [],
  };

  for (let i = 0; i < ordered.length; i++) {
    const record = ordered[i];
    const expectedPreviousHash = i === 0 ? GENESIS_HASH : ordered[i - 1].hash;

    if (record.previousHash !== expectedPreviousHash) {
      result.valid = false;
      if (result.firstTamperedIndex === -1) {
        result.firstTamperedIndex = i;
        result.firstTamperedId = record.id || null;
      }
      result.errors.push(
        `记录 ${i} (${record.id || '?'}) previousHash 不匹配: 期望 ${expectedPreviousHash}，实际 ${record.previousHash}`
      );
    }

    const expectedHash = computeAuditHash(record, record.previousHash);
    if (record.hash !== expectedHash) {
      result.valid = false;
      if (result.firstTamperedIndex === -1) {
        result.firstTamperedIndex = i;
        result.firstTamperedId = record.id || null;
      }
      result.errors.push(
        `记录 ${i} (${record.id || '?'}) hash 不匹配: 期望 ${expectedHash}，实际 ${record.hash}`
      );
    }
  }

  return result;
}
