## 美团本地短时活动规划 & 执行 Agent

基于 Next.js (App Router) + TypeScript + Mastra + Assistant UI 的本地化场景：用户给一句话目标（"今天下午想和老婆孩子出去玩 4-6 小时，别离家太远"），Agent 会规划完整下午行程，并通过一键多笔执行下单、预约餐位、送花/蛋糕到店、打车等动作。

核心组件：

- 规划 Agent（`mastra/agents/planning-agent.ts`）：解析需求 → POI 搜索 → 餐位检查 → 路线/天气 → 一键多笔预算
- 执行 Agent（`mastra/agents/execution-agent.ts`）：按用户审批一键完成预约/送达/打车/支付
- 共享子代理（`mastra/agents/planning-subworker-agent.ts`）：处理子任务
- Assistant UI 前端（`app/page.tsx`、`components/chat/*`）：含通知中心、家位置选择、我下过的单、计划版本回滚、share 反馈

### Quick Start

```bash
npm install
cp .env.example .env.local
# 在 .env.local 写入 GLM_API_KEY（默认 glm-4.5-air；也可切换到 Gemini / DeepSeek）
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

**可选：改用 GLM-4.5-Air 作为对话模型**：在 `.env.local` 里设置 `GLM_API_KEY`（或 `ZHIPUAI_API_KEY`）；默认会自动优先使用 `glm-4.5-air`，也可显式写 `AGENT_PROVIDER=glm` 和 `GLM_MODEL=glm-4.5-air`。详见 `.env.example`。

**可选：改用 DeepSeek 作为对话模型**（与 Gemini / GLM 二选一，三 Agent 共用）：在 `.env.local` 里设置 `AGENT_PROVIDER=deepseek` 与 `DEEPSEEK_API_KEY`；不配 key 或未设 `deepseek` 时仍会回退到默认模型。详见 `.env.example`。

### 三种 Demo 模式

#### 1. CLI 离线 Demo（无需 API key、跑全套 mock 工具）

```bash
npm run demo:family    # 家庭场景（老婆 + 5 岁娃）
npm run demo:friends   # 朋友场景（4 人）
```

CLI 会按真实工具调用顺序串起规划 → 一键多笔，落库到 `.data/` 下：

- `.data/saved-plans.json`：方案 + 历史快照
- `.data/transactions.json`：mock 订单流水
- `.data/notifications.json`：行前/分享提醒

#### 2. Web UI 离线 Demo（MOCK_AGENT=1，不调真模型）

```bash
MOCK_AGENT=1 npm run dev
```

聊天 API 会返回固定文案。前端的"我的方案 / share / 通知 / 我下过的单 / geolocation"等 UI 仍可独立演示。

#### 3. Web UI 完整 Demo（接 LLM）

配置好 `.env.local` 后 `npm run dev`，按聊天里的提示输入需求即可。

### 测试

```bash
npm test          # vitest run
npm run test:watch
```

覆盖：时间语义解析、时间线可行性、ISO 字符串规整、agent 路由、POI seed 数据。

### 数据约定

- 全部 POI / 价格 / 排队 / 路线 / 天气 / 订单都是 mock，写在 `src/mastra/tools/*` 和 `lib/**`。
- 默认家位置 = 上海市黄浦区中心（adcode `310101`），可在前端右上角"家"按钮处用浏览器 geolocation 推断或手填。
- 预算红线在 `build_structured_itinerary` 内强制校验；超支会被工具直接拒绝。
- 所有"会扣钱/会下单"的工具都标了 `requireApproval: true`，需用户在卡片里点确认。

### 可选：接入高德地图（Amap）真实数据

在 `.env.local` 里加 `AMAP_KEY=<你的 Web 服务 key>`，下列工具会自动切到真实 API（失败/限流自动回退 seed）：

| 工具 | 接的 Amap 接口 |
|---|---|
| `search_enhanced_poi` | [POI 关键字搜索 v5](https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch) |
| `calculate_transit_matrix` / `calculate_transit_route` | [距离测量 v3](https://lbs.amap.com/api/webservice/guide/api/direction) |
| `get_local_weather` | [天气查询 v3](https://lbs.amap.com/api/webservice/guide/api/weatherinfo) |
| `/api/geo/reverse` | [逆地理编码 v3](https://lbs.amap.com/api/webservice/guide/api/georegeo)（前端 home pill 调用） |

实现细节：

- 适配层：`lib/geo/amap-client.ts`（fetch + 4s 超时 + LRU/TTL 缓存 + 失败一律回 null）
- POI 归一化：`lib/geo/amap-poi-adapter.ts`（Amap → 类 SeedPoi，`amap:` 前缀做 namespace）
- 安全护栏：`amap:` 前缀的 POI 在 `execute_transaction*` 里会被强制拒绝（这些不是美团交易侧 ID）
- `MOCK_AGENT=1` 离线模式下即使配了 `AMAP_KEY` 也不会调用 Amap，保证 demo / vitest 全离线可跑
