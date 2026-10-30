# OpenGEO Engine

> 2026-10-31 产品方向更新：海外优先，暂不做国内 GEO。当前海外 MVP 规格见 [实施规格](docs/09-international-mvp.md)。采用 Topify 的 Web Agent 驱动完整诊断链路，从官网自动研究品牌、发现竞品与问题，再采集、诊断、执行与复测。人工审核关键产物，不承担默认前置数据录入。CLI / MCP 共享引擎；具体设计与当前实现边界见 [最新链路设计](docs/08-topify-aligned-diagnostic-flow.md)。下文 CLI 优先与旧工作台定位保留为当前原型背景，尚未完成新链路实现。

**一个 CLI 优先的开源 GEO 交付与实验引擎：品牌事实 → 问题库 → 回答证据 → 关键词 / 卖点 → 平台内容 → 发布计划 → 舆情监控 → 复盘 → 自进化提案。**

当前版本 `0.2.0`。项目吸收 [Pi](references/competitors/pi.md) 的轻量 Agent harness 形态和 [niubigeo](references/competitors/niubigeo.md) 的证据测量思路，但不把两者混成一个通用 Agent 或测量面板；OpenGEO 的核心是 GEO 交付闭环。

## 快速开始

```bash
npm ci
npm run opengeo -- skills
npm run opengeo -- demo
npm run opengeo -- init ./my-opengeo-project
npm run opengeo -- import ./my-opengeo-project ./answers.jsonl --type observations
npm run opengeo -- diagnose ./my-opengeo-project
npm run opengeo -- plan ./my-opengeo-project
npm run opengeo -- evolve ./my-opengeo-project
npm run opengeo -- confirm ./my-opengeo-project <candidate-query-id> --status confirmed --priority P1
npm run opengeo -- replay ./my-opengeo-project
```

`evolve` 只应用上一轮生成的提案，候选问题仍是 candidate；`confirm` 是显式人工动作，会把指定问题改为 confirmed 或 retired，并递增问题库版本。所有演化和确认都会追加到 `evidence/evolutions.jsonl` 与 `evidence/confirmations.jsonl`。

工作区结构：

- `project.json`：当前物化视图。
- `evidence/*.jsonl`：导入、演化、确认的追加审计日志。
- `runs/*.json`：完整输入快照与执行轨迹。
- `reports/*.md|json`：可读报告与白名单导出。

新架构见 [OpenGEO Engine 顶层设计](docs/05-opengeo-engine.md)；从森博交付链路反推的五层见 [关键链路和层级](../resume/02-面试案例/Cenbo森博营科/关键链路和层级.md)。

当前规则版本不调用模型、不自动发布；输出可回放报告和待确认的演化提案。参考架构记录在 [references/](references/README.md)。

## 与 Pi、niubigeo 的关系

- **Pi 是形态参考**：最小可扩展 harness、按需 Skill、CLI / JSON / RPC / SDK 多宿主。它不是 GEO 产品。
- **niubigeo 是测量参考**：多 Provider、原始回答、引用、失败样本和历史运行。它重点是“模型说了什么、引用了谁”，不是完整交付系统。
- **OpenGEO 是交付闭环**：把测量结果接到事实确认、卖点拆解、平台写作、发布登记、舆情风险、复盘动作和下一版问题库。完整对比见 [COMPARISON.md](references/competitors/COMPARISON.md)。

## 旧原型：CiteKeel 工作台

CiteKeel / 引舟保留为 0.1.0 证据模型测试台，用于查看旧案例与浏览器验证。它不再是 OpenGEO 的默认产品形态。

## 工作台界面基线

全站参考已扩展为 [Topify 全站逆向与 OpenGEO 复用规格](references/competitors/topify/README.md)：覆盖页面、接口、数据模型、双流 Agent 工作流、指标与开发验收；REA 已成功分析 17 个不同产品脚本。规格中的待实现能力仍与当前代码分开标明。

2026-10-30 起，按 Topify 概览页的框架和设计改造本地工作台：分组侧栏、筛选器、趋势 / 模型表现、Agent 动作和主题表现，接现有 API 与证据。先采用这套框架，后续按需要优化。仍未统一 CLI workspace 与网页数据存储。研究与 REA 执行边界见 [界面基线记录](docs/research/2026-10-30-topify-ui-baseline.md)。

## 直接运行

需要 Node.js 22.13+、npm。无需密钥即可回放三个基础案例和一个新 API 观察案例。

```bash
npm ci
npm run demo
npm start
```

