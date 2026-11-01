# 竞品对比｜OpenGEO vs Pi vs niubigeo

> 结论先行：**Pi 给的是「最小可扩展 harness」的形态，niubigeo 给的是「可复现的 AI 可见性证据」，OpenGEO 要做的是把两者接到「GEO 交付闭环」上。** 三者不是同一赛道的直接竞品，而是「形态参考 + 能力参考 + 交付层」的关系。

本文基于本地 `vendor/niubigeo/`（v0.3.2，commit `dd51eedc…`）源码与文档、Pi 仓库 `main` 分支提交 `19ce8059…` 的阅读，以及本仓库 `docs/05-引擎设计.md`。竞对事实只写到可核对的范围，不把推断写成对方实现。

## 1. 三个项目各自是什么

| | OpenGEO（我们） | Pi | niubigeo（牛比 GEO） |
| --- | --- | --- | --- |
| 一句话 | 以证据为中心的 GEO 交付与实验引擎 | 通用 AI agent 工具包（unified LLM API、agent loop、TUI、coding agent CLI） | 开源 GEO 研究 / 测量工具（AI visibility、可复现测试、竞对与证据） |
| 仓库 | 本仓库（OpenGEO 0.1.0 原型 + opengeo CLI） | <https://github.com/earendil-works/pi> | <https://github.com/Albert-Weasker/niubigeo> |
| License | Apache-2.0 | MIT | Apache-2.0 |
| 版本 / 状态 | 0.1.0 原型 + 下一阶段引擎设计 | 成熟工具包 | v0.3.2，已执行 20 个真实案例 |
| 默认形态 | CLI / JSON / MCP 优先；Web 仅可选宿主 | CLI / TUI / JSON / RPC / SDK | Web workbench + Docker 自托管 |
| 核心问题 | 客户资料 → 问题 → 证据 → 内容 → 发布 → 复盘，怎样每一步都有据可查 | 怎样用最小 harness 组合模型、工具、Skill 和多种宿主 | 模型到底说了什么、引用了谁，能不能重复验证 |

## 2. 能力对比

| 维度 | OpenGEO | Pi | niubigeo |
| --- | --- | --- | --- |
| 定位 | GEO 交付与实验引擎（领域专用） | 通用 agent 工具包（领域无关） | GEO 研究 / 测量工具（领域专用） |
| 证据模型 | Claim、QuerySetVersion、MeasurementProtocol、Sample、Attempt、Citation、Judgment、Action、Publication、Experiment、Run | 会话、运行、事件、工具调用（通用契约） | 实体、问题、运行、引用、快照、报告；指标可从证据重算 |
| Skill / 扩展机制 | `SKILL.md`（Agent Skills 兼容）+ 8 个语义 Skill + 7 个循环 Skill | 按需 Skill（name + description）+ npm 包分发 | 内置模块 + 模板；无独立 Skill 协议 |
| 采样 / 模型接入 | Model Gateway（规划中）+ 国内外 Market Pack | 统一 LLM API（pi-ai），多宿主共享 | Provider 目录，16 个平台快捷连接，混用 OpenRouter / 直连 / 自定义端点 |
| 内容生产 | 有（platform-content-writing，只使用已确认事实） | 通用（coding 场景） | 无（只测量，不生成内容） |
| 发布 | 发布登记 + 人工 / API 分状态 | 无 | 无 |
| 监控 | sentiment-monitoring（计划中） | 无 | 关键词监控（v0.3，可配置频率、Diff View） |
| 复盘 / 自进化 | iteration-retrospective + self-evolution（下一版问题库提案） | 无 | 历史运行对比、变化查看 |
| 人工确认门 | 事实 / 问题 / KPI / 发布四道确认门 | 无（通用工具不强加流程） | 问题确认、报告；无发布门 |
| 数据存储 / 回放 | 本地 workspace + append-only JSONL，可 diff、可进 Git | 会话 / 任务持久化 | 本地文件存储 + 快照，支持重复运行 |
| 当前实现程度 | OpenGEO 0.1.0 原型跑通回放案例；opengeo CLI 是**确定性规则版本**，暂不调用模型 | 成熟 | 成熟，且公开了详细的已知限制 |

## 3. Pi：借形态，不借定位

Pi 对我们的价值是**架构形态**，不是领域能力。它证明了一件事：核心可以很小，能力通过 Skill、工具、Adapter 和包扩展，CLI / JSON / RPC / SDK 共享同一个引擎。

我们明确借鉴：

- 最小 harness：引擎不写死成某个网页应用。
- 按需 Skill：只暴露 `name` 和 `description`，需要时才加载完整说明。
- 多宿主：CLI、JSON、MCP、SDK 共用一个内核。
- 显式契约与可回放运行：状态、事件、工具参数都要有 schema。

我们不借鉴：

- 不做通用 coding agent。Pi 解决「怎样当一个好用的 agent 运行时」，我们解决「GEO 交付怎样有证据、可确认、可复盘」。
- 不把 Pi 的通用会话模型当成 GEO 证据模型。GEO 需要不可变的事实、问题版本、采样协议、引用和发布状态。

