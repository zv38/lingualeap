# LinguaLeap 会员制度 PRD

## 1. 概述

为 LinguaLeap 引入会员订阅体系，实现用户分层、变现收费与激励留存。支持三档会员等级与两种国内支付方式，本期不做自动续费。

## 2. 会员等级

| 等级 | 英文名 | 说明 |
|------|--------|------|
| 免费用户 | free | 注册默认等级 |
| 基础会员 | basic | 解锁核心进阶权益 |
| 高级会员 | pro | 解锁全部高级权益 |

## 3. 权益矩阵

| 权益 | 免费用户 | 基础会员 | 高级会员 |
|------|---------|---------|---------|
| 基础课程 | 全部开放 | 全部开放 | 全部开放 |
| 高级/考试课程 | 限制访问 | 开放 60% | 全部开放 |
| AI 客服每日次数 | 10 次/日 | 50 次/日 | 无限 |
| 每日挑战次数 | 1 次/日 | 3 次/日 | 无限 |
| 对战模式次数 | 3 次/日 | 10 次/日 | 无限 |
| 学习数据分析 | 基础报告 | 周报告 | 专属深度报告 |
| 离线下载 | 不支持 | 支持 5 个课程 | 无限制 |
| 语音评测高级模式 | 不支持 | 支持 | 支持 |
| 社区特权 | 普通标识 | 银色标识 | 金色标识 + 专属群组 |
| 广告/推广位 | 显示 | 减少 | 完全去除 |

## 4. 定价方案

### 基础会员
- 月卡：¥18/月
- 年卡：¥168/年（约 ¥14/月）
- 永久：¥298

### 高级会员
- 月卡：¥38/月
- 年卡：¥368/年（约 ¥30.6/月）
- 永久：¥598

> 首期不做免费试用和自动续费，未来可扩展。

## 5. 数据模型

### User 扩展字段
```ts
membership: 'free' | 'basic' | 'pro'
membershipExpiresAt: Date | null  // 月卡/年卡过期时间，永久为 null
membershipBoughtAt: Date | null
membershipType: 'monthly' | 'yearly' | 'lifetime' | null
```

### Subscription 表（订单/订阅记录）
```ts
id: string
userId: string
plan: 'basic' | 'pro'
period: 'monthly' | 'yearly' | 'lifetime'
amount: number  // 单位：分
currency: 'CNY'
paymentMethod: 'alipay' | 'wechat'
status: 'pending' | 'paid' | 'cancelled' | 'refunded'
outTradeNo: string  // 商户订单号
tradeNo: string | null  // 第三方支付单号
paidAt: Date | null
createdAt: Date
```

## 6. API 设计

### 6.1 获取会员信息
```
GET /api/membership
Headers: Authorization: Bearer <token>
Response:
{
  success: true,
  data: {
    membership: 'free' | 'basic' | 'pro',
    expiresAt: '2026-07-23T00:00:00Z' | null,
    type: 'monthly' | 'yearly' | 'lifetime' | null,
    privileges: { ... }
  }
}
```

### 6.2 创建订单
```
POST /api/membership/order
Body: { plan: 'basic' | 'pro', period: 'monthly' | 'yearly' | 'lifetime', paymentMethod: 'alipay' | 'wechat' }
Response:
{
  success: true,
  data: {
    orderId: string,
    outTradeNo: string,
    payUrl: string,  // 支付宝返回 form/二维码链接，微信返回 code_url
    amount: 1800
  }
}
```

### 6.3 支付回调
```
POST /api/membership/notify/alipay
POST /api/membership/notify/wechat
```

### 6.4 查询订单状态
```
GET /api/membership/order/:id
```

### 6.5 会员权益校验（内部/前端共用）
```
GET /api/membership/check?feature=course&courseId=xxx
```

## 7. 前端页面

### 7.1 会员中心 `/membership`
- 当前等级卡片（大背景渐变）
- 权益对比表格
- 价格卡片（基础/高级 × 月卡/年卡/永久）
- 支付方式选择（支付宝/微信）
- 购买记录入口

### 7.2 购买结果页 `/membership/result?orderId=xxx`
- 显示支付成功/失败
- 自动轮询订单状态
- 支付成功后升级会员并显示庆祝动画

### 7.3 订单记录 `/membership/orders`
- 历史购买记录列表

### 7.4 权益拦截弹窗
- 访问高级课程/功能时弹出
- 展示该功能需要会员等级
- 提供"立即升级"按钮

## 8. 安全与合规

- 所有订单创建/回调做签名验证
- 回调幂等处理（同一 outTradeNo 只处理一次）
- 金额后端校验，不可前端传入
- 支付配置从环境变量读取，不提交到版本控制
- 回调 URL 需可公网访问，本地开发使用内网穿透或沙箱环境
- 敏感日志脱敏（不输出完整 outTradeNo、用户 ID 等）

## 9. 实施计划

### Phase 1：数据层与基础 API
- 扩展 User 表
- 创建 Subscription 表
- 实现 `/api/membership`、`/api/membership/order`、权益检查接口

### Phase 2：会员中心页面
- 设计并实现 `/membership` 页面
- 价格卡片、权益对比、支付方式选择
- 响应式适配

### Phase 3：支付接入
- 接入支付宝（当面付/电脑网站支付）
- 接入微信支付（Native 支付或 JSAPI）
- 实现回调处理与订单状态同步

### Phase 4：权益拦截
- 课程访问控制
- AI 客服次数限制
- 每日挑战/对战次数限制
- 社区标识与特权

### Phase 5：测试与上线
- 沙箱支付测试
- 回调幂等测试
- 会员过期降级测试

## 10. 已确认事项

1. **支付环境**：先用支付宝/微信支付沙箱环境开发测试
2. **退款策略**：永久会员不支持退款；月卡/年卡未使用期限内可申请退款（后续补充）
3. **过期处理**：会员过期后立即降级为 free，所有高级权益和对应课程进度/访问权同步收回
4. **营销信息**：购买页显示限时优惠、原价对比、倒计时等促销元素，可做得较夸张
5. **社区标识**：会员标识在社区帖子/评论中展示（金色/银色徽章）

## 11. 营销元素设计

### 购买页促销组件
- 顶部大横幅："限时特惠 - 新用户首单立减 XX 元"
- 倒计时组件："优惠倒计时 23:59:59"（每日重置）
- 原价/现价对比：原价划线显示，现价高亮
- 热销标签："已有 12,847 人开通"
- 推荐标签：年卡卡片加"最受欢迎"角标
- 底部紧迫感文案："再不买就要恢复原价了"
- 弹窗挽留：用户关闭购买页或点击返回时弹出"再考虑一下，送你一张限时券"
