import fs from 'fs/promises'
import path from 'path'

const ROOT_DIR = process.cwd()
const SECURITY_DIR = path.join(ROOT_DIR, '.security')
const SBOM_PATH = path.join(SECURITY_DIR, 'sbom.json')

function toSpdxId(name) {
  return `SPDXRef-${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
}

function parsePackageName(key) {
  const parts = key.split('node_modules/')
  const fullName = parts[parts.length - 1]
  return { fullName }
}

function purlFor(name, version) {
  const escaped = name.replace('/', '%2F')
  return `pkg:npm/${escaped}@${version}`
}

/**
 * 生成 SPDX/CycloneDX 风格的软件物料清单。
 * 读取 package.json 与 package-lock.json，输出 .security/sbom.json。
 */
export async function generateSbom(options = {}) {
  const rootDir = options.rootDir || ROOT_DIR
  const pkgPath = path.join(rootDir, 'package.json')
  const lockPath = path.join(rootDir, 'package-lock.json')
  const outputPath = options.outputPath || SBOM_PATH

  const [pkgRaw, lockRaw] = await Promise.all([
    fs.readFile(pkgPath, 'utf-8'),
    fs.readFile(lockPath, 'utf-8'),
  ])

  const pkg = JSON.parse(pkgRaw)
  const lock = JSON.parse(lockRaw)

  const packages = []
  const components = []

  const rootSpdxId = toSpdxId(pkg.name)
  packages.push({
    SPDXID: rootSpdxId,
    name: pkg.name,
    version: pkg.version,
    downloadLocation: pkg.repository?.url || 'NOASSERTION',
    filesAnalyzed: false,
    verificationCode: null,
    checksums: [],
    licenseConcluded: pkg.license || 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    externalRefs: [],
  })

  components.push({
    type: 'application',
    name: pkg.name,
    version: pkg.version,
    purl: purlFor(pkg.name, pkg.version),
    licenses: [{ license: { id: pkg.license || 'NOASSERTION' } }],
  })

  if (lock.packages) {
    for (const [key, info] of Object.entries(lock.packages)) {
      if (key === '') continue
      const { fullName } = parsePackageName(key)
      const spdxId = toSpdxId(fullName)
      const integrity = info.integrity || null
      const checksums = []
      if (integrity) {
        const [algo, hash] = integrity.split('-')
        if (algo && hash) {
          checksums.push({ algorithm: algo.toUpperCase(), checksumValue: hash })
        }
      }

      const tarballName = fullName.replace('/', '-')
      const downloadLocation =
        info.resolved || `https://registry.npmjs.org/${fullName}/-/${tarballName}-${info.version}.tgz`

      packages.push({
        SPDXID: spdxId,
        name: fullName,
        version: info.version,
        downloadLocation,
        filesAnalyzed: false,
        verificationCode: integrity,
        checksums,
        licenseConcluded: info.license || 'NOASSERTION',
        copyrightText: 'NOASSERTION',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: purlFor(fullName, info.version),
          },
        ],
      })

      components.push({
        type: 'library',
        name: fullName,
        version: info.version,
        purl: purlFor(fullName, info.version),
        hashes: checksums.map((c) => ({ alg: c.algorithm, content: c.checksumValue })),
        licenses: [{ license: { id: info.license || 'NOASSERTION' } }],
      })
    }
  }

  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${pkg.name}-sbom`,
    documentNamespace: `https://example.com/${pkg.name}/${pkg.version}/sbom-${Date.now()}`,
    creationInfo: {
      created: new Date().toISOString(),
      creators: ['Tool: supplychain-sbom-1.0.0'],
    },
    packages,
    relationships: packages.slice(1).map((p) => ({
      spdxElementId: 'SPDXRef-DOCUMENT',
      relatedSpdxElement: p.SPDXID,
      relationshipType: 'DESCRIBES',
    })),

    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: 'internal', name: 'supplychain-sbom', version: '1.0.0' }],
      component: {
        type: 'application',
        name: pkg.name,
        version: pkg.version,
        purl: purlFor(pkg.name, pkg.version),
      },
    },
    components,
    dependencies: lock.packages
      ? Object.entries(lock.packages)
          .filter(([k]) => k !== '')
          .map(([k, info]) => {
            const { fullName } = parsePackageName(k)
            return {
              ref: purlFor(fullName, info.version),
              dependsOn: Object.keys(info.dependencies || {}).map((dep) => `pkg:npm/${dep}`),
            }
          })
      : [],
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, JSON.stringify(sbom, null, 2), 'utf-8')

  return { path: outputPath, packageCount: packages.length }
}
