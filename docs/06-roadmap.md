# OpenGEO 项目路线图与里程碑

> 2026-10-31 方向更新：**海外优先，国内 GEO 暂不做**，当前实施与验收以 [海外 MVP 规格](09-international-mvp.md) 的 I0–I5 为准。以 [Topify 对齐的诊断链路](08-topify-aligned-diagnostic-flow.md) 为当前产品基线。优先交付官网 URL → 自动品牌研究 → 竞品 / 问题发现 → 采集计划 → 真实采集与诊断的垂直链路；Model Gateway 是其中组件。下列 M2 状态仅表示旧 CLI 里程碑完成，不代表新的端到端诊断已完成。

更新：2026-10-30 · 负责人：千逐 · 状态：M2 完成，准备进入 M3

本文是 OpenGEO 的项目管理入口：目标、工作流、里程碑、当前迭代、待办队列、风险与完成定义。里程碑对齐 [`05-opengeo-engine.md`](./05-opengeo-engine.md) 的设计，并补充参考研究与开源发布两条工作流。

## 1. 项目目标

> 做一个以证据为中心的 GEO 交付与实验引擎：品牌事实 → 问题 → 回答证据 → 策略任务 → 内容 → 复盘，每一步可追溯、可确认、可回放，并能被其他 Agent 通过 CLI / JSON / MCP 调用。

成功不是「生成更多文章」，而是三件事：

1. 资料含糊或冲突时，系统知道什么能说、什么必须确认。
2. 平台回答变化时，能追溯原始回答、采样条件和引用 URL。
3. 做了内容或渠道动作后，能区分相关变化、自然波动和无法判断。

## 2. 工作流

| 编号 | 工作流 | 目标 | 当前状态 |
| --- | --- | --- | --- |
| W1 | 参考与竞对研究 | 摸清可借鉴的形态、可对照的能力、明确不做什么 | 🚧 进行中（Pi、niubigeo、Klepsy、geo-citation-lab、Topify 已覆盖；其他开源项目待核验） |
| W2 | 行业理解 | 建立可引用的行业事实、机制与边界 | 🚧 进行中（学术、全球流量、国内平台、实操方法、引用可靠性已覆盖；付费市场规模未核验） |
| W3 | Agent 引擎 | CLI / workspace / 证据 / Skill / 模型 / MCP | 🚧 进行中（M2 完成，M3 待做） |
| W4 | 开源叙事与发布 | README、对比、演示、许可证与发布纪律 | ⬜ 未开始（素材已备，待组织对外版本） |

## 3. 里程碑

| 里程碑 | 内容 | 验收标准 | 状态 |
| --- | --- | --- | --- |
| M0 设计冻结 | 类型、workspace、Skill 合约、报告 schema | 文档与 fixture 可审查 | ✅ 完成 |
| M1 CLI 回放 | `demo / init / run / report / replay` 跑通自进化循环 | 无网络密钥可复现 | ✅ 完成 |
| M2 导入与规划 | `import`（5 类证据）、`diagnose`、`plan`；任务绑定证据 ID；workspace 追加日志 | 每个结论可回溯 | ✅ 完成（2026-10-30） |
| M3 Model Gateway | Provider 适配、预算、重试、脱敏；确定性规则逐步替换为模型步骤 | 至少一条真实模型诊断链路，失败与费用可回放 | ⬜ 下一步 |
| M4 MCP | 暴露 diagnose / analyze_sources / plan / generate / import / report | 外部 Agent 能完成一次诊断与报告 | ⬜ 计划 |
| M5 Market Pack | `intl-open-web` 与 `china-platforms` 两套适配与假设包 | 至少各跑通一个脱敏案例 | ⬜ 计划 |
| M6 开源发布 | 独立仓库、README、演示、许可证与来源审计 | 外部可 `npm i` / `npx` 复现 demo | ⬜ 计划 |

## 4. 当前迭代（2026-10-30）

已完成：

- Topify 全站逆向：11 个主页面、84 个脚本指纹、205 条接口候选、REA 17 个不同产品脚本；[完整规格与实施顺序](../references/competitors/topify/README.md)。
- Topify 界面基线：分组导航、概览分析布局、实际数据筛选与信源页；[研究记录](research/2026-10-30-topify-ui-baseline.md)。CLI workspace 与网页数据统一尚未实现。

