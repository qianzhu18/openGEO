# 08 Prompts 监控页：Topify 与 OpenGEO 的差距

日期：2026-10-30。对象：`/analyze/tracking/prompts?range=7`（Tracking → Prompts）。问题：**我们的"监测"和目标产品差在哪里。**

证据分级沿用本目录：**UI** 登录态页面直接观察；**NET** 页面自然请求与去值响应；**JS** 公开分发脚本的字面量；**DOC** 官方文档；**DESIGN** 本文建议；**UNKNOWN** 证据不足。代码事实来自本仓库当前提交。

> 本文只写差距与设计。凡是代码里没有的能力，一律标为缺失，不把待做写成已完成。

## 0. 结论

Topify 的 Prompts 页不是一张表，而是三层结构：

```text
持久问题库（active / suggested / inactive）
      ×
跨 Provider 的每日采样（每个 active prompt 每天采一轮）
      ×
按问题物化的指标快照（9 个指标列 + Topic 分组 + 窗口 delta + 详情下钻）
```

我们当前的"监测"是另一种东西：

```text
一次运行（AgentRun）里的临时问题列表
      ×
一次手工采样（≤5 题、≤8 次调用）
      ×
项目级提及率（mention / recommendation）
```

差的是**数据地基和采集能力**，不是页面。页面可以在没有地基时空转，但那样只是把 0 渲染得更好看。

量化：

| 维度 | Topify | 我们 |
| --- | --- | --- |
| 按问题可用的指标列 | 9 个指标列 + Topic 分组列（列配置另有 Top 1 Rate） | 0 |
| 问题状态视图 | 3（Active / Heatmap / Suggested） | 0 |
| 按问题组织的下钻 | 6 类（analytics / chats / domains / urls / competitor / fanouts） | 0 |
| 跨轮时间序列 | 有（`duration_days`，默认 7） | 0（数据在 run 内） |
| 定时采集 | 每日 / active prompt | 无 |
| 问题库身份 | 持久、可停用、可恢复 | 每次运行被覆盖写 |

三个 P0 阻塞：**Prompt 实体与稳定 ID、跨 run 的 Observation 事实表、按问题的聚合口径**。这三个不做，Prompts 页做出来也没有数据可显示。

## 1. 证据

| 来源 | 等级 | 用途 | 位置 |
| --- | --- | --- | --- |
| `?range=7` 页面快照 | UI | 路由、10 列表头（含 Topic）、三视图 | [pages.json](evidence/pages.json) |
| 页面网络窗口 | NET | topics / table-settings / providers / competitors | [response-shapes.json](evidence/response-shapes.json) |
| 分发脚本字面量 | JS | 列 key、delta key、表设置结构、动作接口 | `chunk-35.js`、`chunk-30.js`（临时目录，不入库） |
| 本轮 REA 静态分析 | JS | 两段脚本解析、`tracking_prompts` 字面量定位 | [rea-prompts-slice.json](evidence/rea-prompts-slice.json)，Evidence `ev_f7e998…` |
| 官方 Prompts API | DOC | `prompt_type`、字段语义、下钻响应 | https://docs.topify.ai/api-reference/prompts |
| 官方 Overview API | DOC | `duration_days` 默认 7、`prompt_type` 过滤 | https://docs.topify.ai/api-reference/overview |
| 官方「Understanding prompts」 | DOC | 状态、intent、Volume 估算 | https://docs.topify.ai/guides/understanding-prompts |
| 本仓库代码 | CODE | 现有模型、页面、接口 | `src/citekeel/`、`src/opengeo/`、`public/app.js` |

口径冲突已在 [05](05-metrics-and-collection.md) 记录，本文不重复，只在落地方案里给出取舍。

## 2. Topify Prompts 页拆解

### 2.1 视图与列

- 三视图：**Active**（每日采集）、**Suggested**（推荐、未启用）、**Heatmap**（另一分析视图）。
- 表头（UI，按顺序）：`Topic`、`AI Volume`、`Visibility`、`Sentiment`、`Position`、`SOV`、`Mentions`、`Intent`、`CVR`、`Location`。`Topic` 是分组列，其余九个是指标列。
- 列配置常量（JS）比截图更可靠：

