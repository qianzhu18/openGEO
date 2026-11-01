# niubigeo 拆解：它到底是怎么做的

日期：2026-11-02。对象：<https://github.com/Albert-Weasker/niubigeo>（我们 vendored 的 v0.3.2 上游）。
证据来源：本地 `vendor/niubigeo/` 源码与文档、GitHub API、官网定价页。**能读到源码的部分写"源码"；推断写"推断"。**

## 1. 一句话

niubigeo 是一个**"反黑盒"的 AI 可见度测量工具**：输入域名 → 选模型 → 拿真实回答与引用 → 出可回溯的报告 → 可选定时监测。开源版负责"测量与证据"，官方付费服务负责"真人测试、内容发布、诊断报告"。

它的增长不是靠功能列表，而是靠三件事：**可复核的证据、真实案例、把开源当信任入口**。

## 2. 仓库与项目节奏（2026-11-02 抓取）

| 指标 | 数值 |
| --- | --- |
| 创建时间 | 2026-09-03 |
| Stars / Forks | 8,926 / 808 |
| Open issues | 122 |
| Contributors | 4（主作者 46 次提交） |
| License | Apache-2.0 |
| Release 节奏 | v0.2.0（09-08）→ v0.3.2（10-23），约两周一个版本 |
| 语言 | English / 简体中文 / Português (Brasil) |
| 商业化 | 官网按服务收费：¥99 诊断报告（3 问题 × 3 模型）、¥5/人/问题真人 AI 测试、真人任务、按站点计价的文章发布 |

**关键结构**：开源 Community Edition 与商业平台**分开部署、分开数据**。商业平台承接推广计划、真人网络、支付与交付；开源版不会上传用户项目（源码文档明确写了这一点）。

## 3. 技术架构（源码）

### 3.1 入口与模块

```text
product-server.ts（HTTP + 页面）
  ├── projects / configuration / recognition（域名认知）
  ├── measurements（WatchSet、MeasurementRun、ProbeRun）
  ├── scheduling（MonitoringTask、ScheduledOccurrence、Worker）
  ├── reports（认知报告、人类可读报告）
  └── store（文件存储）
schedule-worker.ts（独立进程，负责到期扫描）
```

- **服务与 Worker 分离**：HTTP 服务本身不执行定时扫描，必须单独跑 worker。这是很关键的部署约束（文档明写）。
- **执行器只走 OpenRouter**（v0.3.2 产品层）；仓库里有其他 Provider 适配器，但产品界面没开放直连。
- **文件存储**：`PRODUCT_DATA_DIR`，没有数据库；单机自托管友好，但多租户/并发查询是瓶颈。
- **BYOK**：缺 Key 直接阻止真实审计；Provider 目录是 UI/CLI/API 的唯一事实源。

### 3.2 数据模型（比多数竞品严谨）

```text
ProductProject → Baseline（不可变配置快照）
RecognitionRun → RecognitionModelRun → Attempt → Archive
WatchSet（对象/关键词/协议快照）→ MeasurementRun
  → MeasurementModelRun → ProbeRun（计划样本）→ ProbeAttempt（执行尝试）
  → MeasurementMetricPoint（聚合）
MonitoringTask → ScheduledOccurrence → MeasurementRun
```

三个设计值得直接抄：

1. **Attempt 与 Observation 分开**：重试不是新样本，不进分母。
2. **Baseline 不可变**：改模型/协议必须新建 Baseline，历史趋势才能比较。
3. **指标可重算**：MetricPoint 只是快照，随时能从 Attempt 重算。

### 3.3 调度（源码 `schedule-service.ts`）

- 用 `cron-parser`，支持 daily / weekly / monthly / 自定义 cron + **时区**；
- 每次到期生成 `ScheduledOccurrence`，**幂等键 = `taskId:scheduledFor`**；
- 预算账本：`requestLimit`、`dailyRequestLimit`、`tokenLimit`、`costLimitUsd`，先 reservation 再执行；
- 保护条件：项目归档跳过、任务非 active 跳过、**上一次运行还在跑就跳过**（`previous_run_still_active`）、每日请求上限阻断；
- 执行后做**终态对账**（occurrence → run 状态 → ledger）。

