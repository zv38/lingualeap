import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createBugReportRouter } from '../routes/bugReport.js'
import { validateVideoFile } from '../security/input/fileSanitizer.js'

/**
 * Phase 3 · 输入面补漏回归测试。
 * 覆盖：上传文件内容校验（魔数防伪装）与上传路由的鉴权/响应行为。
 */

let server
afterEach(() => {
  if (server) {
    server.close()
    server = null
  }
})

function makeTempFile(name, buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-test-'))
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

// 合法 WebM 头：EBML 魔数 + 含 DocType "webm" 的最小 EBML 头
const WEBM_VALID = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f,
  0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
  0x42, 0xf7, 0x81, 0x01, // EBMLReadVersion = 1
  0x42, 0xf2, 0x81, 0x04, // EBMLMaxIDLength = 4
  0x42, 0xf3, 0x81, 0x08, // EBMLMaxSizeLength = 8
  0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, // DocType size=4 "webm"
])
// 合法 MP4 头：ftyp box + major brand "isom"（24 字节，与 box 尺寸一致）
const MP4_VALID = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d, // major brand "isom"
  0x00, 0x00, 0x00, 0x00, // minor version
  0x69, 0x73, 0x6f, 0x6d, // compatible brand "isom"
  0x76, 0x69, 0x64, 0x65, // compatible brand "vide"
])

// ---- validateVideoFile 单元测试 ----
describe('fileSanitizer.validateVideoFile · 魔数 + 容器结构校验', () => {
  it('识别合法 WebM 文件（含 EBML DocType）', () => {
    const p = makeTempFile('a.webm', WEBM_VALID)
    expect(validateVideoFile(p, { originalName: 'a.webm' })).toEqual({ ok: true, format: 'webm' })
  })

  it('识别合法 MP4 文件（ftyp box + isom brand）', () => {
    const p = makeTempFile('a.mp4', MP4_VALID)
    expect(validateVideoFile(p, { originalName: 'a.mp4' })).toEqual({ ok: true, format: 'mp4' })
  })

  it('拒绝仅魔数命中、缺少合法结构的 WebM 空壳（polyglot 前半段）', () => {
    // 只有 1A 45 DF A3 魔数 + 垃圾字节，无 EBML DocType
    const p = makeTempFile('a.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
    expect(validateVideoFile(p, { originalName: 'a.webm' }).ok).toBe(false)
  })

  it('拒绝 MP4 major brand 不在白名单的文件', () => {
    // ftyp box 但 brand 为随机字节
    const p = makeTempFile('a.mp4', Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0xde, 0xad, 0xbe, 0xef]))
    expect(validateVideoFile(p, { originalName: 'a.mp4' }).ok).toBe(false)
  })

  it('拒绝 polyglot：合法 MP4 头 + 尾部注入 <script>', () => {
    const p = makeTempFile('a.mp4', Buffer.concat([MP4_VALID, Buffer.from('....<script>alert(1)</script>')]))
    expect(validateVideoFile(p, { originalName: 'a.mp4' }).ok).toBe(false)
  })

  it('拒绝 polyglot：合法 WebM 头 + 尾部注入 <?php', () => {
    const p = makeTempFile('a.webm', Buffer.concat([WEBM_VALID, Buffer.from('tail<?php system($_GET[c]);?>')]))
    expect(validateVideoFile(p, { originalName: 'a.webm' }).ok).toBe(false)
  })

  it('拒绝 polyglot：合法 MP4 头 + 尾部注入 PE 可执行段', () => {
    const p = makeTempFile('a.mp4', Buffer.concat([MP4_VALID, Buffer.from([0x00, 0x00, 0x00, 0x00, 0x4d, 0x5a, 0x90, 0x00])]))
    expect(validateVideoFile(p, { originalName: 'a.mp4' }).ok).toBe(false)
  })

  it('拒绝伪装成视频扩展名的 HTML 内容', () => {
    const p = makeTempFile('a.webm', Buffer.from([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45, 0x20, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x00, 0x00, 0x00]))
    expect(validateVideoFile(p, { originalName: 'a.webm' }).ok).toBe(false)
  })

  it('拒绝伪装成视频扩展名的 gzip/可执行内容', () => {
    const p = makeTempFile('a.mp4', Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))
    expect(validateVideoFile(p, { originalName: 'a.mp4' }).ok).toBe(false)
  })

  it('拒绝扩展名与实际格式不一致的文件', () => {
    // 内容为合法 WebM，扩展名却为 .mp4
    const p = makeTempFile('a.mp4', WEBM_VALID)
    expect(validateVideoFile(p, { originalName: 'a.mp4' }).ok).toBe(false)
  })

  it('拒绝过小文件', () => {
    const p = makeTempFile('a.webm', Buffer.from([0x1a]))
    expect(validateVideoFile(p, { originalName: 'a.webm' }).ok).toBe(false)
  })
})

// ---- 上传路由行为测试 ----
const noop = (req, res, next) => next()

function buildPropagatedUploadMock(file) {
  // 模拟 multer.single()：注入 req.file 构建临时文件后调用回调
  return {
    single(field) {
      return (req, res, next) => {
        req.file = file
        next()
      }
    },
  }
}

function buildBugApp({ uploadMock, file, usersDB = new Map() }) {
  const app = express()
  app.use(express.json())

  const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization'] || ''
    if (token.startsWith('Bearer ')) {
      req.tokenPayload = { userId: 'u-1', role: 'user' }
    }
    next()
  }

  app.use('/api', createBugReportRouter({
    express,
    authMiddleware,
    adminClientCertGate: (req, res, next) => next(),
    optionalAuthMiddleware: authMiddleware,
    bugReportLimiter: noop,
    usersDB,
    videoUpload: uploadMock,
    readEncryptedFile: null,
    writeEncryptedFile: null,
    DATA_DIR: os.tmpdir(),
    UPLOAD_DIR: os.tmpdir(),
    logAudit: () => {},
    getClientIP: () => '127.0.0.1',
    encrypt: null,
    decrypt: null,
    hasEncryptionKey: () => false,
  }))

  return app
}

async function postUpload(filePath, originalName) {
  const file = {
    path: filePath,
    originalname: originalName || path.basename(filePath),
    filename: 'bug-video-test.webm',
  }
  const app = buildBugApp({ uploadMock: buildPropagatedUploadMock(file) })
  const srv = createServer(app)
  await new Promise((resolve) => srv.listen(0, resolve))
  if (server) server.close()
  server = srv
  const port = server.address().port
  const res = await fetch(`http://127.0.0.1:${port}/api/bug-report/upload-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return { status: res.status, body: await res.json() }
}

describe('POST /api/bug-report/upload-video · 上传路由', () => {
  it('合法 WebM 上传成功，返回可访问 url', async () => {
    const filePath = makeTempFile('a.webm', WEBM_VALID)
    const { status, body } = await postUpload(filePath, 'a.webm')
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.url).toMatch(/^\/uploads\//)
  })

  it('伪装 HTML 内容被拒绝并返回 400', async () => {
    const filePath = makeTempFile('a.webm', Buffer.from([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59]))
    const { status, body } = await postUpload(filePath, 'a.webm')
    expect(status).toBe(400)
    expect(body.success).toBe(false)
  })
})