```text
表 id: tracking_prompts
列: totalVolume(AI Volume) · avgVisibility · avgSentiment · avgPosition
    avgSov(Share of Voice) · avgTop1Rate(Top 1 Rate，实测表头未见)
    totalMentions · intent · avgCvr(CVR) · location
表设置: { hidden_columns: [], delta_display: "full" }，带 version，按项目服务端保存
```

- 每个指标列都带 delta：`visibility_delta`、`sentiment_delta`、`position_delta`、`sov_delta`，方向为 `up / down / neutral`；`Sentiment / Position / SOV` 在 UI 里把 `0` 当空（`treatZeroAsEmpty`）。这本身与"0 是有效负面分"的定义冲突，见 05。
- 列表接口带 `page / page_size`（上限 100，默认 50）、排序字段与方向。
- 本轮 REA 解析了这两段脚本（2 文件、44,680 AST 节点、0 parse failure），定位到表 id 字面量 `tracking_prompts`（chunk-35.js:1:96143）。列 key 列表来自对同一脚本的直接读取；REA 的语义图覆盖不完整，不能据此说"只有这些列"。

### 2.2 字段契约

公开 API 的 Prompt 字段（DOC）与页面列一一对应：

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `content` | 问题文本 | 文档写 10–2000 字符；页面表单曾提示 300，两者不一致，落地按自己的上限 |
| `prompt_type` | `active` / `suggested` / `pending` / `inactive` / `url_recommended` | 比 UI 的三视图多两个内部态 |
| `topic_id` | 主题 | 主题是独立实体，可批量分配 |
| `country` | 目标国家 | UI 叫 Location |
| `visibility` | 品牌可见度 0–100 | 跨 Provider 百分比 |
| `sentiment` | 情绪分 | 整数 |
| `position` | 平均位置 | 同答内首次出现排序 |
| `volume` | 已采集回答数 | 与"估算需求"同名不同义 |
| `cvr` | 复合分 0–100 | 权重未公开（UNKNOWN） |
| `intent` | 四枚举 | informational / commercial / navigational / transactional |
| `trend` | `up` / `down` / `stable` | 页面用 delta 呈现 |

### 2.3 操作

| 操作 | 证据 | 说明 |
| --- | --- | --- |
| 新增问题 | UI + DOC | 文本 + Location + Topic；支持逐行粘贴批量 |
| Track / Reject | DOC | Suggested → Active / 丢弃 |
| Untrack | DOC | Active → Inactive，历史保留 |
| 批量操作 | DOC | 批量 track / untrack |
| 批量分配主题 | JS `/api/v2/prompts/batch/assign-topic` | 表格多选后操作 |
| 停用 / 启用 | JS `convert-to-active` / `convert-to-inactive` | 与状态视图联动 |
| 列设置 | JS `table-settings` | 隐藏列、delta 展示，服务端持久化 |
| 导出 | UI | 表格导出 |
| 推荐生成 | DOC + JS | Semrush / DataForSEO / LLM 管线，30–90 秒，`idempotencyKey` |
| URL 推荐 | JS `/api/v2/prompts/url-recommendations` | 从 Recording 的 URL 派生 |

### 2.4 下钻

点开一个问题可以看到（DOC）：

- **analytics**：按日期 × Provider 的 visibility / position / sentiment 时间序列；
- **chats**：每次回答的完整正文、引用列表（title / link / snippet / 序号）、提到的品牌、该品牌在这条回答里的情绪与位置；
- **domains**：这个问题的引用域名、引用次数、被引用率、品牌共现；
- **urls**：具体页面、首次/最近被引用时间；
- **competitor-overview**：该问题下竞品指标；
- **fanouts**：该问题触发的子查询。

这是"从指标回到原文"的链路，也是我们最该对齐的部分。

### 2.5 时间语义

- 页面 `?range=7`；公开 API 用 `duration_days`，**默认 7**，也支持 `date_from` / `date_to`。
- 采集按 active prompt 每日跑（DOC，未独立验证采集 worker）；页面聚合按窗口返回，是否服务端物化未验证（UNKNOWN）。但语义是明确的：窗口过滤的是每日采集结果，不是某一次运行。
- `volume` 在字段表里是"已采集回答数"，在指南里又被描述成"估算的 AI 搜索需求"。同一名字两种含义，落地时必须拆开。

