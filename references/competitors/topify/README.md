# Topify 全站逆向与 OpenGEO 复用规格

日期：2026-10-30（2026-11-01 复核）。对象是 Topify 登录后的整个产品；REA 是本次逆向工具。用户决策：OpenGEO 先采用它的产品框架和设计，有实际必要再优化。

2026-11-01 复核结论：静态接口层未变化（API 客户端 chunk 字节一致），但登录后页面本轮不可达；新增权威证据源为公开 API 文档。详见 [状态复核](../../../docs/research/2026-11-01-topify-rea-status.md)。

2026-11-02 更新：已通过 ego lite 复用登录态完成登录后复核（82/84 chunk 字节一致、IA 改为 Analyze / Tracking 嵌套），见 [11 登录后产品复核](11-logged-in-reverse-2026-11-02.md)。

## 阅读入口

| 文档 | 用途 |
| --- | --- |
| [01 产品与页面](01-product-and-pages.md) | 全站模块、主要状态、交互、关键用户路径 |
| [02 前端与设计](02-frontend-and-design.md) | 实测布局、视觉 token、组件、缓存、响应式 |
| [03 接口与数据](03-api-and-data.md) | 内部 BFF / 公开 API、实体关系、响应结构 |
| [04 Agent 与工作流](04-agent-and-workflows.md) | 双流协议、审批、恢复、内容与论坛执行链 |
| [05 指标与采集](05-metrics-and-collection.md) | 指标口径、采样、Fanouts、冲突与未知 |
| [06 OpenGEO 落地](06-opengeo-implementation.md) | 当前差距、建议目录与数据契约、开发顺序与验收 |
| [07 证据与复现](07-evidence-and-reproduction.md) | REA 成功记录、分析覆盖、文件指纹、复现方法 |
| [08 Prompts 监控差距](08-prompts-monitoring-gap.md) | Prompts 页的三层结构、逐列差距矩阵、P0 落地顺序与验收 |
| [09 创建工作空间](09-workspace-onboarding.md) | 海外建档、自动研究、问题筛选、bootstrap 状态与恢复 |
| [10 公开 API 与服务逻辑](10-public-api-and-service-logic.md) | 厂商自述的实体、指标公式、Actions 状态机、Webhook、计费与增长机制（2026-11-01） |
| [11 登录后产品复核](11-logged-in-reverse-2026-11-02.md) | 登录态下的 IA、11 个页面、31 个内部 API、响应结构与 REA 证据（2026-11-02） |
| [白话说清 Topify](../../../docs/11-topify-flow-and-geo-mechanics.md) | 面向非技术的完整流程、GEO 优化、检测与定时采集解释 |

2026-10-30 轮把「概览页视觉基线」扩展到产品、页面、交互、接口、数据、Agent、指标、权限、计费、设计和开发映射。交付是可供实现的规格与证据包；没有把尚未开发的功能标为已完成。

## 本轮覆盖

- 11 个主页面全部读取：Agent、Overview、Prompts、Recording、Sources、Fanouts、Actions、Competitors、Members、Project、Billing。
- 首轮加载失败的 Sources、Members、Billing 已重试，取得可用页面。Prompts 此前出现过应用错误，本轮可正常读取。
- 探查 Agent 的 Research / Content / Analytics / Optimize & publish 入口、问题新增弹窗、竞品新增弹窗，以及 Agent Settings 的八个分区。
- 保存 84 个公开分发脚本的文件指纹；静态提取产生 **205 条接口候选记录**。它们包含重复方法、动态片段、旧版本和未观测路径，不能理解为 205 个已验证 API。
- 跨页面网络窗口记录 **36 组 method + path**；64 份去值响应结构保留空数组的「未观察」状态。异步请求可能跨越导航，不能仅凭页面归属断定请求发起方。
- REA 完成三轮运行，其中两轮分析 13 个页面 / 布局 / 客户端文件及 4 个工作流文件，共 **17 个不同脚本**；另有早先 2 文件概览校验。
- 全量产品轮解析 13/13 文件、零 parse failure。语义图达到设置的 50,000 节点上限，覆盖为 partial；成功执行不等于恢复了全部语义。
- **2026-11-01 复核**：公开入口可达 36 个客户端脚本，其中 28 个与上表指纹逐字节相同、0 个变化、8 个新增；登录后的 48 个文件（含产品页面 chunk）本轮不可达。全目录 REA 运行超时（13/37），聚焦 3 个文件的运行完成（303 findings、0 parse failure）。另取得公开 API 文档 294,643 字节、13 个免费工具与 credits 定价。

## 结论

Topify 的产品由三条相连的链路构成：

1. 网站、品牌、问题、竞品的初始化与持续采样。
2. 品牌 / 主题 / 问题 / 域名 / URL / 子查询的交叉分析。
3. 把发现转成 Action，通过 Agent、审批、产物和 CMS 执行，再进入后续采样。

OpenGEO 应复用这套信息架构和工作方式。现有工作台只实现其中部分环节：概览外观、问题编辑、证据检查、规则任务、草稿和发布登记。聊天式 Agent、竞品实体、独立网址池、Fanouts、后台调度、审批恢复和统一 workspace 仍需要实作。

## 证据分级

- **UI**：本次登录态页面直接观察。
- **NET**：页面自然产生的网络请求、状态与去值响应结构。
- **JS**：公开分发脚本的字面量、AST 和 REA 静态关系。
- **DOC**：官方文档自述，不等于已验证服务端实现。
- **DESIGN**：OpenGEO 建议实现；不是从 Topify 恢复的私有代码。
- **UNKNOWN**：现有证据不足。

服务端源码、数据库 DDL、模型系统提示词、采样集群部署、商业效果归因不在可恢复范围内。完整脚本、原始网络内容、账号信息和页面截图留在临时目录，不随本证据包分发。

## 关键官方入口

[Topify 产品](https://app.topify.ai/) · [文档索引](https://docs.topify.ai/llms.txt) · [Agent 指南](https://docs.topify.ai/guides/using-ai-agent) · [公开 API](https://docs.topify.ai/api-reference/introduction) · [REA](https://github.com/morluto/rea)
