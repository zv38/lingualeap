FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
# 安全：显式复制源码与公共资源，绝不复制 .env/.env.local 等敏感文件
COPY api/ ./api/
COPY src/ ./src/
COPY electron/ ./electron/
COPY public/ ./public/
COPY index.html ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY tsconfig.json ./
COPY tsconfig.node.json ./
COPY vite.config.ts ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY --from=builder /app/package*.json ./
RUN npm ci --production --ignore-scripts
# 安全：生产容器内不存在任何 .env 文件，敏感配置通过环境变量/Secrets Manager 注入
EXPOSE 3001
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://localhost:3001/api/health || exit 1
CMD ["node", "api/index.js"]