# 修复与证据

JS / NET：OpenAI 地区拒绝后旧循环仍继续请求后续题。改为按 target.id 复用会话，并复用主目标策略会话，失败后不再发送同目标网络请求。单元继续显式记录失败，其他平台独立执行。

新增三题地区拒绝回归；旧实现失败；只复用采样会话时仍有一次策略调用，测试继续失败；复用主目标会话后通过。npm run build 与 npm test（109 项）通过。

面试故事：单题的费用保护无法自动覆盖题集循环，必须核对状态的生命周期与调用路径。未声称降低了具体费用比例。

## 2026-11-08 采样入口收敛（最终状态）

海外只保留 ChatGPT/Gemini，默认使用独立 CloroMonitor。官网文档 403 后改读官方 PyPI 0.4.0 与 GitHub SDK，确认两个 `/v1/monitor/*` endpoint、Bearer、body 与成功响应。此前“协议未核实、只作候选”的临时判断已由官方证据替代，Cloro 不加入通用模型 ProviderCatalog，策略/内容使用已有模型或规则。

国内浏览器优先与 API 搜索设置拆开，前者记录 transport 意图，后者记录实际请求。未实现 adapter 明确 skipped，OpenRouter fallback 保持 API 身份，失败不进分母。修复了未配置 adapter 时 `undefined === undefined` 被误当成可用浏览器的分支，新增回归覆盖。

验证：build、113 项单测、22 项浏览器回归通过。Cloro 费用保持 UNKNOWN，以每目标最多 10 请求限制批次；失败即停、无自动重试。真实 AgileX 结果另见本任务后续记录。

## AgileX 实跑结果

NET / 2026-11-08：run `d1b47a76-c680-4dea-9d5c-56bd7f2cb7ab`，v6 净 10 题 × 5 平台 = 50 计划单元；80 条执行记录包含 30 个国内网页 skipped 与本地停止保护，不能当作 80 次收费网络调用。取得 11 条原文，其中千问 9 条截断，只有 2 条有效；有效覆盖 4%，状态 needs_review，内容 blocked。

| 目标 | 有效/计划 | 实际结果 |
| --- | --- | --- |
| Cloro ChatGPT | 1/10 | Q1 成功；下一题 300 秒超时，其余停止 |
| Cloro Gemini | 0/10 | 首题 HTTP 429，其余停止 |
| OpenRouter DeepSeek | 0/10 | 首题空回答，触发保护 |
| OpenRouter 千问 | 1/10 | Q9 完整，其他 9 条达到 1200 token 上限 |
| OpenRouter Seed | 0/10 | 首题空回答，触发保护 |

有效不等于事实正确：Q9 千问把 TRON 系列归到 AgileX，且给出 PiPER/其他机械臂配置建议，无已核验型号来源。该回答可作为品牌信息错误风险样本，不能直接变成内容事实。Q1 Cloro ChatGPT 在非点名题中纳入 AgileX，只有 1 条观察，不能推广到平台总体。两个通道和题型不合成 100% 提及率。

本机配置已指定 Xue，但 `browser:probe` 和 `browser:check` 均返回 bridge_unreachable；`kimi-webbridge start` 报守护进程已有，未升级/重启、不切换 profile。国内网页 adapter 仍未实现。SDK 更新提示已转告用户。

报告在用户本地忽略数据目录 `code/data/reports/AgileX-vNext-API-20261108/`：HTML/Markdown 调研报告、公开证据 JSON、策略与内容制作建议、local-store 原始脱敏响应。没有新发布与后测；完整双市场可信基线尚未达到。下一步先缩小采样验收、改善千问 token 协议、恢复 Cloro 限流与桥接，再谈内容自动化。

## 整合版本与本地交接

`codex/opengeo-vnext` 为本轮整合分支，包含分析投影、报告、来源入口、问题校验、运行选择与样本身份修复、同目标停止保护、内容机会及 Cloro。历史 diagnosis 分支中的自动重试和无确认事实观察稿没有整段回并：与当前失败即停和品牌事实门禁冲突；其临时 ChatGPT 检查页改动已取回。分支存在不代表远程 main 已合并。

服务版本改为从 package.json 读取现有 0.2.0，中文侧栏同源显示，消除硬编码 0.1.0。针对本轮截断，观测预算改为 2500，写入协议；未再次调用收费 API，不声称已验证质量改善。构建与 113 项单测通过；22 项浏览器测试通过。`browser:probe` / `browser:check` 仍为 bridge_unreachable，没有采新网页样本。

确认原 8847 进程属于本工作树且 activeRunCount=0 后，停止旧服务，用整合分支启动本地 8847，数据目录沿用用户 Vault 的 `code/data/citekeel`。未覆盖主目录中的未提交代码。状态已返回五目标及 Cloro monitorProviders；中英文看板、Actions、HTML 导出读取新 run 的冒烟检查通过，没有额外采样请求。Cloro Key 未存储，后续可临时填写。

用户指定所有面试材料统一放到 Vault 的 `面试准备/`：阅读入口、项目总答、亮点追问、真实性审计和数据采集 know-how。工程事实仍以本任务和生效规格为准，面试资料链接证据，不另立工程路线图。


## API-only 与 Actions 修复（用户再次调整优先级）

根因：国内默认模板仍设 browser_first；旧 run 持久化了含 78 个失败记录 ID 的 measurement Action，英文 actionList 无分类且全量展开引用。切换采集器不会重算旧 run，因此用户仍看到采集修复充当品牌建议及密集重复按钮。

按最新用户指令，五个默认入口均设 api_only：海外 Cloro ChatGPT/Gemini，国内 OpenRouter DeepSeek/千问/Seed；保留明确选择浏览器的历史兼容路径，默认诊断不发网页请求或创建网页 skipped。浏览器自动化后置。国内搜索默认关闭，模型 API 基线不代表消费级网页联网结果。

中英文 Actions 共用分类投影，将 measurement 类独立于品牌优化清单；显示本批次有效/计划与运行记录入口，不显示 78 条工程失败任务。英文回答/问题引用先去重后各最多显示 3 个。保留历史数据和动作，不伪造重新采集成功；新路由并不消除 API 本身的 429、超时、空回答或截断。

回归先红：默认路由单测在 browser_first 条件失败；保存旧失败任务的浏览器回归在找不到独立 Collection status 处失败。修复后验证中英文既有内容任务仍可见、工程任务不入品牌清单、重复链接折叠、旧持久化记录不变，并跑全套构建/单测/浏览器回归。未发起收费采样。

最终验证：build、113 项单测、23 项浏览器测试通过。本地 8847 重启后五目标均返回 api_only；真实松灵旧 run 的 Actions 显示独立 2/50 采集状态、3 个品牌相关任务、6 个证据链接，无 78 条失败任务。已检查实际截图。未重采，旧 run 保留。
