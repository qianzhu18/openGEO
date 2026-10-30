# Tw93：AI 可见性的原理、实践与取舍（参考笔记）

- 来源：<https://tw93.fun/2026-05-01/ai-visibility.html>
- 作者 / 日期：Tw93，2026-05-01
- 类型：个人实操清单 + 数据转述，不是平台规则或学术结论
- 用途：给 `intl-open-web` market pack 与内容工程提供可试验的检查项

## 1. 核心判断

1. AI 搜索与 SEO 逻辑不同：传统 SEO 拼进前 10，**83% 的 AI Overview 引用来自排名前 10 之外的页面**。
2. AI 搜索增长快但占比仍小：2025 上半年同比 +527%，ChatGPT 到 2026-02 周活约 9 亿；AI 引荐流量占比仍不到 1%。
3. 转化率约是传统搜索的 5 倍，所以更像**品牌可见性策略**，而不是流量打法。
4. 结论：值得花一小时做结构化，不值得花一周死磕；产品本身才是核心竞争力。

## 2. 可直接复用的数据（均为 Tw93 转述，引用时保留出处）

| 数据 | 值 | 来源 |
| --- | --- | --- |
| AI Overview 引用来自 top10 之外 | 83% | Tw93 转述 |
| AI 搜索同比增长（2025 H1） | 527% | Tw93 转述 |
| ChatGPT 周活（2026-02） | 约 9 亿 | Tw93 转述 |
| AI 引荐流量转化 vs 传统搜索 | 约 5 倍 | Tw93 转述 |
| AI 引荐流量占比 | < 1% | Tw93 转述 |
| llms.txt 部署站点 | 84 万+（BuiltWith） | BuiltWith |
| llms.txt 域名采用率 | 10%（30 万域名） | SE Ranking |
| llms-full.txt 访问量 | 是 llms.txt 的 3–4 倍 | Mintlify CDN |
| Markdown 路由 token 降幅 | 约 80%（15000 → 3000） | Evil Martians |
| ChatGPT 检索页面最终被引用 | 仅 15% | Tw93 转述 |
| 第三方来源引用概率 vs 自有域名 | 6.5 倍 | Tw93 转述 |
| AI 引用归因错误率 | 200 条中 153 条有部分/完全错误 | CJR / Tow Center |

## 3. 方法清单（可落成检查项）

1. **robots.txt 分爬虫类型**：训练爬虫（GPTBot、ClaudeBot、CCBot）、搜索检索爬虫（OAI-SearchBot、Claude-SearchBot、PerplexityBot）、用户触发爬虫（ChatGPT-User、Claude-User）、退出标识（Google-Extended）、未声明爬虫（Bytespider）。
2. **llms.txt**：站点根目录 Markdown 概览；多站点互相引用形成网状发现。
3. **llms-full.txt**：30–60KB 完整版（FAQ、使用场景、竞品对比、README 摘录）。
4. **Markdown 路由**：每个页面提供 `.md` 版本，`<link rel="alternate" type="text/markdown" />`。
5. **搜索平台收录**：Google Search Console 提交 sitemap；Bing Webmaster Tools + IndexNow（Copilot / DuckDuckGo / Yahoo 底层走 Bing）。
6. **知识网页**：概览 + 完整版 + 每个项目独立页 + JSON API，数据从上游实时拉取。
7. **独立项目页 + 语义 URL**：`/projects/pake` 优于 `/page?id=47`。
8. **结构化数据镜像主域名**：子域权重弱，`example.com/llms.txt`、`/projects/xxx.md`、`/api/*.json` 放同一域名。
9. **别做的事**：`ai-content-url` / `llms` 等无规范 meta、`/.well-known/ai.txt`、HTML 注释提示、User-Agent 嗅探返回不同内容（cloaking）。
10. **JSON-LD 别指望太多**：五个 AI 系统实验里只放 JSON-LD、页面不显示的内容都没被读到；Bing/Copilot 走索引富化是例外。

## 4. 关于 GEO 论文的数字（口径提醒）

Tw93 文中给的是「权威引用 +115%、相关统计 +33%、直接引用 +43%」；论文摘要给的是「最高约 40%」，表格里最佳方法是 Quotation Addition +41%、Cite Sources +28%、Statistics +31%（position-adjusted word count）。

**两者口径不同，可能是不同子指标或不同实验。引用时保留来源，不合并成一个数字，也不把它写成平台普遍规律。**

## 5. 对我们最有用的几条

- 「检索到 ≠ 被引用」：进入检索池只是第一关，模型还要判断是否值得引用 → 我们的诊断要区分「未提及 / 提及未引用 / 引用」。
- 「第三方来源比自有域名更有效」：内容策略不能只写官网，要考虑第三方与社区证据。
- 「具体性 > 泛泛而谈」「纯 FAQ 反而有害」「长内容（1000–3000 词）更容易被切片引用」：可作为 `platform-content-writing` 的软约束，但要标注为待验证假设。
- 「AI 引用归因不可靠」：报告里不能把「被引用」写成「用户看到了原话」。

## 6. 边界

这是个人实践与数据转述，不是平台官方规则。用它的方式：做成可试验的检查项与假设，用我们自己的采样去验证，而不是直接写死成「必须这样做」。