## 3. 我们当前有什么（代码事实）

### 3.1 两个互不相通的存储

- `src/citekeel`（网页工作台）：`Project` 里内嵌 `queries`、`samples`，全部存在一个 JSON 里；历史是 `AgentRun` 快照。
- `src/opengeo`（CLI）：`project.json` 物化视图 + `evidence/*.jsonl` 追加日志 + `runs/*.json`。

两边的 `Query` 字段都不一样（citekeel 没有 status，opengeo 没有 topic/country）。这是 Roadmap W1 已知问题，但它对监控页是**直接阻塞**：页面读哪一边，另一边就没有数据。

### 3.2 问题没有身份

`src/citekeel/server.ts` 有三处会**整体覆盖**问题库：

```text
:88   保存问题清单（1–40 条）→ 重建 queries
:95   导入回答 → project.queries = samples.map(...)
:116  实时运行 → project.queries = 本轮 1–5 题
```

后果：

- 导入一批回答，原来的问题库没了；
- 跑一次 5 题的实测，问题库缩成 5 条；
- 问题没有稳定 ID，无法把"上周这条问题的可见度"接到"这周同一条问题"。

opengeo 的 `Query` 有 `status: confirmed | candidate | retired` 和 `priority`、`platform`，是全仓最接近状态机的地方，但它是 CLI 侧、和网页不相通，也没有 `suggested` 与 `url_recommended`。

### 3.3 指标只有提及 / 推荐

`src/citekeel/analysis.ts` 计算：`mention`（字面命中）、`recommendation`（附近措辞启发式）、`strata`（按来源·模型·问题类型·批次分组）。没有 sentiment 分、position、SOV、CVR、Top1、volume 聚合。

`src/opengeo/engine.ts` 的 `CycleMetric` 有 `mentionRate / positive / negative / riskTags / citations`，但粒度是**周期**，不是问题；情绪是三档规则标签，不是 0–100 分。

### 3.4 页面只有文本编辑

`public/app.js`：

- 「问题空间」是整块 textarea，保存即替换；
- 「主题表现」按 `query.intent` 这个**自由文本**分组，不是 Topic 实体；
- 概览的"最近 7 天"只过滤**当前这一轮**里的样本，跨轮不合并；
- 回答列表 + 检查器可以看原文（这是最接近 chats 的部分），但不是按问题组织的；
- 没有搜索、排序、分页、批量、列设置、导出表格。

### 3.5 采集是"跑一次"

- 手动触发，一轮最多 5 个问题、最多 8 次模型调用；
- 没有调度器、没有按 provider 的 fan-out、没有配额与重试预算模型；
- 失败样本有记录（`collectionStatus/analysisStatus`），这是我们的优点，保留。

### 3.6 导出按 run

只有 `report.md` 与整轮 JSON，没有"问题表导出"。

## 4. 差距矩阵

### 4.1 页面与交互

| 能力 | Topify | 我们 | 差距类型 |
| --- | --- | --- | --- |
| 状态视图 | Active / Suggested / Heatmap | 无 | 缺实体 + 缺 UI |
| 指标列 | 9 个指标列 + Topic | 0 | 缺计算 |
| 列设置 | 服务端持久化 | 无 | 缺 API + 缺 UI |
| 排序 / 搜索 / 分页 | 有 | 无 | 缺 UI + 缺 API |
| delta / 趋势 | 每列 delta + 方向 | 无 | 缺计算 |
| 批量操作 | track/untrack/assign-topic | 无 | 缺 API |
| 新增单条（含 Location/Topic） | 有 | 只有整块替换 | 缺表单 + 缺模型 |
| 详情下钻 | 6 类 | 部分（仅逐条原文） | 缺聚合 |
| 导出 | 表格导出 | 仅整轮报告 | 缺导出 |

### 4.2 指标口径

