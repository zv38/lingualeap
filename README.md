
# LinguaLeap - 多语种在线学习平台

一个现代化的多语种在线学习平台，提供英语、日语、韩语等语言的沉浸式学习体验。

## 功能特性

- 📚 **分级课程体系** - 从入门到高级，循序渐进的课程
- 🧠 **单词记忆** - 智能闪卡系统，高效记忆单词
- 📝 **语法练习** - 针对性的语法题目，巩固知识
- 🎤 **口语跟读** - 发音练习（当前为模拟版本）
- 🎧 **听力训练** - 真实场景对话，提升听力
- 📊 **学习进度** - 详细的学习数据和进度追踪
- 💬 **社区交流** - 与其他学习者分享心得
- 🏆 **成就系统** - 收集徽章，激励学习

## 技术栈

- **前端框架**: React 18 + TypeScript
- **路由管理**: React Router v6
- **状态管理**: Zustand
- **样式框架**: Tailwind CSS
- **图标库**: Lucide React
- **图表库**: Recharts
- **构建工具**: Vite

## 安装和运行

### 前置要求

- Node.js 18+ 
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 开发模式（完整版本，包含后端API）

**推荐：同时启动前端和后端**

```bash
npm run dev:full
```

或者，你可以分别启动它们：

**1. 启动后端API服务器（在第一个终端）：**

```bash
npm run dev:api
```

后端API将在 http://localhost:3001 运行。

你可以测试API是否正常工作：
```bash
curl http://localhost:3001/api/health
```

**2. 启动前端开发服务器（在第二个终端）：**

```bash
npm run dev
```

前端将在 http://localhost:3000 打开。

### 仅启动前端

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 可用的API接口

### 健康检查
- `GET /api/health` - 检查API是否正常运行

### 认证
- `POST /api/login` - 用户登录
- `POST /api/register` - 用户注册

### 课程
- `GET /api/courses` - 获取课程列表（支持 language 和 level 查询参数）
- `GET /api/courses/:id` - 获取课程详情
- `PUT /api/courses/:id/progress` - 更新课程进度

### 学习内容
- `GET /api/words` - 获取单词
- `GET /api/grammar` - 获取语法练习
- `GET /api/listening` - 获取听力练习

### 进度和成就
- `GET /api/progress` - 获取学习进度
- `GET /api/achievements` - 获取成就列表

### 社区
- `GET /api/posts` - 获取社区帖子
- `POST /api/posts` - 创建新帖子
- `POST /api/posts/:id/like` - 点赞帖子
- `POST /api/posts/:id/comments` - 添加评论

## 项目结构

```
.
├── src/
│   ├── components/       # 组件
│   │   └── Navbar.tsx   # 导航栏
│   ├── pages/           # 页面
│   │   ├── Home.tsx     # 首页
│   │   ├── Courses.tsx  # 课程中心
│   │   ├── WordLearn.tsx # 单词记忆
│   │   ├── Progress.tsx # 学习进度
│   │   ├── Community.tsx # 社区中心
│   │   └── Achievements.tsx # 成就系统
│   ├── store/           # 状态管理
│   │   └── useStore.ts
│   ├── data/            # 模拟数据
│   │   └── mockData.ts
│   ├── App.tsx          # 应用主组件
│   ├── main.tsx         # 应用入口
│   └── index.css        # 全局样式
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## 设计风格

- **主题色调**: 深蓝色 + 蓝绿色渐变
- **文字排版**: Orbitron（标题）+ Space Grotesk（正文）
- **界面风格**: 深色主题，现代化卡片设计
- **响应式**: 支持桌面、平板、移动设备

## 未来改进

- 集成真实的用户认证系统
- 添加更多语言和课程
- 实现真实的发音评测功能
- 添加数据库支持
- 集成支付功能

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。你可以自由地使用、修改、分发和商用本项目的代码，但需保留版权声明和许可声明。

## 第三方依赖许可合规

本项目通过 npm 管理第三方依赖，所有依赖均遵循其各自的许可证（以 MIT、Apache-2.0、BSD、ISC 等宽松许可证为主）：

- **供应链校验**：`npm run security:verify-deps` 校验依赖完整性与安全
- **软件物料清单（SBOM）**：`npm run security:sbom` 生成依赖清单
- 生产构建（`npm run build`）会自动执行上述安全校验

如果你的使用场景涉及 GPL 类 copyleft 依赖，请先与维护者确认合规性。
