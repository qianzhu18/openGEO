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
