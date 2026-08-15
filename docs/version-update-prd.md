# 版本更新与数据持久化 PRD

## 1. 目标

- 解决刷新页面后用户数据丢失、需要重新登录的问题
- 前端发版后主动提示用户刷新
- 后端支持版本管理和云端配置下发

## 2. 功能模块

### 2.1 后端数据持久化

- 将内存中的 `usersDB` 持久化到 `api/data/users.json`
- 启动时自动加载
- 用户注册、登录、会员变更、设置修改后自动保存
- 提供 `/api/data/refresh` 手动触发从磁盘重新加载（管理员用）

### 2.2 版本号体系

- 客户端版本：读取 `package.json` 的 `version`，构建时写入 `public/version.json`
- 服务端版本：后端 `api/config/version.js` 维护
- API：`GET /api/version` 返回
  ```json
  {
    "success": true,
    "data": {
      "serverVersion": "1.2.0",
      "clientVersion": "1.2.0",
      "minClientVersion": "1.1.0",
      "buildTime": "2026-06-23T10:00:00Z",
      "forceUpdate": false
    }
  }
  ```

### 2.3 客户端更新检测

- 应用启动时和定时每 5 分钟请求 `/api/version`
- 比较本地 `version.json` 与服务端 `clientVersion`
- 本地版本低于服务端时弹出"发现新版本"提示
- 提供"立即刷新"和"稍后"两个选项
- 如果 `forceUpdate` 为 true，屏蔽页面内容直到刷新

### 2.4 数据更新（手动刷新）

- 在设置页或关于页提供"刷新数据"按钮
- 调用 `/api/me` 重新拉取用户数据
- 刷新会员状态、课程进度、设置等

### 2.5 云端配置

- 后端 `api/config/app.json` 维护可下发配置
- API：`GET /api/config` 返回
  ```json
  {
    "success": true,
    "data": {
      "announcement": "",
      "membershipEnabled": true,
      "features": { ... }
    }
  }
  ```
- 前端启动时拉取并合并到 store

## 3. 实施计划

### Phase 1：后端用户数据持久化
- 创建 `api/persistence.js`
- 实现 `loadUsers()`, `saveUsers()`
- 在 `api/index.js` 启动时加载，变更时保存

### Phase 2：版本 API 与前端版本显示
- 后端 `/api/version`
- 构建脚本生成 `public/version.json`
- 设置页/关于页显示当前版本号

### Phase 3：客户端更新检测
- 创建 `src/utils/versionCheck.ts`
- 在 App.tsx 初始化时启动检测
- 创建 `VersionUpdatePrompt` 组件

### Phase 4：数据刷新按钮
- 在设置页添加"刷新数据"按钮
- 调用 `/api/me` 重新同步

### Phase 5：云端配置
- 后端 `/api/config`
- 前端启动时拉取

## 4. 待确认

1. 用户数据持久化用 JSON 文件还是 SQLite？（建议先用 JSON，简单可回滚）
2. 版本号手动维护还是自动从 git tag 生成？
3. 发现新版本后是弹窗提示还是顶部横幅？