**一句话**：Pi 是「怎么搭」，OpenGEO 是「拿它搭什么」。

## 4. niubigeo：借证据，补交付

niubigeo 是和我们最接近的项目，也是我们读得最细的竞对。它的强项非常明确：

- 多 Provider 目录与真实采样，原始回答、引用、失败全部保留。
- 引用、检索结果、grounding、正文链接分开，不混为一谈。
- 可重复运行与历史对比；指标可以从存储的证据重算。
- 一份**非常诚实**的 `docs/limitations.md`，把统计口径、重试混用、预算、调度、发布边界逐条写清。
- 20 个真实案例，公开归档。

它没有做的事，恰好是我们的空间：

| niubigeo 不做 / 做得少 | OpenGEO 要补的 |
| --- | --- |
| 只回答「模型说了什么、引用了谁」 | 把观察接到「诊断 → 卖点 → 内容 → 发布 → 监控 → 复盘 → 下一轮」 |
| 无内容生产 | 平台内容草稿，且只使用已确认事实 |
| 无发布工作流 | 发布登记，发布 / 可访问 / 被引用分状态 |
| 无卖点拆解、渠道假设 | 关键词 × 卖点矩阵、ChannelHypothesis |
| 无自进化提案 | 下一版问题库与内容方向，仍需人工确认 |
| Web workbench + Docker 为主 | CLI / JSON / MCP 优先，可被其他 Agent 调用 |

**一句话**：niubigeo 是「测量仪」，OpenGEO 是「交付系统」。我们不和它比谁接的平台多、谁的图表全，而是比谁的流程能闭环、每一步能否回到证据。

## 5. OpenGEO 的差异化

1. **证据优先，而不是分数优先**：每个结论都能回到原始回答、采样条件、引用 URL。拒绝「一个黑盒 GEO 分数」。
2. **确认门是骨架**：事实、问题、KPI、发布四道人工确认门，模型只能建议，不能绕过。
3. **CLI / MCP 优先**：可以被 Codex、Claude、Pi 等 Agent 当成工具调用，而不是又一个要人登录的 SaaS 面板。
4. **国内外差异建模为 Adapter 与假设**：不把「豆包偏好抖音」「海外只看官网」写成平台规律，而是记成带样本区间的 ChannelHypothesis。
5. **可回放**：固定输入、固定规则即可复现一次运行，适合开源案例和 CI。

## 6. 我们明确不做什么（避免同质化）

- 不做「又一个 GEO 排名 / 分数看板」。
- 不承诺平台权重、排名保证、成交归因。
- 不默认自动发布、不默认自动采集消费级 AI 网页。
- 不把 niubigeo 的 Provider 能力当成整个引擎，只作为 Model Gateway 与采样适配参考。
- 不把 Pi 的通用能力照搬成「什么都能干」的定位。

## 7. Topify：商业侧的强对标

2026-10-30 补充。Topify（<https://topify.ai/>）不是开源项目，而是商业 GEO / AI Search Visibility SaaS，是目前看到的产品化程度最高的对标对象。完整逆向见 [topify.md](./topify.md)。

- **它是什么**：跟踪 ChatGPT、Perplexity、Google AI Overview、Gemini、Claude 五个平台；浏览器自动化采集真实 UI，Claude 走官方 API；提供 prompt 发现、citation/source 分析、AI Agent 执行到 CMS（WordPress / Shopify / Framer）。
- **它比我们强的地方**：真实 UI 采样、prompt 4 类意图发现、域名级 citation 分析、**可执行的 action 状态机**（suggested → accepted → in_progress → completed/ignored，带 checkpoint webhook 与 artifacts）、agentic setup（Claude Code / Cursor 直接建项目）、完整的 credits 商业闭环。
- **它不可验证的地方**：效果归因仍是「30–60 天」，无对照；GEO 8 项技术的提升数字与论文、Tw93 转述三处口径不一致；浏览器采样的合规与稳定性未公开；案例与评价无法独立核实。
- **我们的差异化不变**：开源、证据中心、确认门、可回放、CLI / MCP、不绑定 CMS、不承诺效果。

**结论**：Topify 证明「追踪 + Agent 执行」这个产品形态成立，也暴露了我们最该补的两件事——**可执行的 action 工作流**和**真实 UI 采样适配器**。

## 8. 来源与边界

- Pi：<https://github.com/earendil-works/pi>，MIT License，读取 `main` 提交 `19ce8059c3322f4172f24f0e25aa40bf0bdac62e`（2026-10-29）。
- niubigeo：<https://github.com/Albert-Weasker/niubigeo>，Apache-2.0，v0.3.2，commit `dd51eedc8e400006755639c0cb332a7fa1a71420`；本地快照 `vendor/niubigeo/`。
- 本文只描述上述源码与文档中可核对的能力；对方未公开的内部实现、权重和商业数据不在推断范围内。
- 对比表中的「OpenGEO」列描述的是设计目标与当前实现状态，二者不一致处已在「当前实现程度」一行注明。
