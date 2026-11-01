# 11 登录后产品复核（2026-11-02）

本轮拿到真实登录态（ego lite 复用用户会话），补上了 2026-11-01 缺失的部分：登录后 11 个页面、84 个产品 chunk、31 个内部 API、9 份去值响应结构。本文只记录**这次实际观察到的界面与接口**；REA 只做惰性解析，不证明运行时行为。

采集边界：只读页面、只折叠/切换视图，没有创建/删除问题、竞品、成员，没有执行 Action、没有发布内容、没有改设置。项目标识在证据文件中已替换为 `{project_id}`，品牌与域名不落盘。

## 1. 与 2026-10-30 的差异：几乎没变

| 指标 | 结果 |
| --- | --- |
| 登录后可达 chunk | 84 |
| 与 10-30 清单逐字节相同 | **82** |
| 已记录 chunk 发生变化 | **0** |
| 新增 | 2（`7119-9c94fca73a986ac9.js`、`page-d698235f59a7d0a8.js`） |
| 消失 | 2（`9597-6c410b2e8ef109ad.js`、`page-fbcc3cd1317e130a.js`） |

两个新文件对应一次部署替换：`page-fbcc3cd1…` → `page-d698235f…` 是 **Referrals 页**（"Refer a friend, earn 10% credit"），`9597…` → `7119…` 是同一次构建里的依赖块。也就是说，产品代码在两周内只多了一个推荐计划页面；其余页面、接口层、Agent 客户端都没有变。

**修正 2026-11-01 的结论**：当时说"登录后页面不可复核、48 个文件不可达"是对的；但不能据此推断产品变了。拿到会话后验证：**没变**。

## 2. 信息架构已经改了（相对 10-30 记录）

10-30 记录的扁平路由（`/prompts`、`/recording`、`/sources`、`/fanouts`）现在全部 404（"Oops! Lost in Topify"）。现行结构：

```text
/{projectId}/agent
/{projectId}/analyze/overview?range=7
/{projectId}/analyze/tracking/prompts
/{projectId}/analyze/tracking/recording
/{projectId}/analyze/tracking/sources
/{projectId}/analyze/tracking/fanouts
/{projectId}/optimization/actions
/{projectId}/preferences/competitors?range=7
/{projectId}/management/members
/{projectId}/management/project
/{projectId}/management/subscription
/{projectId}/management/referrals
```

侧栏分四组：Agent / Analyze（Overview + Tracking 四项）/ Optimization（Actions）/ Preferences（Competitors）/ Management（Members、Project、Subscription、Referrals）。Tracking 四个子项是一个折叠组。

## 3. 页面清单（实测列与控件）

