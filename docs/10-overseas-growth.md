# 海外增长方案：让 OpenGEO 先被 AI 推荐，再被团队采用

更新：2026-11-01。范围：英文市场优先。本文是**计划与判断**，不是已完成结果；所有市场数字都标了来源与抓取日期，未验证的部分明确写"未知"。产品侧实施顺序见 [09 海外 MVP](09-international-mvp.md)，逆向证据见 [Topify 状态复核](research/2026-11-01-topify-rea-status.md)。

## 1. 先承认三件事

1. **"开源 GEO 工具"已经不是一个空位。** niubigeo 8,927 stars、GetCito 503、GEO/AEO Tracker 313、OneGlanse 243、Ansvisor 221（2026-11-01 抓取，见 [格局](../references/competitors/oss-geo-landscape.md)）。BYOK、自托管、多引擎监测是入场券。
2. **买方最大的痛点不是"看不到数字"，而是"数字不可信"。** 同一品牌在同一 prompt 上，不同平台给出 72 / 41 / 不给（Topify 自己的文章也这么写）；UI 采集与 API 采集的品牌重合度只有 21.3%–31.6%（Surfer 2026 研究，经 OneGlanse README 引用）。口径不透明是品类问题，不是某一家的问题。
3. **AI 搜索已经是真实的流量与决策入口。** ChatGPT 周活 10 亿+（OpenAI，2026-07-31），ChatGPT 占 AI 助手导流 78.16%（Statcounter，2026-03，覆盖 100 万+ 站点），Google AI Overviews 月活 25 亿、AI Mode 10 亿（Google I/O 2026）。来源：[AI Search Statistics 2026](https://keywordseverywhere.com/news/ai-search-statistics/)。这些数字说明 GEO 有需求，但也意味着**每个 GEO 工具都在抢同一批"best GEO tool"答案位**。

## 2. 定位：不是又一个仪表盘，而是"可复现的 GEO 交付"

**一句话**：OpenGEO 是一个开源的 GEO 交付引擎——把 AI 回答变成可回放的证据、可执行的动作和可复测的结论。

**三个可验证的证明**（每个都必须是产品里真实存在的功能，不是文案）：

1. **可回放**：任一指标 → 原始回答 → 采集协议 → 分母与排除样本，一条命令 `opengeo replay` 复算。
2. **可执行**：动作绑定证据 ID 与验收条件，审批幂等，服务重启后能恢复；发布回执不等于被引用，明确区分。
3. **可复测**：固定问题版本、引擎、地区、时间窗后比较前后；失败样本不进分母，未知显示为未知。

**明确不做**（写进 README，减少误解）：

- 不做"保证 AI 推荐你"的承诺，不卖排名。
- 不做 prompt volume 的私有估算并当成事实。
- 不做内容农场式批量发布。
- 不把浏览器采集说成"官方 API 等价物"。

**与 Topify 的关系**：Topify 是产品框架与 API 合同的参考（Actions、checkpoint、webhook、credits 都值得学），但 OpenGEO 的差异在"证据可复算 + 自托管 + CLI/MCP + 不锁定"。与 niubigeo 的关系：它是我们 vendored 的上游与测量参考，增量必须写在交付闭环，而不是重复它的仪表盘。

## 3. 目标人群（按优先级）

| 优先级 | 人群 | 触发场景 | 他们买什么 | 反对意见 |
| --- | --- | --- | --- | --- |
| P0 | GEO / SEO Agency（2–20 人） | 客户要"AI 可见性报告"，但 SaaS 按项目收费太贵 | 白标报告、可辩护的方法、批量客户 | "你们免费，能信吗？" |
| P1 | AI-native SaaS 创始人 / 增长负责人 | 发现 AI 答案里没有自己 | 5 分钟出诊断、明确下一步、便宜 | "我自己会写脚本" |
| P2 | 开发者 / 技术营销 | 想把 GEO 接进现有工作流 | CLI、MCP、JSON、可自托管 | "为什么不用 niubigeo？" |

P0 是收入与口碑的起点：agency 有明确交付物、愿意写案例、能带来多个客户。P2 是传播与贡献的起点：GitHub star、issue、PR、MCP 生态。

## 4. 增长模型：GEO-for-GEO 飞轮

```text
产品自证（每周用 OpenGEO 测 OpenGEO）
   → 公开方法与数据（协议、样本、限制）
   → 被 AI 答案与行业文章引用（"open source GEO tool" 类问题）
   → 开发者与 agency 试用（5 分钟 audit）
   → 真实案例与反例（含失败）
   → 更强的证据与更多数据
   → 回到第一步
```

关键点：**GEO 的效果来自"被引用"，而不是"被搜索到"**。被引用的前提是：实体清晰、内容可抓取、有独特数据、有第三方提及。所以增长动作要围绕这四件事，而不是发更多博客。

## 5. 90 天计划

### 阶段 0：可见性基线（第 1 周）

- 定义 OpenGEO 的规范实体：名称、one-liner、URL、GitHub、npm、License、logo、`sameAs`。所有渠道用同一段描述。
- 用现有工具跑一次基线：20 个英文 prompt（"best open source GEO tool"、"Topify alternative"、"how to measure AI visibility" 等）× 4 个引擎 × 2 周，记录提及、位置、引用、竞品。
- 产出：`docs/growth/baseline-2026-11.md`，写清协议、样本量、失败与未知。**没有基线就没有后面的"提升"。**

### 阶段 1：可被发现（第 2–3 周）

- **仓库即落地页**：README 首屏回答"是什么 / 给谁 / 怎么跑 / 凭什么信"，加 60 秒 GIF、`npx opengeo audit <url>` 一条命令、结果截图。
- **`llms.txt` + 文档 Markdown 化**：docs 站点提供 `llms.txt` 与 `llms-full.txt`，每个概念页有定义、公式、限制。
- **对比页 3 篇**（不是软文，是逐项对照）：OpenGEO vs Topify、vs niubigeo、vs Profound/Peec。每篇必须写"对手更强的地方"。
- **提交目录**：awesome-geo-tools、awesome-seo-mcp、MCP 目录（Glama / Smithery / mcp.so）、GitHub Topics（`geo`、`generative-engine-optimization`、`ai-visibility`、`mcp`）。

### 阶段 2：可被试用（第 4–5 周）

- **免费 audit 工具**：输入 URL，输出 GEO readiness（可抓取性、结构化、引用信号、答案友好度）+ 3 条可执行建议；无需登录，限流。这是 Topify 13 个免费工具的对位产品，但开源、可自托管、结果可下载。
- **一页报告**：HTML/PDF，含原始证据链接；agency 可直接改 logo 交付（白标是 P0 的钩子）。
- **`opengeo audit` CLI**：与网页同源逻辑，输出 JSON，方便 CI 与 Agent 调用。

### 阶段 3：可被引用（第 6–8 周）

- **发布第一份公开基准**：《AI Visibility Index — Q4 2026》：选 3 个品类（如 developer tools、CRM、analytics），每类 10 个品牌 × 10 个 prompt × 4 引擎，公开方法、原始样本（脱敏）、复算脚本与限制。目标不是"权威"，是"第一个可复算的"。
- **方法论文章**：《为什么 AI 可见性数字会互相矛盾》《UI 采集 vs API 采集：差在哪》《如何验证一个 GEO 分数》。每篇给可复现步骤与代码。
- **发起讨论**：Hacker News（Show HN）、r/SEO / r/GEO / r/marketing、LinkedIn、X；准备好"我们哪里做得不好"的诚实回答。

### 阶段 4：可被采用（第 9–12 周）

- **Agency 套件**：多客户工作区、白标报告、成本核算（每客户每月模型花费）、可分享只读链接。
- **真实案例 1 个**：找一个愿意公开数据的品牌，做 30 天前后对比；写清"相关不等于因果"，列出同期其他变量。
- **发布 v1.0**：npm 包、Docker 镜像、GitHub Release、Product Hunt。PH 不是增长万能药，但能在同一天集中拿到一批英文早期用户与反向链接。
- **MCP 服务器**：让 Claude/Cursor 能直接调用 `audit`、`diagnose`、`report`，进入 Agent 生态的分发。

## 6. 内容资产清单（页面级）

| 页面 | 目标查询（英文） | 类型 | 备注 |
| --- | --- | --- | --- |
| `/vs/topify` | topify alternative, open source topify | 对比 | 逐项表 + "Topify 更强的地方" |
| `/vs/niubigeo` | niubigeo alternative, niubigeo vs | 对比 | 承认同源，讲清增量 |
| `/vs/profound` | profound alternative open source | 对比 | 面向被 $99+ 劝退的团队 |
| `/open-source-geo-tools` | best open source GEO tools | 清单 | 收录竞品，自己排最后也诚实 |
| `/benchmark/q4-2026` | ai visibility benchmark | 数据 | 可下载 CSV + 方法 |
| `/methodology` | how to measure AI visibility | 方法 | 公式、分母、失败样本处理 |
| `/audit` | free geo audit, ai visibility checker | 工具 | 无登录、可分享结果 |
| `/glossary` | GEO vs AEO vs AI SEO | 定义 | 每个术语 2 句 + 出处 |
| `/blog/*` | 长尾问题 | 文章 | 每周 1 篇，质量优先于数量 |

原则：**宁可少写，也不要写没有证据的"提升 X%"**。Topify 的博客用 1,111 篇做规模，我们拼不过数量，只能拼可复算与诚实。

## 7. 度量：什么算增长

**北极星**：OpenGEO 在目标 AI 答案中的**引用率**（被引用次数 / 监测回答数），以及**首次 audit 完成率**。

| 层级 | 指标 | 目标（90 天） | 采集方式 |
| --- | --- | --- | --- |
| 曝光 | GitHub stars | 500–1,000 | GitHub API |
| 曝光 | AI 答案提及 / 引用 | 基线 +10 个百分点 | 自己跑 OpenGEO，周更 |
| 试用 | `npx` / Docker 首次运行 | 300 | 下载计数 + 匿名 ping（需明示） |
| 激活 | 完成一次 audit | 250 | 服务端事件（自托管可选关闭） |
| 留存 | 4 周内二次运行 | 25% | 同上 |
| 收入线索 | agency 对话 | 20 | 手工记录 |
| 口碑 | 外部提及 / 反向链接 | 15 | 手工 + 搜索 |

**反指标**（变坏要停）：报告被质疑无法复算的次数、issue 中"看不懂"的比例、模型调用成本 / 客户、采集失败率。

## 8. GEO 效果怎么讲，才不撒谎

- **时间**：Topify 官方说"30–60 天出现可感知提升"，并注明模型重抓有自己的节奏——这是厂商建议，不是因果证明。
- **表述模板**："在固定 20 个 prompt、4 个引擎、同一时间窗下，提及率从 A 到 B；同期未做干预的对照 prompt 为 C；我们无法排除模型版本更新与自然波动。"
- **必须披露**：引擎、采集方式（UI/API）、地区、账号、日期、样本量、失败与排除。
- **禁止**：把一次采样写成趋势、把相关写成因果、把"被提及"写成"被推荐"、把"发布成功"写成"被引用"。

OpenGEO 自己的案例就是第一个样本：每周跑自己的品牌，公开数据和限制。这比任何"客户证言"都可信，因为可复算。

## 9. 渠道与预算

| 渠道 | 动作 | 预期 | 成本 |
| --- | --- | --- | --- |
| GitHub | README、Release、Topics、Issue 模板、good first issue | 高 | 低 |
| 目录 / awesome 列表 | 5–8 个提交 | 中高（AI 常引用列表页） | 低 |
| MCP 生态 | 发布 server，进 3 个目录 | 中（开发者） | 中 |
| HN / Reddit | Show HN + 2 个社区帖 | 高但一次性 | 低 |
| Product Hunt | v1.0 同步 | 中 | 低 |
| 对比页 / 基准 | 6–8 篇高质量页面 | 高（长期复利） | 中 |
| Agency 外联 | 20 封定向邮件 + 1 次 demo | 高（收入） | 中 |
| 播客 / newsletter | 3–5 次 | 中 | 低 |

人力假设：1 名产品/工程 + 1 名内容/增长，12 周。模型调用预算按每周 2,000 次采样估算，需按实际 provider 价格核算——**本文不给未核算的金额**。

## 10. 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 平台条款 / 反自动化 | 采集被封、项目停摆 | 优先官方 API + 自托管；UI 采集单独开关并披露风险 |
| 指标争议 | 被公开质疑不可信 | 协议、分母、失败样本全部公开；提供 replay |
| 同质化 | 被当成第 6 个 tracker | 只讲交付闭环与可复算，不讲"又一个仪表盘" |
| 上游关系 | 被指换皮 niubigeo | 明确 attribution，增量写进 README 与 release notes |
| 维护者耗尽 | 项目停滞 | 限定范围、自动化测试、拒绝无边界功能请求 |
| 增长作弊诱惑 | 短期数字好看、长期失信 | 不买 star、不刷评论、不写假案例 |

## 11. 与逆向工作的衔接：先做哪三件产品事

增长不能等产品完美，但也不能推一个"看起来能测、实际不可复算"的东西。按顺序：

1. **Recording 接进 server 并有空态**（当前模块存在、路由缺失），让"URL 资料池"真实可用。
2. **报告带证据链**：每个指标能点到原始回答与协议；导出的 HTML 含分母、排除数、未知项。
3. **`opengeo audit` + `replay` 一条命令**：这是所有内容、demo、对比页的素材来源，也是"可复算"承诺的最小证明。

这三件完成后，再谈公开基准与 PH 发布。顺序反了，就会用营销补产品的洞。