| 指标 | Topify 口径 | 我们现状 | 结论 |
| --- | --- | --- | --- |
| AI Volume | 已采集回答数 / 也被说成估算需求 | 只有本轮样本条数 | 拆成 `collectedResponses` + `estimatedDemand` |
| Visibility | 提及品牌回答 / 分母回答，跨 Provider | 项目级提及率 | 有算法，缺按问题 × Provider 的分母 |
| Sentiment | 提及回答内 0–100，再聚合 | 无 | 缺打分与证据片段 |
| Position | 同答内首次出现排序后的名次均值 | 无 | 缺位置抽取 |
| SOV | 去重品牌槽位占比 | 无 | 缺槽位抽取 |
| Mentions | 品牌共现（口径不唯一） | 单条布尔 | 需自定口径 |
| Intent | 四枚举 | 自由文本 | 需枚举 + 映射 |
| CVR | 复合分 0–100，权重未公开 | 无 | 公式需自定并公开 |
| Location | 国家 | 无（仅项目级 market） | 缺维度 |
| Top 1 Rate | 列配置里存在，实测表头未见 | 无 | 低优先 |

### 4.3 数据与工程

| 能力 | Topify | 我们 | 差距 |
| --- | --- | --- | --- |
| 问题实体 | 有，持久 | `Query` 两种、会被覆盖 | 重建实体 |
| 主题实体 | 有 | 用 intent 冒充 | 新建 Topic |
| 采样事实表 | prompt × provider × day | run 内 sample | 新建表 |
| 聚合快照 | 窗口物化 | 无 | 新建 |
| 调度 | 每日 | 无 | 新建 |
| 多 Provider | 5 个入口 | 6 个适配入口，但一轮 5 题 | 扩采样 |
| 原始回答留存 | 有 | 有（优点） | 保留，改挂到 prompt |

## 5. 根因

1. **证据模型是 run-scoped，不是 prompt-keyed**。所有样本挂在某次运行下，天然做不出"这条问题 7 天的曲线"。
2. **问题没有身份**。三处覆盖写让问题库变成运行参数，历史对不上。
3. **双存储**。网页与 CLI 各有一套模型，监控页无论读哪边都缺另一半。
4. **采集是动作，不是服务**。没有调度、没有 per-provider fan-out，页面规模被"一轮 5 题"锁死。
5. **指标层只做了"命中"**。位置、情绪、份额、需求这些需要抽取与归一的量，一个都还没有。

## 6. 落地路线

按依赖排序，不按页面好看程度排序。

### P0-1 Prompt / Topic 实体（S）

新建 `src/monitoring/types.ts`（或并入 opengeo types），先只做模型与迁移：

```ts
type PromptStatus = 'active' | 'suggested' | 'inactive';

interface Topic { id: string; name: string; description?: string; createdAt: string }

interface Prompt {
  id: string;                    // 稳定 ID，导入/重跑不变
  text: string;
  status: PromptStatus;
  topicId: string | null;
  country: string | null;        // ISO 3166-1 alpha-2
  intent: 'informational' | 'commercial' | 'navigational' | 'transactional' | null;
  source: { kind: 'manual' | 'import' | 'template' | 'evolve' | 'recording'; ref?: string };
  createdAt: string;
  activatedAt?: string;
  retiredAt?: string;
  queryBankVersion: number;      // 与现有 queryVersion 对齐
}
```

迁移：`project.queries → prompts`，保留原 id；旧 run 的 `sample.queryId` 作为 legacy 引用；覆盖写的三处改成 upsert。

验收：导入回答、跑实时采样，问题库条数与 id 不变。

### P0-2 Observation 事实表（M）

```ts
interface ObservationRecord {
  id: string;
  promptId: string;
  provider: string;              // chatgpt / perplexity / google_ai_overview / gemini / claude
  model: string;
  interfaceKind: 'api' | 'consumer-web';
  country: string | null;
  language: string;
  observedOn: string;            // 采集日 YYYY-MM-DD，不是运行日
  protocolId: string;
  runId: string;                 // 指向现有 AgentRun / opengeo run
  sampleId: string;
  collectionStatus: 'completed' | 'failed';
  analysisStatus: 'completed' | 'failed' | 'unknown';
  rawAnswerRef: string;          // evidence 行号或 runs/<id>.json 路径
}
```

