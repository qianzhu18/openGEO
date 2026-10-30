# 01 产品结构、页面与交互

本页的 UI 事实来自本次页面读取和弹窗探查。路由中的 `{workspace}` 是占位符，不包含真实账号标识。机器清单见 [pages.json](evidence/pages.json)。

## 1. 信息架构

```text
Workspace / Team
└── Project（路由 workspace 参数在客户端也被作为 projectId 使用）
    ├── Agent
    ├── Analysis
    │   ├── Overview
    │   └── Tracking
    │       ├── Prompts
    │       ├── Recording
    │       ├── Sources
    │       └── Fanouts
    ├── Optimization → Actions
    ├── Preferences → Competitors / Tags
    └── Management → Members / Project / Billing
```

Tags 在当前导航中为弱化展示，本轮没有取得独立 Tags 路由；不要据此假设它已完整开放。URL 中的 workspace 与业务 Team 不是同一概念，Team / Project 关系要以接口数据为准。

## 2. 页面蓝图

| 页面 / 路由后缀 | 页面结构 | 可见操作与状态 | OpenGEO 对应 |
| --- | --- | --- | --- |
| Agent `/agent` | 项目上下文、GSC 状态、审批模式、消息区、分类入口、输入框 | New Chat、History；Start here、Research、Content、Analytics、Optimize & publish；流式、待审批、错误见脚本 | 聊天式任务入口；不能用轨迹页替代 |
| Overview `/analyze/overview` | 时间 / 模型 / 品牌筛选、四指标切换、品牌趋势 + 竞品榜、Agent 动作、主题表 | 报告、导出、主题展开、排序、推荐生成状态 | 总览与发现入口 |
| Prompts `/analyze/tracking/prompts` | Active / Heatmap / Suggested；趋势与排行；主题分组表 | 搜索、主题筛选、新主题、加问题、列设置、批量分组、热图、停用、导出 | 问题库与问题分析 |
| Recording `/analyze/tracking/recording` | URL 输入、勾选表、标题、添加时间 | Add URL、Generate Prompts、Remove | **网址资料池**；与模型回答分开 |
| Sources `/analyze/tracking/sources` | 域名份额趋势、来源类别、机会、Domain / URL 表 | 日期、模型、域名筛选；URL / Domain；搜索、分页、排序、导出 | 信源聚合与机会 |
| Fanouts `/analyze/tracking/fanouts` | All queries、品牌统计、常见短语 | 查询 / Provider / 次数 / 关联问题 / 品牌 / 最近时间；搜索排序导出；本账号数据为空 | 搜索子查询证据 |
| Actions `/optimization/actions` | Action Overview、类别区、Todo / History、进度汇总 | SEO / 新文 / 改写 / Reddit；工作量筛选；自定义动作；生成中与 GSC 未连接状态 | 可执行的行动中心 |
| Competitors `/preferences/competitors` | 活跃竞品表、建议竞品卡片 | 排名、提及、情绪、位置；新增 / 编辑 / 删除、Track / Reject；自身品牌不可编辑删除 | 品牌与竞品统一实体 |
| Members `/management/members` | 团队、成员表、API Keys | 名称 / 角色 / 邮箱 / 创建时间 / 项目；Invite、Invite Link、创建 key | 托管版团队与权限 |
| Project `/management/project` | General、默认品牌、别名、Agent settings、Danger zone | logo、名称、网站、默认品牌；别名 Fuzzy / Exact；Agent Settings 抽屉 | 项目与集成配置 |
| Billing `/management/subscription` | 团队选择、当前计划、额度、计划比较 | 月 / 年付、附加额度、账单管理、降级 / 购买、优惠码 | 托管版计费；本地版可后置 |

## 3. Prompts 的细节

实际表头：Topic、AI Volume、Visibility、Sentiment、Position、SOV、Mentions、Intent、CVR、Location。

Active 与 Suggested 需要独立状态，不能只给一个字符串数组加标签。新建弹窗有 Prompt、可选 Topic、Location；支持逐行粘贴多个问题，当前提示每条最多 300 字符。弹窗已打开检查，未提交。

Heatmap 是另一个分析视图。页面脚本出现 `/api/heatmap`、导入 active 问题和 Agent 路径；本轮其初始化 GET 返回过 404。不能将热图、热图 Agent 的正常执行标为已验证。

问题详情相关客户端接口覆盖 analytics、chats、domains、URLs、competitor-overview、output detail / fanouts。它们证明客户端支持向下追查；本轮没有对每一项明细交互逐个执行成功验证。

## 4. Sources 的细节

域名表实际列：Rank、Domain、Domain Type、Used、Avg Citations、Citation Share、Mentioned、Brands Appear。页面不是一个「所有链接」平铺表：它同时组织来源结构、引用覆盖、引用强度、品牌共现和可执行机会。

本轮 Sources 首次发生连接关闭，重试后正常。Network 返回了 category_breakdown、domain_table、url_table、chart_data、opportunities 的字段结构；URL 列表在选取样本中为空，因此没有恢复 URL item 的完整响应字段。

## 5. Competitors 的细节

新增弹窗要求 Tracked Name、Domains，并可选择利用项目已有回答查找历史 Visibility / Position。说明明确不回补 Sentiment / Sources。新增品牌与历史重新计算是两项操作，不应混成「新增后所有历史指标都会更新」。

活跃和待审建议分别展示；自身品牌的编辑、删除按钮禁用。竞品详情客户端另有 summary / trend / domain-citation-trend / questions / answers 等能力，是否有足够数据需要按项目验证。

## 6. Agent Settings 的八个分区

本次打开编辑抽屉并切换了 Site Knowledge、Instructions、Competitors、Keywords、Search Console、CMS、Content Gen、Action Plan。字段内容随项目而异，未复制配置值。

这表明 Agent 不是只依靠聊天历史：站点知识、用户指令、研究结果、集成配置和行动计划具有独立管理入口。对应接口也区分 settings 键值和 project-data 资源。细节见 [04](04-agent-and-workflows.md)。

## 7. 应复现的用户路径

1. 选团队与项目 → 填写品牌 / 网站 / 别名 → 检查站点知识。
2. 网址登记或关键词研究 → 问题建议 → 人工选择激活 → 分主题与地区。
3. 采集并解析回答 → 概览定位主题 → 问题原文 / 引用 / Fanouts 追查。
4. 从品牌与竞品差距、信源机会形成 Action → 接受 → Agent 执行。
5. 研究 / 大纲 / 草稿 / 发布确认 → 保存产物 → 后续采样与报告。

前 4 步的页面结构可观察；采集 worker、完整生成与真实发布本轮没有端到端执行。界面可能在挂载时自动发起推荐：本轮自然捕获 `POST /api/v2/actions/recommend → 202`，没有主动点击付费、邀请、保存配置或发布。

## 8. 状态不能省略

每个数据页面都需要 loading / loaded-empty / loaded-data / failed / partially-complete。空 Fanouts、站点知识 404、建议生成中、成员与账单异步加载均为本轮实际状态。它们应形成明确产品状态，不能统一显示为 0 或空白。
