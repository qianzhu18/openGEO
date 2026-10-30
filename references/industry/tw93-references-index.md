# Tw93 延伸阅读索引（行业材料池）

- 来源：Tw93《你不知道的 GEO：AI 可见性的原理、实践与取舍》文末「延伸阅读」
- 原文：<https://tw93.fun/2026-05-01/ai-visibility.html>
- 整理时间：2026-10-30
- 用法：作为行业材料的**引用池**；每条标注「支撑什么」与「本次是否核验」，未核验的不写成结论

## 1. 清单

| # | 来源 | 支撑什么 | 链接 | 本次核验 |
| ---: | --- | --- | --- | --- |
| 1 | Aggarwal et al., *GEO: Generative Engine Optimization*（KDD 2024） | GEO 学术定义、GEO-bench、方法有效性 | <https://arxiv.org/abs/2311.09735> | 已读（摘要 + 表格） |
| 2 | yaojingang/geo-citation-lab | 开源 GEO 实验数据、citation absorption | <https://github.com/yaojingang/geo-citation-lab> | 仅检索确认 |
| 3 | llms.txt 规范 | llms.txt 格式与定位 | <https://llmstxt.org/> | 未抓取（规范本身稳定） |
| 4 | Ahrefs, *Why ChatGPT Cites One Page Over Another* | 1.4M prompts 的引用选择研究 | <https://ahrefs.com/blog/why-chatgpt-cites-pages/> | 仅标题（正文被前端截断） |
| 5 | ConvertMate, *GEO Benchmark Study 2026* | 2026 年 GEO 基准数据 | <https://www.convertmate.io/research/geo-benchmark-2026> | 抓取失败（DNS） |
| 6 | Evil Martians, *Optimizing Content for AI Discovery* | Markdown 路由、token 降噪 | <https://evilmartians.com/chronicles/optimizing-content-for-ai-discovery> | 未抓取 |
| 7 | SearchVIU, *How LLMs Actually Use Schema Markup* | JSON-LD 在 LLM 中的实际作用 | <https://searchviu.com/en/how-llms-actually-use-schema-markup/> | 未抓取 |
| 8 | CJR / Tow Center, *AI Search Has a Citation Problem* | 8 个 AI 搜索引擎的引用准确率 | <https://www.cjr.org/tow_center/we-compared-eight-ai-search-engines-theyre-all-bad-at-citing-news.php> | 已读 |
| 9 | SE Ranking, *LLMs.txt: Why Brands Rely On It and Why It Doesn't Work* | llms.txt 采用率与实际效果 | <https://seranking.com/blog/llms-txt/> | 仅标题 |
| 10 | Mintlify, *How Often Do LLMs Visit llms.txt?* | llms.txt 实际访问率 | <https://www.mintlify.com/blog/how-often-do-llms-visit-llms-txt> | 未抓取 |
| 11 | IndexNow Protocol | 主动通知 Bing/Copilot 收录 | <https://www.indexnow.org/documentation> | 未抓取（协议稳定） |

## 2. 已核验、可直接引用的事实

### 2.1 CJR / Tow Center（2025-03）

- 测试 **8 个生成式搜索工具**（ChatGPT Search、Perplexity、Perplexity Pro、DeepSeek Search、Copilot、Grok-2、Grok-3 beta、Gemini），**20 家新闻机构**，每家 10 篇，共 **1,600 次查询**。
- 整体：**超过 60% 的回答不正确**。
- 分平台：Perplexity 约 37% 错误；Grok 3 约 94% 错误；ChatGPT 在 200 次里错 134 次，但只表达过 15 次不确定，且从不拒答。
- 付费版比免费版**更容易自信地答错**（回答更多，但错误率也更高）。
- 多个工具似乎**绕过 robots.txt**；会编造链接、引用转载/镜像版本；与新闻机构的授权协议**不保证**正确引用。
- 结论：**AI 引用归因目前不可靠**，不能把「被引用」当成「用户看到了原话」。

### 2.2 Ahrefs（仅标题级）

- 研究规模：**1.4M prompts**；主题是「为什么 ChatGPT 引用这一页而不是那一页」。
- 具体数字未读取正文，**不引用**。

## 3. 数字口径冲突（重要）

同一个 GEO 论文，三处写法不同：

| 来源 | 数字 |
| --- | --- |
| 论文摘要 | 最高 **约 40%**；Perplexity 上约 37% |
| 论文表格（position-adjusted word count） | Quotation +41%、Statistics +31%、Cite Sources +28% |
| Tw93 转述 | 权威引用 +115%、统计 +33%、直接引用 +43% |
| Topify GEO 方法论页 | Cite sources +40%、Statistics +37%、Quotations +30%、Authoritative +25%、Easy language +20%、Technical terms +18%、Unique words +15%、Fluency +15–30% |

**处理原则**：不合并成一个数；引用时保留来源与口径；对外材料优先用论文摘要的「最高约 40%」，并注明「不同子指标/不同实验写法不同」。

## 4. 怎么用这批材料

1. **学术底座**：1 号（论文）为主，2 号（geo-citation-lab）补 citation absorption。
2. **平台机制**：8 号（CJR）证明引用不可靠；4 号（Ahrefs）补引用选择信号（待核验）。
3. **落地方法**：3 / 6 / 7 / 9 / 10 / 11 用于 `intl-open-web` 市场包的检查项（llms.txt、Markdown 路由、JSON-LD、IndexNow）。
4. **市场数据**：5 号（ConvertMate 2026）待抓取后再用；未核验前不引用具体数字。

## 5. 边界

- 上表「仅标题」「未抓取」「抓取失败」的条目，只能作为**线索**，不能写成结论。
- 行业文章里的百分比多为转述或厂商口径，引用时一律带来源与时间。
- 这批材料是「待验证假设」的来源，不是平台规则。