不变量：追加写；失败记录必须入表但不进分母；`observedOn` 与 `observedAt` 分开（一个是采集日，一个是回答时间）。

验收：同一 prompt 两轮不同日期采集，返回两条记录，页面出现两个点。

### P0-3 聚合与 delta（M）

```ts
interface PromptAggregate {
  promptId: string;
  window: { from: string; to: string; days: number };
  providerScope: string[];
  collectedResponses: number;                       // volume
  estimatedDemand: { value: number; source: string; method: string } | null;
  visibility: { numerator: number; denominator: number; value: number | null };
  position: { value: number | null; n: number };
  sentiment: { value: number | null; n: number };
  sov: { numerator: number; denominator: number; value: number | null };
  top1Rate: { numerator: number; denominator: number } | null;
  cvr: { value: number | null; formulaVersion: string } | null;
  delta: Record<string, number | null>;
  excluded: { reason: string; count: number }[];
}
```

口径约束（继承 05 的协议）：

- 缺失不是 0；采集失败不是"未提及"。
- `sentiment = 0` 是有效值，展示层再决定是否显示为破折号。
- SOV 用去重品牌槽位，不按单词出现次数。
- Position 是名次，不是字符偏移。
- 只有一个观测日时显示点，不补中间趋势。

### P0-4 Prompts 页 v1（M）

- Active / Suggested 两个状态视图（Heatmap 本轮不做，不放假 tab）。
- 9 个指标列 + Topic 分组；`null` 显示 `—`，delta 显示方向。
- 顶部：时间范围（7/30/90）、Provider、Topic、搜索。
- 行操作：停用/启用；多选批量：track / untrack / 分配主题。
- 空态、加载、失败、部分完成四态。

最小接口（与现有 `src/citekeel/server.ts` 风格一致，先只读）：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/prompts?status=&topic=&provider=&q=&from=&to=&page=` | 列表 + 聚合 |
| GET | `/api/prompts/:id` | 单条 + 窗口聚合 |
| GET | `/api/prompts/:id/analytics` | 日期 × Provider 序列 |
| GET | `/api/prompts/:id/chats` | 回答原文分页 |
| POST | `/api/prompts` | 新增（单条或批量粘贴） |
| PATCH | `/api/prompts/:id` | status / topic / country / intent |
| POST | `/api/prompts/batch` | track / untrack / assign-topic |
| GET / POST | `/api/topics` | 主题列表与新建 |

### P1-1 采集调度（L）

按 active prompt 排期，fan-out 到多 Provider；预算、超时、重试、幂等键；失败写 `collectionStatus=failed` 并计入 `excluded`。这一项决定页面能不能持续有数据。

### P1-2 详情抽屉（M）

`/api/prompts/:id/{analytics,chats,domains,urls}`。复用现有 citation 分型（provider_citation / search_result / grounding / answer_url），不要把正文链接升格成引用。

### P1-3 批量、列设置、导出（S）

列设置先存本地（localStorage），稳定后再服务端持久化；导出 CSV。

### P1-4 Suggested 生成（M）

从 Recording 的 URL、已有资产的卖点、`evolve` 的候选问题派生；生成后是 `suggested`，必须人工 Track 才进入采集。保留来源与版本。

### P2

- Heatmap：Topify 的 `/api/heatmap` 初始化本轮返回过 404（UNKNOWN），口径不明，最后做。
- CVR / Top1 Rate：先定公式并公开，再上页面。

## 7. 验收用例

1. 同一 prompt 连续两天采集 → 页面两点，`range=7` 过滤后分母一致。
2. 一条采集失败 → 不进 Visibility 分母，`excluded` 计数 +1。
3. `sentiment = 0` 保留为 0，不显示成缺失；`null` 显示 `—`。
4. 导入 20 条回答前后，问题库条数与 id 不变（回归测试）。
5. 5 个 Provider 中 2 个失败 → 聚合标 `partial`，不显示 0%。
6. 同答中品牌 A 出现 3 次、B 出现 1 次 → SOV 按槽位计算为 50/50，不是 75%。
7. 停用一个 prompt → 历史保留、不再采样，可恢复为 active。
8. 批量分配主题后刷新，分组保持；列设置刷新后保持。
9. 320px 下表格局部滚动，键盘可打开/关闭详情。
10. 没有 fanout 数据时显示"未知"，不用模型补写。

## 8. 不照搬

| 项 | 原因 |
| --- | --- |
| CVR 权重 | 公开文档只说"融合可见度、情绪、位置"，权重与归一化未公开（UNKNOWN） |
| Volume 单一定义 | 同一字段两种含义，必须拆成采集数与估算需求 |
| `sentiment=0` 当空 | 与"0 是有效负面分"冲突；内部保留 0 |
| Heatmap | 初始化 404，口径未验证 |
| Top 1 Rate | 实测表头未见，口径未定，先不做 |
| 自动补 fanout | 未采到不等于没有，不能补写 |

## 9. REA 安装与使用记录

本轮按用户要求从 `https://github.com/morluto/rea` 获取并安装 skill。

