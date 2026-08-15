// ===== 军工级供应链安全模块统一导出 =====

// SBOM 生成：SPDX/CycloneDX 风格依赖清单
export { generateSbom } from './sbom.js'

// 依赖签名校验：npm audit + 本地漏洞模式 + 完整性校验
export { verifyDependencies } from './dependencyVerifier.js'

// 构建签名：dist 目录哈希树 + HMAC-SHA256 签名
export { signBuild } from './buildSigner.js'

// 签名存储与运行时校验
export { loadSignature, saveSignature, verifyBuildIntegrity } from './signatureStore.js'
