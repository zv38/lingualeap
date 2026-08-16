# Contributing to LinguaLeap

感谢你愿意为 LinguaLeap 贡献！无论是修 bug、加功能、完善文档还是提建议，都非常欢迎。

## 开发环境

前置要求：Node.js 18+、npm。

```bash
# 1) 克隆并安装依赖
git clone git@github.com:zv38/lingualeap.git
cd lingualeap
npm install

# 2) 启动完整开发环境（前端 + 后端 API）
npm run dev:full
# 前端: http://localhost:3000
# 后端: http://localhost:3001

# 或者分别启动
npm run dev        # 仅前端 (Vite)
npm run dev:api    # 仅后端 API
```

## 常用命令

```bash
npm run lint              # ESLint 检查 (ts/tsx)
npm test                  # 运行测试 (vitest)
npm run test:frontend     # 仅前端测试
npm run test:backend      # 仅后端测试
npm run build             # 构建（含安全校验、SBOM、构建签名）
npm run security:all      # 供应链依赖校验 + 安全回归测试
```

## 代码规范

- **TypeScript** 严格模式；新增代码保持类型安全，避免 `any`。
- **React** 函数组件 + Hooks；状态管理使用 Zustand。
- 样式使用 **Tailwind CSS**，遵循现有视觉体系（Morandi 风格，见设计约定）。
- 提交前运行 `npm run lint`，确保无错误和警告。

## 安全约定（重要）

这是一个安全敏感项目，贡献时请严格遵守：

- **禁止提交任何密钥 / token / 证书 / `.env` 文件**。`.env*` 中的真实密钥只能通过平台环境变量注入。
- 生产构建会**禁用 source map**，不要把 `.map` 文件加入仓库。
- 前端不持久化用户角色，权限校验必须走后端 `/api/me` 等接口，不要相信前端状态。
- 新增 `/api/admin/*` 路由必须使用 `adminClientCertGate` 中间件（角色校验 + mTLS 客户端证书）。
- 错误响应使用通用文案，避免信息泄露；日志中的敏感字段由统一日志框架自动脱敏。
- 新增依赖前先确认其许可证与供应链安全（可运行 `npm run security:verify-deps`）。

## 提交信息规范

使用 Conventional Commits，用中文描述改动内容：

```
feat: 新增每日打卡功能
fix: 修复错题本导出乱码问题
perf: 优化课程列表加载性能
chore: 升级依赖并更新锁定文件
docs: 补充安全策略文档
```

## 分支与 PR 流程

1. 从最新的 `main` 创建你的分支：`git checkout -b feat/your-feature`
2. 完成修改并自测（`npm run lint` + `npm test`）
3. 推送分支并提交 Pull Request，在描述中说明改动动机与验证方式
4. 维护者 review 后合并；安全相关改动请通过安全报告渠道提交，详见 [SECURITY.md](./SECURITY.md)

## 行为准则

参与本项目的所有人需遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。
