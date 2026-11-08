# OpenGEO 文档入口

更新：2026-11-08。这个入口回答三个问题：项目现在做什么、哪些规格仍然生效、下一步谁做什么。历史方案只做背景，不覆盖本页和三份生效规格。

## 阅读路径

| 场景 | 先读 | 用途 |
| --- | --- | --- |
| 判断产品边界和当前能力 | [产品](产品.md) | 定位、要做 / 不做、当前能力和未实现项 |
| 执行官网研究或 AI 回答采样 | [采集](采集.md) | 输入校验、Xue 规则、证据、失败口径和验收 |
| 交付品牌案例 | [案例交付](案例交付.md) | Campaign 合约、指标口径、松灵案例状态和复查边界 |
| 查历史方案或研究 | [archive/](archive/README.md) | 只作背景，不代表当前计划 |
| 查下一版与长期 milestone | [版本待办](todo/README.md) | 唯一版本队列、复选框、依赖、面试最小交付与长期候选 |
| 查工程任务 | [活跃任务](#任务看板) | 任务目标、结果、阻塞和待办 |

## 当前目标

2026-11-08 最新排序：**先数据分析看板与调研报告，再迭代策略和内容生成**。当前实施见[数据分析任务](OPENGEO-20261108-ANALYTICS-REPORT/TaskInfo.md)。可视化改进不替代净题集与事实质量。

把「问题集 → 多入口采样 → 可复核 GEO 报告」跑通，并把松灵机器人做成可复测案例。当前优先级不是扩展平台数量，而是先冻结问题、品牌事实和别名，保证每一轮数据可比较。

## 任务看板

| 任务 | 状态 | 下一步 | 记录 |
| --- | --- | --- | --- |
| [工程细节与松灵补测](OPENGEO-20261108-ENGINEERING/TaskInfo.md) | 三项修复完成；新采样不足 | 修复已测试并回用；补测受地区限制与空回答中断，需恢复通道后重测 | [Report](OPENGEO-20261108-ENGINEERING/Report.md) / [Todo](OPENGEO-20261108-ENGINEERING/Todo.md) |
| [数据分析看板与调研报告](OPENGEO-20261108-ANALYTICS-REPORT/TaskInfo.md) | 已完成本轮增量 | 共用分析投影、分组/覆盖/信源与 Markdown/HTML 导出 | [Report](OPENGEO-20261108-ANALYTICS-REPORT/Report.md) / [Todo](OPENGEO-20261108-ANALYTICS-REPORT/Todo.md) |
| [国内外竞品与版本规划](OPENGEO-20261108-COMPETITOR-ROADMAP/TaskInfo.md) | 研究与规划已完成，功能未实施 | 按版本队列推进；先净基线与事实，再策略与内容 | [Report](OPENGEO-20261108-COMPETITOR-ROADMAP/Report.md) / [里程碑](todo/版本里程碑.md) |
| [docs 项目化管理重构](OPENGEO-20261108-DOCS-PROJECT-MANAGEMENT/TaskInfo.md) | 已完成 | 后续文档变更先更新本入口和对应生效规格 | [Report](OPENGEO-20261108-DOCS-PROJECT-MANAGEMENT/Report.md) |
| [V5 问题集校验与污染 run 处理](OPENGEO-20261108-V5-QUESTION-VALIDATION/TaskInfo.md) | 进行中 | 标记污染 run；导入 10 题净题集；入库公司简介；冻结品牌别名后重跑 | [Todo](OPENGEO-20261108-V5-QUESTION-VALIDATION/Todo.md) |
| [架构评估、品牌资料入口与面试证据](OPENGEO-20261108-ARCHITECTURE-INTERVIEW/TaskInfo.md) | 阶段完成，后续进行中 | 本地来源入口已实现；先完成 V5 可信基线，再迭代策略与内容语义质量 | [Report](OPENGEO-20261108-ARCHITECTURE-INTERVIEW/Report.md) / [Todo](OPENGEO-20261108-ARCHITECTURE-INTERVIEW/Todo.md) |

跨任务的版本优先级只在 [版本里程碑](todo/版本里程碑.md)维护；各任务 Todo 保留详细验收与执行记录，不另开路线图。下一版与长期候选尚未因规划完成而实施。

任务 ID 使用 `OPENGEO-YYYYMMDD-主题`。每个任务目录至少包含：

| 文件 | 时机 | 内容 |
| --- | --- | --- |
| `TaskInfo.md` | 任务创建时 | 背景、目标、影响范围、决策和交接文件 |
| `Todo.md` | 任务未完成时 | 按 P0 / P1 / P2 排列的可执行待办和完成定义 |
| `Report.md` | 任务或阶段完成时 | 变更、验证、事故评估、风险和剩余工作 |
| `Comment.md` | 需要外部沟通时 | 可直接复制的任务进展草稿 |

## 项目管理规则

1. **先更新事实，再更新结论**：能力状态写进三份生效规格，任务过程写入任务目录，不在归档文档里继续追加新事实。
2. **P0 才能阻塞基线**：影响数据有效性、事实来源、协议可比性或安全边界的事项列为 P0。
3. **完成必须有证据**：代码任务记录测试命令和结果；采样任务记录入口、问题版本、协议、失败原因和证据路径。
4. **失败不进分母**：`null`、失败、登录墙、截断和未知都不等于 0%，也不得被后续成功样本隐式覆盖。
5. **任务结束再归档**：`Report.md` 写完并把剩余事项拆到新的 P0/P1 后，任务才可标记完成。
6. **困难也是交付证据**：重要失败在所属任务 Report 记录场景、原始证据与事实级别、候选解释、方案取舍、验证结果、遗留与面试边界。用户回忆标明来源，不编耗时或提升数字；不另开重复故事账本。

## 当前项目状态

| 维度 | 状态 | 判断依据 |
| --- | --- | --- |
| 产品形态 | 本地单用户 CLI + 本地 Web | [产品](产品.md) |
| 官网研究 | 可用，失败显式 | [采集](采集.md) |
| 补充品牌资料 | 官网、文本、文字 PDF 最小入口可用；原文事实仍需人工确认 | [资料入口任务](OPENGEO-20261108-ARCHITECTURE-INTERVIEW/Report.md) |
| ChatGPT 网页采样 | 工程链路已有，真实端到端仍需按任务验收 | [采集](采集.md) |
| 品牌诊断 | 问题集净化已修复；净 v5 基线未重跑 | [V5 任务](OPENGEO-20261108-V5-QUESTION-VALIDATION/Report.md) |
| 案例交付 | 首轮有部分基线；公司 PDF、别名和第 2 轮未完成 | [案例交付](案例交付.md) |
| 每日调度与发布复测 | 未实现 | [产品](产品.md) |

## 目录结构

```text
docs/
  README.md                 项目管理入口和任务看板
  产品.md                    生效产品规格
  采集.md                    生效采集规格
  案例交付.md                 生效案例规格
  todo/                     版本规划唯一队列（README + 版本里程碑）
  OPENGEO-*/                 工程任务记录
  archive/                   历史方案、路线图和研究
```

