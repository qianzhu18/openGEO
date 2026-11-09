# API 请求与内容对账

## 背景与目标

用户要求把 SEO / GEO 的原理、需求来源和测量关系记录到 Vault 的 `面试准备/SEO与 GEO.md`，并继续迭代系统：付费采样应有对应内容，采集成功与品牌提及 / Top1 / Top3 必须分开。

外部 API 无法保证 100% 成功。工程目标是请求可追踪、已返回响应先留存、费用有来源、异常显式并阻止继续花费，不把失败当成未提及。API 回答成功不证明执行网页搜索；国内当前默认不搜索。

## 范围与决定

- 复用实际服务 8847 的 `codex/opengeo-v0-4` worktree，交付为 0.4.1；原 Vault 工作目录有大量既有改动，不覆盖代码树。
- 为 ModelSession 和 Cloro 诊断采样增加 `api-receipt/v1`；通过上游传输层的请求级 observer，在适配器抛错之前保存脱敏响应。
- 关联调用、问题、样本、计划单元、用量与已报告费用；保留 UNKNOWN 和本地未发送状态。
- 截断、拒答、工具未结束等不可用回答排除分析，同目标停止；不自动重试。Cloro 继续用次数上限和首错停止，美元成本 UNKNOWN。
- 简报、完整证据和 JSON 增加只读对账视图；费用范围为本轮 measurement，策略/内容与独立官网研究不计入该摘要。
- 不新增供应商付费调用、网页采样、路由或排名公式；不做真实账单核销或事后 generation 查询。

## 交接

生效行为见 [采集](../采集.md)，根因、回归与运行结果见 [Report](Report.md)。实现集中在 `code/src/citekeel/api-receipts.ts`、`skills.ts`、`cloro-monitor.ts`、`engine.ts`、`report.ts`；本地 vendor 补丁见 [UPSTREAM](../../references/UPSTREAM.md)。
