# 系统全面升级计划

> 本文档已与代码现状对齐（2026-08 复核）。已完成的项标记 ✅，未完成的标记 ⬜。
> 排除纯用户体验模块（离线模式、推送、深色模式、搜索、文件上传、视频通话、协作、学习路径）。

## 阶段一：架构重构（P0）
- [x] 拆分 api/index.js 为独立路由模块（✅ 已拆出 routes/: auth/admin/ai/content/events/surveys/bugReport/security + membership）
- [x] 添加 Vitest 测试框架 + 首批测试（✅ vite.config + api/vitest.config + api/__tests__）
- [x] 配置 GitHub Actions CI/CD（✅ .github/workflows/ci.yml）
- [x] 引入 Sentry 错误监控（✅ @sentry/node + @sentry/react + @sentry/vite-plugin + lib/sentry.js）

## 阶段二：代码质量（P1）
- [x] 修复空 catch 块（✅ 已清理大部分）
- [x] 清理 console.log（✅ 生产构建 terser drop_console）
- [ ] 抽取硬编码值为配置项（⬜ 部分完成，仍有散落硬编码）
- [x] 清理注释掉的垃圾代码（✅ 已清理）
- [x] 统一 CSS 风格（✅ 已用 CSS 变量 + Tailwind，仍有部分页面混用直写色值）
- [ ] 抽象重复代码（⬜ UI 组件已抽 ui/ 库，但页面级重复逻辑仍较多）
- [x] 补充 loading 状态 + 空状态（✅ EmptyState/Skeleton/SuspenseFallback/InlineLoading）

## 阶段三：前端工程化（P2）
- [ ] 升级 React 19（⬜ 当前为 React 18.2，未升级）
- [x] PWA 支持（✅ vite-plugin-pwa + manifest + sw.js + offline.html）
- [x] 添加 ErrorBoundary 覆盖所有页面（✅ ErrorBoundary 已包裹全部路由）
- [ ] 减少 `any` 类型使用（⬜ 仍有较多 any，需逐步收紧）
- [x] 添加基础分析系统（✅ utils/performanceMonitor + learning-stats）

## 阶段四：数据库（P3）
- [ ] 数据库迁移系统（⬜ 有 schema.js 但无版本化迁移）
- [x] 自动备份策略（✅ scripts/backup-db.js + secure-backup.js）
- [ ] 数据归档机制（⬜ 未实现）

## 阶段五：DevOps（P3）
- [x] Docker 化（✅ Dockerfile + .dockerignore + render.yaml）
- [ ] 日志聚合（⬜ 使用自研性能调控器/审计日志，未接入 winston/pino）
- [ ] 性能监控（⬜ 有 performanceMonitor 前端监控，后端缺指标聚合）
- [x] 健康检查增强（✅ /api/health + 管理服务监控页）

---

## 现状快照（2026-08 新增，反映真实规模）

### 前端
- 页面：约 50 个（pages/），含学习/进度/社区社交/AI/安全隐私/管理后台/杂志首页
- 组件：70+（components/），含 Magazine 系列、安全组件、动效库、UI 基础库
- 基础设施：呼吸背景、自定义光标、粒子特效、性能监控、会话录制、自动 Bug 检测、全局处理遮罩、版本更新提示

### 后端
- 路由：auth/admin/ai/content/events/surveys/bugReport/security/membership
- 服务：emailService、geoLookup、youdao 翻译、Redis(降级内存)、SQLite、Sentry
- 安全系统：20+ 模块（TCP-WAF/RuntimeGuard/验证码/CSRF/IP评分/蜜罐/资源护盾/性能调控器/审计/供应链等）

### 已知技术债（新增，建议纳入后续计划）
1. **arch.md 描述过时**：仍写 "localStorage/内存演示"，实际已是 SQLite+Redis+完整安全系统
2. **后端 index.js 仍单文件巨大**：虽已拆路由，仍有大量内联中间件/初始化逻辑
3. **日志聚合缺失**：自研日志无统一查询/聚合
4. **React 18 → 19**：升级收益（并发/服务端组件）待评估
5. **文档维护**：prod 构建已启用全量重度混淆，需同步更新部署文档