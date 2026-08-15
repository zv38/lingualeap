// ===== 军工级网络边界安全模块统一导出 =====
//
// 挂载示例（在 api/index.js 中按需使用，不修改主文件）：
//
// ------------------------------------------------------------------
// import https from 'https'
// import {
//   SECURE_TLS_OPTIONS,
//   createMtlsMiddleware,
//   CertificatePinset,
//   OutboundFilter,
// } from './security/network/index.js'
//
// // 1. 启动安全 TLS 服务端
// const server = https.createServer(
//   {
//     key: fs.readFileSync('.certs/server.key'),
//     cert: fs.readFileSync('.certs/server.crt'),
//     ca: fs.readFileSync('.certs/ca.crt'),
//     ...SECURE_TLS_OPTIONS,
//     requestCert: true,
//     rejectUnauthorized: false, // 细粒度校验交给 mTLS 中间件
//   },
//   app
// )
//
// // 2. 对管理员接口启用 mTLS
// app.use(
//   '/admin/api',
//   createMtlsMiddleware({
//     allowedFingerprints: process.env.ADMIN_CLIENT_CERT_FPS?.split(',') || [],
//     allowedIssuerCN: 'LinguaLeap-Admin-CA',
//     requireAuthorized: true,
//   })
// )
//
// // 3. 出站请求统一过滤（防 SSRF）
// const outbound = new OutboundFilter({
//   allowList: ['api.trusted-provider.com', '*.partner.io'],
//   denyList: ['*.internal.local'],
// })
// const safeFetch = outbound.wrapFetch(globalThis.fetch)
//
// // 4. 对外部 TLS 服务端做证书固定
// const pinset = new CertificatePinset({
//   pins: process.env.API_SERVER_PINS?.split(',') || [],
//   reportOnly: process.env.NODE_ENV !== 'production',
// })
// ------------------------------------------------------------------

export {
  TLS_1_3_CIPHERS,
  TLS_1_2_CIPHERS,
  SECURE_ECDH_CURVES,
  SECURE_TLS_OPTIONS,
  TLS_1_3_ONLY_OPTIONS,
  checkSecureProtocolRange,
  checkMinimumCipherSuites,
  createSecureTlsOptions,
  generateCertificateFingerprint,
} from './tlsConfig.js'

export {
  createMtlsMiddleware,
  getClientCert,
} from './mtlsMiddleware.js'

export {
  generatePin,
  generateHpkpPin,
  generatePinPair,
  verifyPin,
  CertificatePinset,
} from './certificatePinning.js'

export {
  OutboundFilter,
  createOutboundFilter,
} from './outboundFilter.js'
