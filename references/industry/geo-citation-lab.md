# geo-citation-lab：开源 GEO 研究项目（参考）

- 仓库：<https://github.com/yaojingang/geo-citation-lab>
- 类型：开源 GEO 实验数据报告 + GEO / AEO / AI 搜索论文库
- 关联论文：*From Citation Selection to Citation Absorption: A Measurement Framework for Generative Engine Optimization Across AI Search Platforms*（arXiv 2604.25707）
- 关联数据集：`03-cn-geo-citation-dataset`
- 首次记录：2026-10-30，经 Tw93 文章与公开检索确认

## 1. 为什么值得关注

它和 OpenGEO 的「证据优先」是同一方向：不是给一个黑盒 GEO 分数，而是研究**引用是怎么被选择、又怎么被吸收**的。

核心概念：**citation selection → citation absorption**，即「被 AI 引用」不等于「被 AI 吸收/采纳」。这正好对应我们要在诊断里区分的东西：

- 未提及
- 提及但未被引用
- 被引用
- 被引用且内容被采纳（吸收）

## 2. 可确认的信息

| 项目 | 内容 | 可信度 |
| --- | --- | --- |
| 仓库存在 | `yaojingang/geo-citation-lab`，含实验报告与论文库 | 高（检索确认） |
| 论文标题 | *From Citation Selection to Citation Absorption…* | 高（检索确认） |
| 数据集 | `03-cn-geo-citation-dataset` | 高（检索确认） |
| 实验规模 | 602 条 prompt、3 个平台、上万页面（Tw93 转述） | 中（转述，待原报告核验） |
| 结论规律 | 见下节 | 中（Tw93 转述） |

## 3. 转述的规律（Tw93 文中，待原报告核验）

- **具体性**：有真实数据、清晰定义、横向对比的页面，影响力高出泛泛页面 50% 以上；有步骤结构的页面更好。
- **纯 FAQ 反而有害**：与「加 FAQ 提分」的通行建议相反。
- **内容长度**：被高频引用页面平均近 2000 词、10 个以上标题；低影响力页面约 170 词；稳妥区间 1000–3000 词。
- **相关性**：机械 SEO 指标（H 标签、meta description、关键词密度）的预测力都不如「页面内容与用户问题是否同一件事」。
- **平台差异**：ChatGPT 引用少但用得深（单条影响力约为 Google 的 5 倍）；Perplexity 广撒网（引用量约为 ChatGPT 两倍）。
- **内容类型**：官网 + 新闻 + 行业垂类占引用来源约 80%；百科/解释型页面影响力约为新闻页面的 3 倍；英文内容在全球引用样本中占 83% 以上。

## 4. 边界与待核验

- 本次因网络限制，**未完整读取仓库与 `final_report.md`**，以上规律来自 Tw93 的转述与公开检索摘要，不能当作已核验数据。
- 602 / 3 平台 / 上万页面、以及各百分比，需要回到原报告逐项核对后才能进入我们的对外材料。
- 这些结论是「跨平台观测」，不等于平台规则；用它们时仍要带样本与时间。

## 5. 对 OpenGEO 的用法

1. 把「citation absorption」作为诊断的一个可选判定维度，而不是只看「有没有引用」。
2. 作为 `platform-content-writing` 的软约束候选：具体性、结构、长度、相关性。
3. 作为我们自己的实验设计参考：固定 prompt、多平台、保留原始页面与引用。