这套语义比"每天跑一次"值钱：它解决的是**重复计费、并发打架、超预算**。

### 3.4 测量方法（文档 + 源码）

- 观察单位：`一个模型 × 一个协议 × 一个域名/关键词 × 一个 sampleNumber`；
- 分母纪律：`planned / denominator / failed`，失败或排除不进品牌未命中的分子；**null 与 0% 严格区分**；
- 证据偏移：UTF-16 code unit，`rawAnswer.slice(start,end) === quote`；
- `known-issues.md` 主动披露"7 项唯一第一名冲突"，并暂停相关排名比较；
- `CAPABILITY_MATRIX.md` 把每条能力映射到代码所有者与验收；
- 发布流程有 freeze / verify 脚本（阶段验收冻结）。

这是它最硬的护城河：**不是数字多，而是数字能被质疑、被重算、被解释。**

### 3.5 报告（产品判断）

主报告**不出现** SOV、prompt/run ID、token 成本、延迟、原始 JSON；只回答创始人关心的四件事：有没有提到你、说对没有、还提到谁、依据是什么。来源分 related / possible / excluded，竞品必须有实体证据。

## 4. 增长机制（它做对了什么）

1. **开源即信任入口**：Apache-2.0、可自托管、BYOK，直接对抗"黑盒 GEO 分数"。
2. **20 个真实案例**（Notion、Figma、PostHog 等），每个都能点回原始回答与来源。
3. **多语言**：英文 + 中文 + 葡语，覆盖不同市场。
4. **发布节奏**：两周一个版本，CHANGELOG + release notes。
5. **Product Hunt / Trendshift** 徽章与真实用户口碑。
6. **服务变现而不是订阅墙**：¥99 报告、真人测试、发布服务；开源版不要求付费。
7. **README 先讲问题，再讲功能**："你不缺另一个分数，你缺分数背后的回答。"

## 5. 它的边界（也是我们的机会）

| 边界 | 事实 | 影响 |
| --- | --- | --- |
| 只走 API | 产品执行器只接 OpenRouter；文档明确"要看消费者网页/App，另安排真人测试" | 与真实用户所见有差距；这正好是浏览器采集 adapter 的空间 |
| 文件存储 | 单机、无数据库 | 多项目/多客户并发吃力 |
| 报告导向 | 强在测量与报告，弱在"改完再测"的交付闭环 | Actions/审批/发布/复测是空位 |
| 单作者风险 | 4 个 contributor | 社区与维护是长期问题 |
| 中文优先 | 英文/葡语已有，但品牌叙事偏中文 | 海外开发者心智仍可争 |

## 6. 可复用 vs 不要照抄

**直接复用（合法，Apache-2.0，保留 attribution）**

- Probe/Attempt/Observation 三层与预算账本语义；
- cron + occurrence 幂等 + 时区 + "上次未结束则跳过"；
- Baseline 不可变、指标可重算；
- 证据偏移与 known-issues 披露；
- 人类可读报告的分层（结论 → 原文 → 来源）；
- Docker 自托管、BYOK、Provider 目录单一事实源。

**不要照抄**

- 文件存储作为长期方案（我们应上 SQLite/Postgres）；
- 只做 API 采集（我们要有浏览器 adapter，但必须披露差异）；
- 把仪表盘当产品（我们要做交付闭环）；
- 先铺 20 个案例再修核心链路（我们应先打通一条可复现链路）；
- 中文优先的叙事（openGEO 目标海外英文市场）。

## 7. 给 openGEO 的三条结论

1. **测量层要按 niubigeo 的标准做**，否则没有可信度；
2. **交付层要按 Topify 的闭环做**，否则只是另一个报告工具；
3. **分发层要按开源项目的规律做**：可复现 demo、公开案例、对比页、MCP/CLI、两周节奏。

下一篇：[OpenGEO 怎么做](../../docs/13-产品计划.md)。
