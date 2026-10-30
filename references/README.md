# OpenGEO References

This directory records what OpenGEO borrows from each reference and, equally important, what it does not inherit. References support the engine; they are not merged into one monolith.

## Layout

| Folder | 类别 | 说明 |
| --- | --- | --- |
| [knowledge/](./knowledge/) | 参考知识文档 | 技术标准与互操作规范（robots、sitemap、llms.txt、Agent Skills、MCP） |
| [industry/](./industry/) | 行业报告与调研 | 平台观察、行业研究入口；观察不等于平台规则 |
| [competitors/](./competitors/) | 竞对分析 | 派 Agent（Pi）、牛比 GEO（niubigeo）等开源项目的借用与边界 |

## Competitors

| Reference | Role in OpenGEO | Main boundary |
| --- | --- | --- |
| [Pi](./competitors/pi.md) | Minimal extensible agent harness, on-demand Skills, CLI / JSON / RPC / SDK, package distribution | OpenGEO is domain-specific and must add GEO evidence, budgets, platform adapters, and confirmation gates |
| [niubigeo](./competitors/niubigeo.md) | Provider catalog, measurement runs, raw answers, citation provenance, failure retention, repeatable history | OpenGEO adds delivery workflow, selling points, publication state, sentiment risk, retrospective actions, and self-evolution |
| [Topify](./competitors/topify.md) | Commercial GEO SaaS benchmark: real-UI sampling, prompt discovery, action workflows, agent framework | Not open source; effect claims unverified; borrow the execution model, not the marketing |

The vendored source snapshot lives in [`vendor/niubigeo/`](../vendor/niubigeo/); the analysis and boundary records live here. See [COMPARISON.md](./competitors/COMPARISON.md) for a side-by-side comparison of OpenGEO, Pi, and niubigeo.

## Knowledge

| Reference | Role in OpenGEO | Main boundary |
| --- | --- | --- |
| [GEO standards](./knowledge/geo-standards.md) | robots, sitemap, llms.txt, search documentation, and Agent Skills compatibility | These are navigation and interoperability references, not ranking guarantees |

## Industry

Industry reports, platform observations, and research entry points are indexed in [`industry/`](./industry/). These are treated as hypotheses, not as universal platform rules.

Latest report: [2026-10 GEO 行业报告](./industry/2026-10-GEO-行业报告.md). Supporting notes: [Tw93 AI visibility](./industry/tw93-ai-visibility.md), [Tw93 references index](./industry/tw93-references-index.md), [Klepsy domestic reference](./industry/klepsy.md), [geo-citation-lab](./industry/geo-citation-lab.md).

## Reference policy

1. Keep a local or pinned reference record when reproducibility matters.
2. Record license and commit or release identity.
3. Separate borrowed architecture from copied code.
4. Do not represent a platform observation as a universal ranking rule.
5. Prefer deterministic replay before live model integration.
