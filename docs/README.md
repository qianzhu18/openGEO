# docs 索引

给人读的文档都在这里，按"先读 → 产品 → 增长 → 设计与研究"排列。代码在 [`../code`](../code)，参考资料在 [`../references`](../references)。

## 先读这三篇

| 文档 | 一句话 |
| --- | --- |
| [13 OpenGEO 怎么做](13-opengeo-product-plan.md) | 定位、三件套、90 天路线、未来两周任务 |
| [11 Topify 怎么运转](11-topify-flow-and-geo-mechanics.md) | 完整用户体验、GEO 优化、检测口径、定时采集 |
| [12 GEO 交付与采集架构](12-geo-delivery-and-collection-architecture.md) | 建站/内容/平台分工、抓数与发布边界、要不要云电脑 |

## 产品与实施

| 文档 | 内容 |
| --- | --- |
| [09 海外 MVP](09-international-mvp.md) | I0–I5 范围、当前实现与明确差距 |
| [08 Topify 对齐的诊断链路](08-topify-aligned-diagnostic-flow.md) | URL → 研究 → 问题 → 采集 → 诊断 → 执行 |
| [06 路线图](06-roadmap.md) | 里程碑、工作流、待办队列、风险 |
| [07 GEO 五层](07-geo-five-layers.md) | 从关键词到引用的分层理解 |
| [05 OpenGEO Engine](05-opengeo-engine.md) | 引擎设计、证据模型、CLI 契约 |
| [01 产品与架构](01-product-and-architecture.md) | 早期产品定义与架构 |
| [02 上游与交付](02-upstream-and-delivery.md) | niubigeo 复用边界与交付纪律 |
| [03 实验与公开演示](03-experiments-and-public-demo.md) | 实验设计、公开案例与证据 |
| [04 本地原型](04-local-prototype.md) | 原型阶段记录 |

## 增长

| 文档 | 内容 |
| --- | --- |
| [10 海外增长](10-overseas-growth.md) | 定位、90 天计划、渠道、度量、风险 |

## 设计与研究

| 文档 | 内容 |
| --- | --- |
| [DESIGN.md](DESIGN.md) | 工作台视觉与信息架构基线 |
| [research/](research/) | 2026-10-29 归档审计、Topify UI 基线、Topify 逆向状态复核、访谈笔记 |

## 说明

- 文档中的代码路径按仓库根写成 `code/src/...`；历史文档里的 `src/...` 现在都指 `code/src/...`。
- 上游 niubigeo 的路径是 `code/vendor/niubigeo/...`，不是我们的实现。
- 没有证据的结论会标 UNKNOWN / INFER；不要把研究记录当成已实现功能。
