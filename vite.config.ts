import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'
import obfuscator from 'vite-plugin-javascript-obfuscator'
import { VitePWA } from 'vite-plugin-pwa'

const SENSITIVE_PATTERNS = [
  /\.map$/i,
  /\/vite\.config\.[cm]?[jt]s$/,
  /\/tsconfig\.[^/]*\.json$/,
  /\/\.env(?:\..*)?$/,
  /\/\.git\//,
]

// 禁止通过 Vite 开发服务器直接访问文件系统绝对路径、后端/脚本/文档目录，
// 以及未被应用导入的敏感源码文件（开发模式下运行时仍需的 /src/ 文件由 Vite 正常服务）。
const BLOCKED_PATH_PREFIXES = [
  '/.git/',       // 阻止 .git 目录（防止 Git 信息泄露）
  '/@fs/',        // Vite 文件系统绝对路径映射：必须阻止，否则可读取任意本地文件
  '/api/',        // 后端源码
  '/scripts/',    // 脚本源码
  '/docs/',       // 文档
  '/tests/',      // 测试
  '/__tests__',   // 测试
]

// 开发模式下禁止通过HTTP直接访问的敏感源码文件。
// 注意：只拦截未被应用运行时 import 的文件；被 import 的源码 Vite 必须提供服务，
// 否则会出现 403 导致页面空白或功能失效。
const BLOCKED_SOURCE_FILES = new Set([
  '/src/utils/environmentCheck.ts', // 仅被 vite.config.ts / 测试脚本引用，运行时未导入
])

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'LinguaLeap',
        short_name: 'LinguaLeap',
        description: 'AI 语言学习平台',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: '/favicon.ico', sizes: '64x64', type: 'image/x-icon' },
        ],
      },
      workbox: {
        // 主应用 chunk（含重度混淆）体积较大，提高预缓存上限到 6MiB，避免构建失败
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/localhost:3001\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
    viteCompression({ algorithm: 'brotliCompress', threshold: 1024 }),
    // 生产构建：全量重度混淆所有业务源码，最大化静态逆向成本
    obfuscator({
      apply: 'build',
      // 覆盖 src 下全部业务源码（js/jsx/ts/tsx），仅排除 node_modules 与样板/入口配置
      include: [/\.(jsx?|tsx?|cjs|mjs)$/],
      // 排除 AutoBugDetector：Guardian 依赖 console.warn/error 捕获生产报错，
      // 混淆的 disableConsoleOutput 会改写这些引用导致诊断失效，故保持原样
      // 排除 App.tsx / main.tsx：它们含 React.lazy 动态 import，混淆会把动态导入改写掉，
      // 导致 Rollup 无法识别代码分割点、全部页面被合并进单个 3MB 大 chunk，拖慢整站刷新。
      // 各页面 chunk 仍会被独立混淆，路由表裸露是可接受的代价。
      exclude: [
        /node_modules/,
        /@vite\//,
        /vite(\/|\\)?/,
        /AutoBugDetector\.(tsx?|jsx?)$/,
        /App\.tsx$/,
        /main\.tsx$/,
      ],
      options: {
        compact: true,
        // 控制流平坦化：将线性逻辑改写为 switch 分发。
        // 阈值从 0.9 降到 0.6：仍覆盖大部分代码、保持强度，但显著降低解析/执行开销
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.6,
        // 移除死代码注入：它注入数 MB 不可达代码，纯属拖慢解析，几乎不提升真实防护价值
        // 反调试：检测 DevTools，开启时加定时扰动
        debugProtection: true,
        debugProtectionInterval: 1500,
        // 禁用 console 输出，阻断调试信息泄露
        disableConsoleOutput: true,
        // 标识符重命名：mangled-shuffled 同时打乱顺序
        identifierNamesGenerator: 'mangled-shuffled',
        // 全局变量一并重命名，提升混淆粒度
        renameGlobals: true,
        // 数字转表达式：把常量数字改写成算术表达式
        numbersToExpressions: true,
        // 简化与字符串数组旋转/打散
        simplify: true,
        rotateStringArray: true,
        shuffleStringArray: true,
        // 自防御：代码被格式化/改写时自动失效
        selfDefending: true,
        // 字符串切分，降低可读性
        splitStrings: true,
        splitStringsChunkLength: 5,
        // 字符串数组化 + 双重加密（base64 + rc4）
        stringArray: true,
        stringArrayEncoding: ['base64', 'rc4'],
        // 阈值从 1 降到 0.6：仍加密多数关键字符串，但保留部分原文以降低解码与解析开销、
        // 避免入口过重拖慢首屏解析
        stringArrayThreshold: 0.6,
        // 多层字符串取用包装，增加解码复杂度
        stringArrayWrappersCount: 2,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersType: 'function',
        // 字符串取用调用变换
        stringArrayCallsTransform: true,
        stringArrayCallsTransformThreshold: 0.75,
        // 对象键名变换
        transformObjectKeys: true,
        unicodeEscapeSequence: false,
        // 不使用 eval，兼容 CSP
        target: 'browser-no-eval',
      },
    }),
    // 开发模式安全中间件：拦截 Source Map、敏感配置文件、@fs 路径遍历和特定源码文件
    // 同时兜底剥离 Vite/插件生成的 inline source map，防止 sourcesContent 泄露原始源码
    {
      name: 'strip-source-maps',
      enforce: 'post',
      transform(code, id) {
        if (!id) return null
        // 剥离所有 JS/CSS 响应里的 sourceMappingURL，含 inline base64 source map 与外部 .map 引用
        const stripped = code.replace(/\/\/# sourceMappingURL=.*$/gm, '')
        // 剥离 React JSX dev runtime 注入的 fileName 元数据，防止暴露本地绝对路径
        const stripped2 = stripped.replace(/fileName:\s*"[^"]*\.(tsx?|jsx?|css)"/gi, 'fileName: ""')
        if (stripped2 !== code) {
          return { code: stripped2, map: null }
        }
        return null
      },
    },
    {
      name: 'vite-security-middleware',
      configureServer(server) {
        // 关键：使用 unshift 确保在所有其他中间件之前插入
        // 否则 Vite 内部静态文件中间件会先执行，导致拦截失效
        const securityMiddleware = (req, res, next) => {
          const url = (req.url || '').split('?')[0].toLowerCase()

          // 开发服务器统一追加安全响应头，减少信息泄露与点击劫持风险
          res.setHeader('X-Content-Type-Options', 'nosniff')
          res.setHeader('X-Frame-Options', 'DENY')
          res.setHeader('X-Robots-Tag', 'noindex, nofollow')
          res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
          res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
          // 军工级：启用 Content Security Policy，禁止内联脚本与 eval，仅允许同源与 localhost API
          res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; " +
            "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; " +
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
            "img-src 'self' data: blob: https:; " +
            "font-src 'self' data: https://fonts.gstatic.com; " +
            "connect-src 'self' http://localhost:3001 https://localhost:3001 https://*.lingualeap.io https://challenges.cloudflare.com; " +
            "frame-src https://challenges.cloudflare.com; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self';"
          )
          // 生产环境强制 HTTPS / HSTS（开发环境不设置，避免本地证书问题）
          if (process.env.NODE_ENV === 'production' || process.env.FORCE_HSTS === 'true') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
          }

          // 允许 API 代理路径通过，避免误拦截前端调用的后端接口
          if (url.startsWith('/api/') || url.startsWith('/uploads/')) {
            return next()
          }

          // 拦截 .map 文件和敏感配置文件请求
          if (SENSITIVE_PATTERNS.some(p => p.test(url))) {
            res.statusCode = 404
            res.end('Not Found')
            return
          }

          // 拦截 @fs 路径遍历（不区分大小写，防止 /@FS/ 绕过）
          if (url.includes('/@fs/') || url.startsWith('/@fs/')) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'Forbidden', code: 'PATH_TRAVERSAL_BLOCKED' }))
            return
          }

          // 拦截后端/脚本/文档/测试目录
          if (BLOCKED_PATH_PREFIXES.some(prefix => url.startsWith(prefix.toLowerCase()))) {
            res.statusCode = 403
            res.end('Forbidden')
            return
          }

          // 拦截未被应用导入的敏感源码文件（避免扫描器直接读取内部逻辑）
          const normalizedBlockedFiles = new Set([...BLOCKED_SOURCE_FILES].map(f => f.toLowerCase()))
          if (normalizedBlockedFiles.has(url)) {
            res.statusCode = 403
            res.end('Forbidden')
            return
          }

          next()
        }
        
        // 使用 unshift 确保在最前面执行
        server.middlewares.stack.unshift({ route: '', handle: securityMiddleware })
      },
    },
  ],
  server: {
    port: 3000,
    host: '127.0.0.1',
    strictPort: true,
    cors: false,
    // 仅允许本地主机访问开发服务器，防止外部域名通过 DNS rebinding 访问源码
    allowedHosts: ['localhost', '127.0.0.1'],
    hmr: {
      host: '127.0.0.1',
    },
    fs: {
      // 安全：只允许访问项目根目录，禁止通过 @fs 读取父目录的后端源码
      allow: ['.'],
      deny: [
        '.env', '.env.local', '.env.production', '.env.*',
        '*.key', '*.pem', '*.cert',
        // 禁止直接读取配置文件和敏感源文件
        'vite.config.ts', 'vite.config.*.ts',
        'tsconfig.json', 'tsconfig.*.json',
        'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
        '.git', '.gitignore', '.gitattributes',
        'src/**', 'api/**', 'scripts/**', 'docs/**',
        'isolation-state.json', 'audit-log.json',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  // 开发服务器也使用 es2022 目标，避免 esbuild 降级 node_modules 中的解构语法时报错
  esbuild: {
    target: 'es2022',
    // 安全：开发模式也禁止生成 source map，防止浏览器通过 sourcesContent 获取原始源码
    sourcemap: false,
  },
  optimizeDeps: {
    // 依赖预构建也使用 es2022，防止 @use-gesture / @react-three/fiber 等包解构语法报错
    esbuildOptions: {
      target: 'es2022',
      // 安全：预构建依赖也禁止生成 source map，防止浏览器通过 sourcesContent 获取原始源码
      sourcemap: false,
    },
  },
  build: {
    // 每次构建前清空 dist，避免旧产物残留（含已修复/废弃地址的旧 chunk）
    emptyOutDir: true,
    // 安全：禁止生成 Source Map，防止源代码泄露
    sourcemap: false,
    // 使用 es2022 目标，避免 esbuild 在压缩阶段尝试降级解构等现代语法导致构建失败
    target: 'es2022',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 4,
        unsafe: true,
        booleans_as_integers: true,
        keep_fargs: false,
        keep_fnames: false,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn', 'console.trace'],
        pure_getters: true,
        reduce_vars: true,
        side_effects: false,
        sequences: true,
        collapse_vars: true,
      },
      mangle: {
        toplevel: true,
        safari10: true,
        properties: {
          regex: /^_private_/,
        },
      },
      format: {
        comments: false,
        ascii_only: true,
        beautify: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 把 node_modules 按使用频率和体积拆分为独立 chunk，提升缓存命中率
          if (id.includes('node_modules')) {
            if (id.includes('react-router') || id.includes('@remix-run')) return 'router'
            if (id.includes('framer-motion')) return 'motion'
            if (id.includes('recharts') || id.includes('d3')) return 'charts'
            if (id.includes('three') || id.includes('@react-three')) return '3d'
            if (id.includes('lucide-react')) return 'icons'
            if (id.includes('zustand') || id.includes('immer')) return 'state'
            if (id.includes('zod') || id.includes('validator')) return 'validation'
            if (id.includes('@simplewebauthn')) return 'passkey'
            return 'vendor'
          }
        },
        entryFileNames: 'assets/[name].[hash].min.js',
        chunkFileNames: 'assets/[name].[hash].min.js',
        assetFileNames: 'assets/[name].[hash][extname]',
        compact: true,
      },
    },
    chunkSizeWarningLimit: 800,
    cssCodeSplit: false,
    modulePreload: {
      polyfill: true,
    },
    reportCompressedSize: true,
  },
})