| 页面 | 主要列 / 分区 | 控件 |
| --- | --- | --- |
| Overview | Brand Charts、品牌表现、模型表现；指标切换 Visibility / Sentiment / Position / SOV | 日期范围（Last 7 Days）、All models、All brands、Generate Report、Export、"Nov 2 data is still processing — showing data through Nov 1" 状态条 |
| Prompts（Active） | Topic、AI Volume、Visibility、Sentiment、Position、SOV、Mentions、Intent、CVR、Location | Active / Heatmap / Suggested、All Topics、Create Topic、Add Prompts、Search、Export |
| Prompts（Suggested） | Suggested Prompt、For URL、Overlap、AI Volume、Citing / Competing、Type、Actions、Suggested At | 同上 |
| Prompts（Heatmap） | 同 Active，行数更多 | 同上 |
| Add Prompt 弹窗 | Prompt（最多 300 字符）、Topic（可选，No Topic）、Location（国家选择） | Cancel / Save |
| Recording | URL、Title、Added | Add URL、0/5 Selected、Generate Prompts、Remove；空态："No URLs recorded yet — Add a URL above to start tracking and generating prompt recommendations."；"What is URL Recording?" 打开站内助手 |
| Sources | Rank、Domain、Domain Type、Used、Avg Citations、Citation Share、Mentioned、Brands Appear | Domain / URL 切换、All Domains、Search、Export |
| Fanouts | Query、Provider、Occurrences、Prompts、Brands、Last used | Query / Occurrences / Last used 排序、Export |
| Actions | Action Center、Credit Balance；分类 On-page SEO / New Articles / Rewrite Articles / Reply on Reddit；Todo / History；Todo / Done / Skipped 计数 | Effort 过滤、Custom Action、Generate more suggestions；GSC 未连接横幅 |
| Competitors | Rank、Brand、Visibility、Sentiment、Position、Actions；Suggested Competitors 带 Mentions 与 Track / Reject | Add Competitors、Export、"Just added a competitor? Calculate its earlier visibility…" |
| Agent | 起始页 "How can I help?"；四组技能 Research / Content / Analytics / Optimize & publish；New Chat、Review & Confirm、GSC 未连接 | 聊天输入、历史会话 |
| Members | Team / Email / Role / Projects、Invite、Invite Link、API Keys | Create API Key、Role 选择 |
| Project settings | General（logo / name / domain）、Default brands（最多 20，可拖拽排序）、集成 | Save project settings |
| Subscription | Plan、credits 使用、充值包、计划对比 | Manage billing、Monthly / Yearly |
| Referrals | 推荐码与链接（`?refer=`）、20% 折扣 / 10% 返利、余额与累计 | Copy code / Copy link、邮件与社交分享 |

其他实测事实：

- Prompts 的 AI Volume、CVR、Mentions、SOV 已经是首屏列，不再是"未来补上"。
- Sources 新增 Citation Share、Mentioned、Brands Appear，且提供 Domain / URL 两级切换。
- Fanouts 现在是独立页面，按 Query 聚合，带 Provider、Occurrences、涉及的 Prompts 数与品牌。
- Recording 是 URL 池：先收集 URL，最多选 5 个，再 Generate Prompts；URL 本身不是回答。
- Actions 的"Custom Action"与"Generating…"说明动作生成是异步任务；GSC 未连接时只给通用建议。
- 订阅页显示 credits 使用率与充值包；推荐计划是新的增长机制（好友 20% off、推荐人 10% credit）。

## 4. 内部 API（只读观察）

本次正常加载观察到的端点（`{project_id}` 归一化，完整列表见证据文件）：

| 分组 | 端点 |
| --- | --- |
| 项目 / 团队 | `GET /api/v2/projects/{id}`、`/api/v2/projects?team_id=`、`/api/v2/teams/me`、`/api/v2/teams/with-projects`、`/api/v2/membership/overview`、`/api/v2/user/referral-summary` |
| 设置 | `GET /api/v2/projects/{id}/settings/default-brands`、`.../settings/table-settings` |
| Prompts | `POST /api/v2/overview/analysis/prompt`（页面加载时多次）、`POST /api/v2/prompt/competitor-overview/aggregate`、`GET /api/heatmap/{id}?metric=`、`GET /api/v2/topics` |
| Recording | `GET|POST /api/v2/recording/list`（GET 返回 405，说明是 POST 读取） |
| Sources | `GET /api/v2/sources/list?project_id&table_scope=domain|url&duration_days&page&page_size` |
| Fanouts | `GET /api/v2/prompts/fanouts?...&sort_by=occurrences&sort_order=desc`、`GET /api/v2/prompts/fanouts/insights` |
| Actions | `GET /api/v2/actions?projectId=&status=`、`POST /api/v2/actions/recommend` |
| Competitors | `GET /api/v1/competitors?project_id=` |
| 其它 | `GET /api/providers?team_id=`、`GET /api/v1/overview/visibility`（GET 405）、`POST /api/growth/events`、`/api/supabase/users`、`/api/v2/agent/sessions`、`/api/v2/agent/action-items`、`/api/v2/agent/project-data/{id}/site-profile`、`/api/v2/agent/settings/{id}?key=gsc` |

响应结构（字段名与类型，值全部移除）：