| 项 | 结果 |
| --- | --- |
| 仓库版本 | `rea` 插件 `6.8.0`（`.claude-plugin/plugin.json`） |
| 克隆位置 | `/tmp/rea-skill`（临时，不入库） |
| Skill 安装 | `~/.agents/skills/reverse-engineer-anything/`（`SKILL.md` + 7 个 references） |
| 会话识别 | 已出现在本会话 skill 列表，可 `skill` 调用 |
| CLI | `~/.local/share/rea-cli/node_modules/rea-agents`（`rea --version` → `6.8.0`） |
| 安装方式 | `npm install --omit=optional rea-agents@6.8.0`（跳过 `frida`，它在本机 prebuild 卡住） |
| MCP | 未注册到本会话；需要时用已安装 CLI 执行 `node ~/.local/share/rea-cli/node_modules/rea-agents/scripts/rea.mjs setup`，或在客户端手动加 server |
| Node | 本机 `v22.23.2`；包要求 22.23.4 以上或 24.22.1 以上或 26.12.1 以上，当前低于下限（CLI 仍可运行，官方安装脚本会拒绝） |

本机 Swift 工具链的已知故障仍在：`SwiftBridging` module 在
`/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap` 与
`bridging.modulemap` 中重复定义。修复方式与 [07](07-evidence-and-reproduction.md) 一致，且不修改系统文件：

```bash
# 临时空文件 + VFS overlay，只在这次编译视图里生效
: > /tmp/opengeo-empty-modulemap
cat > /tmp/opengeo-swift-overlay.json <<'JSON'
{"version":0,"roots":[{"type":"file",
 "name":"/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap",
 "external-contents":"/tmp/opengeo-empty-modulemap"}]}
JSON
cat > /tmp/rea-swiftc <<'SH'
#!/bin/sh
exec /usr/bin/swiftc "$@" -vfsoverlay /tmp/opengeo-swift-overlay.json
SH
chmod +x /tmp/rea-swiftc

REA_DARWIN_SWIFTC_PATH=/private/tmp/rea-swiftc \
SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk \
  rea analyze-javascript-application /abs/path/to/scripts --format json
```

本轮执行结果：解析 2 个文件 / 180,858 字符 / 44,680 AST 节点，`parse_failures: 0`，语义图 26,822 节点、38,393 关系，覆盖 status 为 `unknown`（不是完整恢复）。定位到 `tracking_prompts` 字面量（chunk-35.js:1:96143）。记录见 [rea-prompts-slice.json](evidence/rea-prompts-slice.json)。

注意：REA 的两段脚本只是客户端代码。它证明常量与请求方法存在于该版本，不证明服务端实现、指标算法或采集行为。

## 10. 证据文件

- 页面清单：[pages.json](evidence/pages.json)
- 网络操作与响应形状：[response-shapes.json](evidence/response-shapes.json)、[network-operations.json](evidence/network-operations.json)
- 静态接口候选：[static-client-contracts.json](evidence/static-client-contracts.json)
- 前轮 REA 记录：[rea-runs.json](evidence/rea-runs.json)
- 本轮 REA 记录：[rea-prompts-slice.json](evidence/rea-prompts-slice.json)
- 指标口径与冲突：[05-metrics-and-collection.md](05-metrics-and-collection.md)
