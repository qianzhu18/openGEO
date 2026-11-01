# 开源 GEO 工具格局（2026-11-01）

目的：在决定 OpenGEO 的差异化和增长路径前，先确认"开源 GEO"是不是一个空白。结论是**不是**：监测层已经拥挤，"开源替代付费仪表盘"这个说法在 2026 年已经不是差异化。数据来自 GitHub API 与各仓库 README，属于可复核的公开事实。

## 1. 主要玩家

| 项目 | Stars | 许可证 | 技术形态 | 采集方式 | 主要范围 |
| --- | ---: | --- | --- | --- | --- |
| [niubigeo](https://github.com/Albert-Weasker/niubigeo) | 8,927 | Apache-2.0 | TypeScript Web + Docker | 模型 API（BYOK） | AI 可见性、竞品、引用、可复现测试；20 个公开案例；PH 上线，有付费服务 |
| [GetCito](https://github.com/ai-search-guru/getcito-worlds-first-open-source-aio-aeo-or-geo-tool) | 503 | MIT（仓库声明） | TypeScript + Postgres | 自建采集 | AI 可见性追踪 + 优化；Docker Compose；白标部署 |
| [GEO/AEO Tracker](https://github.com/danishashko/geo-aeo-tracker) | 313 | MIT | Next.js + IndexedDB | Bright Data + OpenRouter | 5 引擎、0–100 评分、citation 分析、竞品 battlecard |
| [OneGlanse](https://github.com/oneglanse/oneglanse) | 243 | MIT | Node/TS | **真实产品网页**（自有账号） | 5 引擎、真实 UI 采集、引用与竞品；PH 日榜 #28 |
| [Ansvisor](https://github.com/ansvisor/ansvisor) | 221 | MIT | 全栈 | API / 平台 | 监测 + Agent 执行动作 + 内容草稿 + 托管云 |
| [Searchstack AEO](https://github.com/alexpospekhov/searchstack-aeo) | 112 | MIT | Python CLI | 模型 API | CLI 式 AI 可见性，偏技术创始人 |
| [RankSpot awesome-geo-tools](https://github.com/RankSpotAI/awesome-geo-tools) | — | 列表 | — | — | 收录上述项目与 SaaS 对比，明确写"没有开源的 Profound/Peec 等价物" |

OpenGEO 自身 vendored 的上游正是 niubigeo v0.3.2（见 [UPSTREAM.md](../UPSTREAM.md)），也就是说**我们最直接的对标对象是仓库里已经包含的那份代码**。

## 2. 已经商品化的能力

- BYOK、自托管、本地存储（geo-aeo-tracker 的 IndexedDB、niubigeo 的本地数据）。
- 多引擎监测、提及 / 位置 / 情感 / 引用、竞品对比、趋势图。
- Docker / Vercel 一键部署、白标、公开 demo。
- "比 $5,000/年 SaaS 便宜"的叙事（niubigeo README 原话）。

这些现在都是**入场券，不是卖点**。再做一个"开源的可见性仪表盘"只会变成第 6 个同类仓库。

## 3. 仍然空着的部分

对照各自 README 与 [awesome 列表的 gaps 段](https://github.com/RankSpotAI/awesome-geo-tools)：

1. **可复现的"收据"**：多数工具给出分数，但不提供"这个数字由哪条回答、哪个协议、哪个分母算出"的一键回放。niubigeo 讲证据，但重点在原始回答浏览，不在指标级 replay。
2. **测量 → 执行 → 复测的闭环**：Ansvisor 与 Topify 在做 Agent 执行，开源侧只有雏形；没有人把"动作、审批、发布回执、复测条件"做成可审计的状态机。
3. **公开基准数据集**：awesome 列表明确指出"没有公开的、跨品牌的引用基准，每家都在给自己打分"。谁先发布方法透明、可复算的季度基准，谁就拿到引用与媒体。
4. **机构 / Agency 工作流**：多客户、白标报告、可交付审计包、成本核算，开源项目基本没做。
5. **采集协议披露**：OneGlanse 引用 Surfer 2026 研究（1,000 prompts、13,779 条回答，UI 与 API 的品牌重合度仅 21.3%–31.6%），说明"你测的是网页还是 API"会改变结论。多数工具不披露这一点。

## 4. 对 OpenGEO 的含义

- **不要**用"开源、自托管、BYOK"当主叙事——那是 2026 年的默认配置。
- **要**用"可复现的 GEO 交付"当主叙事：每个数字能回放到原始回答；每个动作绑定证据与验收条件；每次复测固定协议；失败样本与未知显式呈现。
- **要**把 Topify 的 Actions 与公开 API 合同当作产品下限，而不是上限：它有动作但没有公开的 replay；开源侧有监测但没有可信的执行闭环。两者的交叉点就是 OpenGEO 的位置。
- **要**承认上游：niubigeo 是测量参考与代码来源，OpenGEO 的增量必须清楚写在"交付闭环 + 证据协议 + CLI/MCP"，否则会被认为是换皮。

## 5. 待核验

- 各仓库的 star 增长曲线与真实活跃度（issue / PR / release 节奏）本轮未逐项核对。
- GetCito 的许可证在 GitHub 上显示 `NOASSERTION`，README 写 MIT，需要看 LICENSE 原文才能确认。
- OneGlanse 的网页采集是否违反各平台条款、账号风控如何处理，README 未给出结论。
- 上述项目的商业化程度（是否已有付费客户）无法从公开仓库确认。

引用这些数字时请标注抓取日期（2026-11-01）与来源，不要把 star 当作产品质量或收入的代理指标。