- `sources/list` → `{ analysis_status{is_complete}, stats{total_sources,total_citations,date_range}, chart_data{dates[],series{domain:[7]}}, category_breakdown{corporate,editorial,institutional,reference,ugc,other}, domain_table{total,items[]}, url_table{total,items[]}, opportunities[] }`
- `prompts/fanouts` → `{ items[], distinct_query_count, total_occurrences, total_items, page, page_size, total_pages }`
- `prompts/fanouts/insights` → `{ brand_mentions, common_phrases }`
- `topics` → `{ topics[], total }`
- `actions` → 数组，元素含 status / category / effort 等（与公开 API 合同一致）
- `settings/table-settings` → `{ project_id, table_settings }`

## 5. REA 运行

同一台机器、同一 REA 6.8.0、同样的 Swift modulemap 修复。本轮对登录后页面 chunk 分两批分析：

| 批次 | 文件 | 统计 | 证据 |
| --- | --- | --- | --- |
| A | prompts、recording、sources 三个页面 chunk | 40,236 AST 节点、356 findings、39 modules、0 parse failure；图 456 / 563 | `ev_3312351cc9646594c4b0f66c75e12f07a779896253a8fed3560ae6a594074d96` |
| B | agent、actions、competitors 三个页面 chunk | 146,321 AST 节点、1,187 findings、58 modules、0 parse failure；图 1,025 / 1,413 | `ev_ebea41408d88cfa4b5d98ee312a087cd525d78cf46dcedbf5392de6eaf4c772e` |

覆盖为 partial：每批只选 3 个文件，剩余 81 个文件的关系未知；只做惰性解析，没有执行 bundle。

## 6. 仍然未知

- Prompt 分析的 POST 请求体与分页参数（页面加载时自动发出，未重放）。
- Heatmap 的请求参数（`/api/heatmap/{id}?metric=visibility` 直接 GET 返回 404，说明还缺查询参数）。
- Recording 的 POST 读取体、Generate Prompts 的异步任务与幂等键。
- Actions 推荐的生成队列、审批 checkpoint 与恢复（未执行任何动作）。
- 各引擎的采样频率、地区路由、失败重试是否计入分母。
- 账户内 Pro 计划显示 20,000 credits，而公开定价页写 30,000（2026-11-01 抓取）：是历史计划、折扣档位还是页面未同步，未知。

## 7. 对 OpenGEO 的直接结论

1. **IA 应对齐**：Agent / Analyze（Overview + Tracking 四项）/ Optimization / Preferences / Management；Tracking 做成折叠组，Recording 与 Fanouts 是独立页，不再是"待补"。
2. **Prompts 首屏补齐**：AI Volume、Sentiment、Position、SOV、Mentions、CVR、Heatmap、Suggested 三视图；空值必须显示未知，而不是 0。
3. **Recording 必须真实可用**：URL 池 → 收集 → 选最多 5 个 → 生成候选问题；`recordings.ts` 已有服务逻辑，缺路由与 UI。
4. **Competitors 需要 suggested → Track / Reject 流**，并显示提及次数；当前本地只有品牌事实，没有竞品实体。
5. **Actions 中心**：四类动作 + effort 过滤 + Todo / History + 异步生成状态；没有 GSC 时不伪造"数据驱动"建议。
6. **不要照搬**：credits 计费、推荐返利、Members/API Keys 属于托管阶段；Metadata/`/api/supabase/users` 这类内部端点不进入 OpenGEO 合同。

## 8. 证据文件

- `evidence/bundle-manifest-20261102.json`（84 个 chunk 的字节数与 SHA-256）
- `evidence/api-endpoints-20261102.json`（31 个端点，ID 归一化）
- `evidence/response-shapes-20261102.json`（9 份去值结构）
- `evidence/ui-inventory-20261102.json`（12 个路由的标题、列、控件、端点）
- `evidence/rea-runs-20261102.json`（两批 REA 的统计与证据 ID）
