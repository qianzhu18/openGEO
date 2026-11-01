# 09 创建工作空间：海外初始化链路逆向

日期：2026-10-31。目标：[Topify create-workspace](https://app.topify.ai/create-workspace)。本轮优先恢复首次使用到首次诊断的产品契约，承接 [全站规格](README.md) 与 [Agent 工作流](04-agent-and-workflows.md)。

证据分级：**UI** 为登录态界面直接观察；**JS** 为公开分发客户端的静态观察；**REA** 为工具解析结果；**DESIGN** 为 OpenGEO 实现选择；**UNKNOWN** 为尚未验证。接口候选不等于真实请求成功，客户端状态不等于后台实现。

## 1. 本轮覆盖与边界

- UI：外层步骤为 Info → Prompts → Analyze → Done。Info 内依次填写网站、品牌名称、语言和地区；输入 `posthog.com` 后品牌预填 `Posthog`。语言列表有 28 项，本轮选择 English。
- UI：本轮停在最终创建之前，没有创建远端工作空间、提交诊断、改变订阅或调用生成任务。Prompts／Analyze／Done 的具体后台链路来自客户端静态证据，尚未实际端到端运行。
- JS：从该页面加载资源保存 37 个公开脚本，共 1,743,613 bytes；只保存文件指纹和分析摘要到知识记录，不把完整第三方脚本提交进产品仓库。
- REA：选取 onboarding 与 API 客户端两个文件，解析 2/2、0 parse failure、48,441 AST nodes；application / semantic coverage 均为 partial，未截断不代表完整恢复。37 个脚本中另外 35 个未做本轮语义分析；轮询 hook 是额外直接静态读取。
- UNKNOWN：服务端源代码、任务队列、模型提示词、供应商、真实采样基础设施、费用与报告质量。浏览器页面不能证明计算发生在本地还是云端。

## 2. 版本身份与复现锚点

原始采集目录：`/tmp/opengeo-topify-onboarding-20261031`；可被系统清理，不作为产品运行依赖。偏移均为 **0-based 字符偏移 / UTF-8 字节偏移**，作用于原始压缩脚本，不能按源码行号理解。以下内容是语义概括，不复制完整代码。

| 文件代号 | 原文件 | bytes | SHA-256 |
| --- | --- | ---: | --- |
| ONB | `31-4136-a00a4c9c5bbb98cc.js` | 140119 | `347dba155fde4af4e47d4f47103b1f313dbbe8a57e11b1b0d2568b75f5e07aae` |
| API | `21-6976-f79b9449050663d5.js` | 81372 | `b815a506b45ed06b98b01cb33bf1a8b4744bfc85facdc0b83b610e39ac74e911` |
| HOOK | `26-1641-6e4701f3b37198f4.js` | 18307 | `6bb4ad59cfef692c69d0e3fbbf400d353d41ac9153894196b614ad3900e3b42b` |

REA parent Evidence：`ev_69508cbab8a557e10bf4164e25e27cb586e918b5f5d21cd7ed324277bfbb3315`。摘要视图 Evidence：`ev_86d071cfd57f2ace438a8a9c0a2f55eeea6930524c5e61242a6e40b3b74246a0`。输入容器 SHA-256：`436d4e09f9e4cf246416fbc5ac7e9fc1041be18e2bb2364b65e72274fab3f6a1`。容器包含 manifest 等文件；REA relevant_files=38 不能误报为 38 个 JavaScript。

本机摘要：`/tmp/opengeo-topify-onboarding-rea-summary-20261031.json`。摘要 view 的 `complete-within-view` 只描述摘要条目分页，不覆盖 parent 的 partial 限制。

## 3. 海外流程与状态

```text
Info：brandUrl → brandName → language → location
  ↓ createProject
Project 已建档
  ↓ initializeProject
initializing / form_polling
  ↓ initialized + resume_data
Prompts：按 Topic 展示候选问题，选择、添加、删除
  ↓ processPrompts
processing / step3_polling
  ↓ analyzed（可能还等待会员／plan gate）
Done / completed
  ↓ completeProject
Overview
```

UI 四步是显示层；form、form_polling、prompts、step3_polling、completed 是客户端步骤；initializing、initialized、processing、analyzed、completed、error 是 bootstrap 业务状态。三种状态不可混成一个枚举。

## 4. 静态接口候选

| 阶段 | 方法与路径 | 客户端已见字段／结果 | 等级与锚点 |
| --- | --- | --- | --- |
| 建项目 | POST `/api/v2/projects` | id、teamId、brandName、websiteUrl、location | JS API 14498/14498；ONB 约 79200–80600 |
| 初始化研究 | POST `/api/v1/bootstrap/initialize` | account_type、user_id、team_id、brand_name、brand_url、agency_name、agency_url、project_id、location、language；可选 Bearer token | JS API 4615/4615；ONB 约 80900–82300 |
| 查询进度／恢复 | GET `/api/v2/projects/{id}` | bootstrapData.status；resume_data.topics、resume_data.active_prompts | JS API 14713/14713；HOOK 2134–5600 |
| 提交问题进入分析 | POST `/api/v1/bootstrap/prompt` | user_id、project_id、is_initialization=true、selected_prompt[{prompt_id}]、可选 new_prompts | JS API 4903/4903；ONB 84738/84746 |
| 完成初始化 | POST `/api/v1/bootstrap/complete` | project_id | JS API 5135/5135；ONB 86272/86280 |

`initializeProject` 可直接返回 topics / active_prompts，也可返回 202 或 initializing 后轮询。字段存在不证明画像／问题具体由哪个模型或搜索供应商产生。

## 5. 问题审核和选择

| 观察 | 静态解释 | 锚点（字符/字节） |
| --- | --- | --- |
| 默认全选 | 非空问题列表长度变化时，把所有 prompt_id 写入选中集合；同长度内容变化是否保留旧选择应另查 | HOOK 6051/6051 |
| Topic 分组 | 基于 topic_id 聚合；桌面默认折叠除首 Topic 之外的组 | ONB 35000/35004 起 |
| 问题数量 | 新增入口按“已选问题＋新增问题”计算剩余空间，上限 8；不能据此断言服务端所有套餐上限都是 8 | ONB 35783/35787 |
| 批量新增 | 按行拆分，去空行，大小写不敏感去重，按剩余空间截取；待提交 new_prompts 保留为字符串列表 | ONB 35800/35804 附近 |
| 字符限制 | 输入 onChange 将每行截到 300 字符；不是公开 API 的通用上限 | ONB 39595/39599 与 40123/40127 附近 |
| 删除问题 | optimistic 更新列表与 Topic 计数，调用 deletePromptV1；404 当已删除，其余失败回滚 | HOOK 约 6400–7200 |
| 空选择 | 无选中、无新增、输入框也无待提交文本时阻止下一步 | ONB 35700/35704 附近 |

## 6. 轮询、重试与恢复

HOOK 2312/2312 定义轮询默认：initialIntervalMs=2000、maxIntervalMs=5000、maxPollAttempts=60、maxConsecutiveFailures=5。轮询请求对 getProjectById 做 10 秒 Promise.race；这不是后台任务超时，也不能证明底层网络请求已被取消。

- 常规轮询间隔按 `2000 × 1.5 ^ floor(attempt/2)` 增长，最多 5 秒。
- **60 次不是硬终止。** HOOK 4685/4685 只在状态既非 initializing 也非 processing 时触发 max_retries；仍在这两个状态时继续轮询，达到 60 后间隔至少 15 秒（5284/5284）。
- 成功响应重置连续失败数；连续 5 次异常停止并显示连接不稳定。initialized、analyzed、completed、error 会停止相应轮询，随后由回调驱动下一步。
- error 保存 error_code、error_message、failed_at、retry_allowed、failed_at_timestamp；保存 retry_allowed 不证明 UI 一定提供逐阶段原地重试。
- HOOK 10068/10068 附近另有通用 fetch helper：默认 retries=2（最多 3 次尝试）、每次 10 秒、间隔 3 秒；重试网络异常和 502/503。它是独立 helper，不能把它的重试次数直接套到所有 bootstrap POST。
- ONB 约 82300–83550：初始化异常先 GET 项目；已 initializing / initialized 则恢复轮询或问题审核。如果无法恢复，代码可能 DELETE 本轮刚创建的项目。OpenGEO 应保留失败记录和研究产物，不照搬这一清理副作用。
- ONB 约 85200–86000：processPrompts 返回 409／already completed 时跳 Overview；already in progress／processing 则恢复轮询。客户端 hasStarted/isExecuting 只防同页面重复点击，不等于服务端幂等保证。
- URL 保留 projectId 与 step；HOOK 约 10450–10900 根据 bootstrap 状态恢复到相应步骤。路由参数应作为提示，最终状态来自持久数据。

## 7. 配额、计划与进度显示

- ONB 66094/66102：QUOTA_EXCEEDED 显示 Research Credit Quota Exceeded 和 Upgrade Plan；另区分 PROCESSING_FAILED、TIMEOUT、连接失败与 max_retries。
- ONB 70365/70373、74553/74561：分析完成与付费／会员状态门控分开；analyzed 不总是立即进入 completed，skip_trial 有特殊分支。不是“分析完成＝订阅已成功”。
- ONB 60564/60568：等待页进度由 elapsed time 驱动，最高先停在 95%，不是后台已完成工作比例。OpenGEO 应显示已完成阶段／实际计数，避免把时间动画当真实任务进度。
- ONB 86272/86280：完成操作先更新客户端 completed 状态，再异步 completeProject 并 catch；客户端完成画面不能单独证明服务端最终状态已落盘。OpenGEO 应等待完成写入成功后显示终态。

## 8. Global 与 Domestic 的明确分流

API 约 77500–79600 有 global/domestic 产品配置。global 暴露 ChatGPT、Perplexity、Google AI Overview、Gemini、Claude（enterpriseOnly）等品牌入口，并开启 Agent、Actions、billing、paywall、credits、setupPlan 等 feature flags。这是显示与功能配置，不证明当前账号能调用全部模型。

ONB 约 80200–80900 的 domestic 分支要求 defaultTopicId、跳过海外 bootstrap，直接进入 tracking/prompts。用户本轮确定海外优先，因此不实现国内分支、不混入国内平台采样假设。

## 9. OpenGEO 采用与不照搬

采用：URL-first 建档、自动研究、Topic 分组问题审核、持久初始化状态、真实采集与分析分离、可恢复任务、Actions 回流。

不照搬：套餐与支付墙、无限延长的前端等待、假百分比、初始化失败自动删除项目、服务端完成前乐观标成功，以及未验证的私有指标算法。

当前本地 `source-derived-templates/v1` 只提供公开网页提取和英文问题模板，不等于 Topify 的自动关键词／竞品研究，更不等于整个海外 MVP 完成。落地规格见 [海外 MVP](../../../docs/09-海外最小可行版.md)。

## 10. 调查问题状态

| 问题 | 当前状态 |
| --- | --- |
| 用户输入与四步信息架构 | 已回答：UI＋JS |
| bootstrap 请求形状和客户端状态恢复 | 部分回答：JS，未做真实提交 |
| 轮询、选题、新增限制、错误和 plan gate | 部分回答：静态分支存在，实际运行未知 |
| 真实关键词、竞品来源与模型策略 | 未回答 |
| 采集 worker 在本地／云端／混合部署 | 未回答 |
| 单次真实诊断耗时、成本、报告质量 | 未回答，需要授权范围内后续端到端样本 |