打开 [本地工作台](http://127.0.0.1:8847)。

`npm run demo` 会实际执行本地工作流，生成三个案例的运行记录与报告；它不会重新调用模型。报告保存在 `data/citekeel/reports/`，项目和历史快照保存在 `data/citekeel/`。

## 先试这些案例

| 案例 | 输入 | 可以检查什么 |
| --- | --- | --- |
| 衡川传感 | 全新虚构的制造业资料与 20 条合成回答 | 产能口径冲突、失败样本、事实确认、内容阻塞与重新生成 |
| PostHog | niubigeo R04 的 27 条公开历史测量 | 原始回答、3 条解析失败、3 个 Provider 引用、12 个正文链接 |
| NiubiStar | niubigeo R01 的 3 条公开历史测量 | 少样本情况下的无引用、证据缺口与内容边界 |
| PostHog 新 API 案例 | 2026-10-29 实际取得的两条未联网回答 | 新采样、模型策略、通过事实引用检查的模型草稿 |

推荐体验路径：选衡川传感 → 运行 Agent → 在品牌事实中选择有来源的产能口径 → 重新运行 → 查看内容草稿和策略任务 → 导出报告。此前的阻塞记录仍保留在运行历史中。

## 用自己的品牌

1. 点击“新建项目”，填写品牌、行业和逐行的事实资料。
2. 在“品牌事实”核对并确认资料，在“问题空间”编辑问题。
3. 选择“导入回答 JSON”分析已有原文，或配置模型后选择“用模型实测”。
4. 查看任务关联的证据，编辑内容并保存审核状态。
5. 人工发布后登记链接；登记不代表已经访问、被索引或被引用。

导入格式：JSON 数组，每项至少包含 `question` 与 `answer`，可附 `model`、`observedAt`、`runGroup`。工作台可以下载格式示例。手工导入的链接按普通链接处理，不凭空提升为 Provider 引用。

## 两种执行方式

**案例回放：**规则规划器检查事实、问题、归档回答和来源，生成关联输入 ID 的行动任务与内容模板。执行轨迹明确显示本地规则或数据回放，没有隐藏模型调用。

**实时模型：**通过上游 ProviderCatalog 发起新 API 请求。采样模型只收到选定问题；策略步骤根据事实与诊断规划任务，验证器拒绝不存在的证据 ID；内容步骤只使用已确认事实。模型步骤失败时，回退及原因保留在轨迹中。

工作台支持 OpenRouter、OpenAI、DeepSeek、Perplexity、Gemini 和 Anthropic 的上游适配入口。填写当前账号可用的模型 ID。本机已实际验证 OpenRouter 的 `qwen/qwen3.5-flash-02-23` 未联网通路，工作台预填此模型。其他模型、地区和账号仍需分别验证。

每轮最多 5 个采样问题，全部模型调用最多 8 次，HTTP 自动重试限制为一次。费用返回未知或请求失败时停止后续调用，保留现有结果。请求数限制不等于精确的金额保证。

密钥可在工作台输入，仅留在页面内存并随本次请求使用；也可在本地 `.env` 配置。不要把 `.env` 提交到仓库。

```bash
cp .env.example .env
```

## Agent 思路

一个总控协调八项 Skill，用显式状态控制执行：

- `brand-grounding`：事实、来源与冲突。
- `query-discovery`：问题模板与版本确认，首版不推测搜索量。
- `visibility-audit`：回答采集与可检查的文本判定。
- `source-analysis`：引用、检索结果、grounding 和正文链接分开。
- `strategy-planning`：基于输入证据生成任务。
- `content-engineering`：只使用确认事实，输出草稿与复核提示。
- `monitoring-analysis`：按模型、问题类型和批次展示分组。
- `experiment-retrospective`：导出结论、原文、任务与限制。

Skill 约定在 [skills/](skills/README.md)，实现位于 `src/citekeel/`。前端是无构建依赖的 HTML/CSS/JavaScript。

## 验证

```bash
npm run check
npm run test:browser
npm run check:upstream
```

浏览器检查使用 Google Chrome，并在 `8857` 端口及独立的 `data/browser-tests/` 目录运行。上游检查会安装其锁定依赖并执行原有本地检查，部分需要历史实测文件的用例按上游规则跳过。

本版已经运行三个案例，验证归档转换、事实阻塞、确认后生成内容、真实 HTTP 流程、模型传输 mock、导出与移动端。新增 12 项核心检查与 4 项浏览器检查通过；上游本地检查 280 项通过、10 项按上游条件跳过。实际产物见 [案例报告](examples/citekeel-runs/README.md)。另已使用现有 OpenRouter 配置完成一次有效的新 API 基线：两条采样、模型策略与模型内容共 4 次调用，Provider 返回费用合计约 $0.00091。它未启用联网搜索，不属于线上 GEO 效果实验。失败与修正记录见 [实时验证记录](examples/citekeel-runs/live-summary.json)。

## 代码与数据

- `src/citekeel/`：Agent、模型会话、存储、诊断、报告、API 与 CLI。
- `src/opengeo/`：CLI 引擎、workspace 存储（evidence / runs / reports）与自进化循环。
- `public/`：试用工作台。
- `skills/`：八项可移植能力约定。
- `examples/upstream/`：两个有明确来源的上游历史归档。
- `examples/live-posthog/`：本次真实 API 观察的可回放输入。
- `vendor/niubigeo/`：固定提交的完整上游快照，不含 Git 历史。
- `data/`：本地项目、报告和运行结果，已忽略版本控制。

服务默认只监听 `127.0.0.1`。这是单人本地原型，尚未提供多人账户、自动对外发布、自动采集消费级 AI 网页、持久任务调度或完整的内容事实核验。

## 设计与实验

- [项目路线图与里程碑](docs/06-roadmap.md)
- [GEO 五层认知](docs/07-geo-five-layers.md)
- [顶层产品与架构](docs/01-product-and-architecture.md)
- [上游集成设计](docs/02-upstream-and-delivery.md)
- [实验与脱敏协议](docs/03-experiments-and-public-demo.md)
- [当前原型的实际边界](docs/04-local-prototype.md)
- [公开归档核验](docs/research/2026-10-29-archive-audit.md)

源代码按 Apache-2.0 提供；上游来源与原始许可证一并保留。没有复制真实客户文件或原团队的私有代码。
