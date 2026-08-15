// ===== 上传文件内容校验器 =====
// 轻量防病毒/防伪装：通过魔数（magic bytes）+ 容器结构校验文件真实内容，
// 防止攻击者伪造扩展名/MIME 上传脚本、HTML、可执行内容，或构造 polyglot
// （视频魔数在前、恶意负载在后）文件绕过魔数校验。
// 生产环境如需更强防护，可叠加 clamscan 等病毒扫描器。

import fs from 'fs';
import path from 'path';

// 支持的视频魔数签名
const VIDEO_SIGNATURES = [
  // WebM / Matroska: 1A 45 DF A3
  { name: 'webm', magic: [0x1a, 0x45, 0xdf, 0xa3], ext: ['.webm', '.mkv'] },
  // MP4 family: 00 00 00 xx 66 74 79 70 (ftyp box)
  { name: 'mp4', magic: [0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70], ext: ['.mp4', '.m4v', '.mov'] },
];

// 明确禁止的伪装内容（即使带视频扩展名也拒绝）
const FORBIDDEN_SIGNATURES = [
  { name: 'html', magic: [0x3c, 0x21, 0x44, 0x4f] },       // <!DO
  { name: 'html', magic: [0x3c, 0x73, 0x63, 0x72] },       // <scr
  { name: 'html', magic: [0x3c, 0x68, 0x74, 0x6d] },       // <htm
  { name: 'svg', magic: [0x3c, 0x73, 0x76, 0x67] },        // <svg
  { name: 'gzip', magic: [0x1f, 0x8b] },                    // gzip 压缩可执行
  { name: 'elf', magic: [0x7f, 0x45, 0x4c, 0x46] },        // ELF 可执行
  { name: 'mz', magic: [0x4d, 0x5a] },                      // PE/Windows 可执行
];

// polyglot 注入探测：扫描文件首尾块，命中即拒绝。
// 这些字符串/字节即使出现在视频文件内部（如附加到尾部）也视为恶意。
const HOSTILE_MARKERS = [
  '<?php', '<script', '<html', '<svg', '<?xml', '<!DOCTYPE',
  '%PDF', 'PK\x03\x04', // zip (可能内含可执行)
];

// EBML DocType 白名单（WebM/Matroska 容器必须声明其一）
const WEBM_DOC_TYPES = ['webm', 'matroska'];

// MP4 ftyp 常见 major brand 白名单（前 4 字节 ASCII）
const MP4_BRANDS = [
  'isom', 'iso2', 'iso4', 'iso5', 'iso6',
  'mp41', 'mp42', 'avc1', 'M4V ', 'qt  ',
  'MSNV', 'dash', 'F4V ', 'heic', 'hevc',
  'hvc1', 'avif', '3gp4', '3gp5', 'M4A ',
];

// 扫描块大小：头部与尾部各读多少字节做 polyglot 探测
const SCAN_CHUNK = 4096;
// 容器头解析块大小（MP4 ftyp / WebM EBML 头）
const HEADER_CHUNK = 64;

function signatureMatches(magic, bytes) {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    const expected = magic[i];
    if (expected === null) continue; // 通配字节
    if (bytes[i] !== expected) return false;
  }
  return true;
}

function readBytes(fd, length, position) {
  const buf = Buffer.alloc(length);
  let bytesRead = 0;
  try {
    bytesRead = fs.readSync(fd, buf, 0, length, position);
  } catch (err) {
    return Buffer.alloc(0);
  }
  return buf.subarray(0, bytesRead);
}

function ascii(buf) {
  return buf.toString('latin1');
}

/**
 * 深度校验 MP4：解析 ftyp box 的 major brand。
 * 仅魔数命中还不够，需确认 ftyp 声明了合法品牌，且 box 尺寸合理。
 */
function validateMp4(fd) {
  const head = readBytes(fd, HEADER_CHUNK, 0);
  if (head.length < 16) return { ok: false, reason: 'MP4 文件头过短' };

  // box 尺寸（大端 4 字节）
  const boxSize = head.readUInt32BE(0);
  if (boxSize < 16 || boxSize > 1_048_576) {
    return { ok: false, reason: `MP4 ftyp box 尺寸异常 (${boxSize})` };
  }

  // major brand（ftyp 后的 4 字节）
  const brand = ascii(head.subarray(8, 12));
  if (!/^[\x20-\x7e]{4}$/.test(brand)) {
    return { ok: false, reason: 'MP4 major brand 非法' };
  }
  if (!MP4_BRANDS.includes(brand)) {
    return { ok: false, reason: `MP4 major brand 不在白名单 (${brand.trim() || brand})` };
  }
  return { ok: true, format: 'mp4' };
}