- `references/` 三分类：`knowledge/`、`industry/`、`competitors/`。
- 竞品对比：OpenGEO vs Pi vs niubigeo（[COMPARISON.md](../references/competitors/COMPARISON.md)）。
- 行业报告：[2026-10 GEO 行业报告](../references/industry/2026-10-GEO-行业报告.md)。
- 竞品逆向：Topify 的产品形态与 agent 架构（[topify.md](../references/competitors/topify.md)）。
- 行业材料池：Tw93 延伸阅读 11 条索引（[tw93-references-index.md](../references/industry/tw93-references-index.md)），含 CJR 引用可靠性数据。
- CLI 契约与证据 workspace：`import / diagnose / plan / report / replay`，`project.json` + `evidence/*.jsonl` + `runs/index.jsonl` + `reports/`。
- 测试：`npm run check` 19/19 通过；端到端冒烟与 replay 确定性校验通过。

下一迭代（M3）：

1. Model Gateway 接口与 Provider 适配（先 OpenRouter，再直连）。
2. 预算 / 重试 / 超时 / 密钥脱敏策略进入运行器。
3. 把 `selling-point-mining` 与 `platform-content-writing` 的语义步骤接到模型，保留规则回放作为降级路径。
4. 记录每步的 provider、model、prompt 版本、费用、延迟与失败原因。

## 5. 待办队列

### P0

- [ ] M3 Model Gateway：Provider 接口 + 预算/重试/脱敏。
- [ ] 把模型步骤接入现有 workspace，运行记录保留规则回放降级路径。

### P1

- [x] geo-citation-lab 记录（[note](../references/industry/geo-citation-lab.md)）；原报告的 602 prompts / 各百分比待核验。
- [x] Topify 对标与 agent 架构逆向（[topify.md](../references/competitors/topify.md)）。
- [x] Tw93 延伸阅读索引（[tw93-references-index.md](../references/industry/tw93-references-index.md)），含 CJR 1,600 次引用测试。
- [ ] 其他开源 GEO 项目核验：Elmo、Aperture、OneGlanse、AiCMO、Citatra（niubigeo 的 `CAPABILITY_MATRIX.md` 提到过，逐个确认仓库、license、能力，再决定是否进 `references/competitors/`）。
- [ ] 国内平台样本：把 Klepsy 的引用来源 TOP40 作为 `china-platforms` 的初始假设，补可复现的采样记录。
- [ ] 付费行业报告核验：GII Research 等市场规模，只引用可核实数字。

### P2

- [ ] M4 MCP server。
- [ ] M5 Market Pack 两套适配。
- [ ] M6 开源发布清单与对外 README。

## 6. 风险与边界

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 平台规则被写成硬编码结论 | 误导内容与交付 | 只写带样本区间的 ChannelHypothesis |
| 把厂商宣传数据当成验证结果 | 对外声明不可信 | Klepsy 等案例一律标「对方自述，未独立验证」 |
| 模型步骤破坏确定性 | 运行不可回放 | 规则回放保留为降级路径；记录 prompt 版本与输入 |
| 范围膨胀成「又一个 GEO SaaS」 | 失去差异化 | 守住 CLI / 证据 / 确认门三条线 |

## 7. 完成定义（Definition of Done）

一个里程碑算完成，需同时满足：

1. 有可运行的 CLI 命令或接口，不只是文档。
2. 有自动化测试或端到端冒烟。
3. 失败路径、费用/预算、证据保留有明确记录。
4. README / docs 与实际行为一致。
5. 不新增未经核实的平台规律或效果声明。

## 8. 参考材料入口

- 竞品：[COMPARISON.md](../references/competitors/COMPARISON.md)、[pi.md](../references/competitors/pi.md)、[niubigeo.md](../references/competitors/niubigeo.md)、[topify.md](../references/competitors/topify.md)
- 行业：[2026-10 GEO 行业报告](../references/industry/2026-10-GEO-行业报告.md)、[Tw93 参考笔记](../references/industry/tw93-ai-visibility.md)、[Tw93 延伸阅读索引](../references/industry/tw93-references-index.md)、[Klepsy 对照](../references/industry/klepsy.md)、[geo-citation-lab](../references/industry/geo-citation-lab.md)
- 知识：[geo-standards.md](../references/knowledge/geo-standards.md)
- 认知：[GEO 五层认知](./07-geo-five-layers.md)