/**
 * 深度校验 WebM：确认 EBML 头包含 DocType "webm"/"matroska"。
 * 仅魔数命中还不够，需在头部解析出合法 DocType。
 */
function validateWebM(fd) {
  const head = readBytes(fd, HEADER_CHUNK, 0);
  if (head.length < 16) return { ok: false, reason: 'WebM 文件头过短' };

  const str = ascii(head);
  // matroska 的 DocType 常以 "matroska" / "webm" 字样出现在 EBML 头前 64 字节
  if (!WEBM_DOC_TYPES.some((t) => str.includes(t))) {
    return { ok: false, reason: 'WebM EBML 头缺少合法 DocType' };
  }
  return { ok: true, format: 'webm' };
}

/**
 * polyglot 探测：扫描文件首尾块，查找被附加/注入的脚本、HTML、可执行与压缩标记。
 * 攻击者常把恶意负载拼在合法视频魔数之后，必须检查尾部与分散片段。
 */
function scanHostileMarkers(fd, fileSize) {
  const head = readBytes(fd, SCAN_CHUNK, 0);
  const tailPos = Math.max(fileSize - SCAN_CHUNK, 0);
  const tail = readBytes(fd, SCAN_CHUNK, tailPos);

  const combined = Buffer.concat([head, tail]);
  const str = ascii(combined);

  // 文本脚本/文档标记（大小写不敏感）
  for (const marker of HOSTILE_MARKERS) {
    if (str.toLowerCase().includes(marker.toLowerCase())) {
      return { ok: false, reason: `检测到疑似注入内容: ${marker}` };
    }
  }

  // 可执行/压缩魔数（在非文件起始位置出现即异常）
  const bytes = Array.from(combined);
  const scanForbidden = [
    { name: 'gzip', magic: [0x1f, 0x8b] },
    { name: 'elf', magic: [0x7f, 0x45, 0x4c, 0x46] },
    { name: 'mz', magic: [0x4d, 0x5a] },
  ];
  for (const sig of scanForbidden) {
    for (let i = 0; i <= bytes.length - sig.magic.length; i++) {
      if (signatureMatches(sig.magic, bytes.slice(i))) {
        return { ok: false, reason: `检测到疑似 ${sig.name} 可执行内容` };
      }
    }
  }

  return { ok: true };
}

/**
 * 校验文件是否为合法视频内容（防伪装 + 防 polyglot）
 * @param {string} filePath - 已落盘的临时文件路径
 * @param {object} [opts]
 * @param {string} [opts.originalName] - 原始文件名（用于扩展名一致性校验）
 * @returns {{ok:boolean, format?:string, reason?:string}}
 */
export function validateVideoFile(filePath, opts = {}) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    if (stat.size < 16) {
      return { ok: false, reason: '文件过小，无法校验' };
    }

    const buf = readBytes(fd, 16, 0);
    const bytes = Array.from(buf);

    // 先命中禁止签名，直接拒绝
    for (const sig of FORBIDDEN_SIGNATURES) {
      if (signatureMatches(sig.magic, bytes)) {
        return { ok: false, reason: `文件内容为 ${sig.name}，已拒绝非视频内容` };
      }
    }

    // 判定视频类型并做深度结构校验
    const isMp4 = signatureMatches(
      VIDEO_SIGNATURES[1].magic,
      bytes
    );
    const isWebm = signatureMatches(
      VIDEO_SIGNATURES[0].magic,
      bytes
    );

    let matched = null;
    if (isMp4) matched = { name: 'mp4', ext: VIDEO_SIGNATURES[1].ext };
    else if (isWebm) matched = { name: 'webm', ext: VIDEO_SIGNATURES[0].ext };

    if (!matched) {
      return { ok: false, reason: '文件内容不是有效的视频格式' };
    }

    // 深度结构校验（拒绝仅魔数命中的 polyglot 空壳）
    const deep =
      matched.name === 'mp4' ? validateMp4(fd) : validateWebM(fd);
    if (!deep.ok) {
      return { ok: false, reason: deep.reason };
    }

    // polyglot 探测：首尾块扫描注入内容
    const scan = scanHostileMarkers(fd, stat.size);
    if (!scan.ok) {
      return { ok: false, reason: scan.reason };
    }

    // 扩展名一致性校验（弱校验：仅当原始名带扩展名时检查）
    if (opts.originalName) {
      const ext = (path.extname(opts.originalName) || '').toLowerCase();
      if (ext && !matched.ext.includes(ext)) {
        return { ok: false, reason: `扩展名 ${ext} 与实际视频格式 ${matched.name} 不一致` };
      }
    }

    return { ok: true, format: matched.name };
  } catch (err) {
    return { ok: false, reason: `文件校验异常: ${err.message}` };
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}