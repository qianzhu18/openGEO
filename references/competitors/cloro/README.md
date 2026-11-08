# Cloro 监测 API 适配证据

状态：`active`。核验：2026-11-08。

DOC：[官方 Python SDK](https://github.com/cloro-dev/cloro-python)、[官方 TypeScript SDK](https://github.com/cloro-dev/cloro-node)、[PyPI 0.4.0](https://pypi.org/project/cloro/)。官网 docs 在本次轻量读取中返回 403；改读官方发布 SDK，未绕过登录或付费限制。[来源哈希](sdk-evidence.json)保留读取范围。

- `POST https://api.cloro.dev/v1/monitor/chatgpt`
- `POST https://api.cloro.dev/v1/monitor/gemini`
- Bearer 认证；body 为 `prompt`、`country`、`include: {markdown:true}`。OpenGEO 当前不发送 state，因为 SDK 只显式为 Bing 的 state 约束建模。
- 成功响应 `success:true`、`result.text`；官方 README 展示 `result.sources[].url/label/position`。sources 不自动升级为已采用引用或事实支持。
- SDK 默认会重试；本地适配器取消自动重试，失败停止同目标，最多 10 次监测。费用未知保留 UNKNOWN，不把 credits 换算为 USD。

工程：独立 `CloroMonitor`，仅通过诊断矩阵进入。通用模型 ProviderCatalog、策略与内容生成不注册 Cloro。传输仍是 API，协议为 `remote-monitor`，底层模型 UNKNOWN。Cloro 的“真实网页监测”是服务方能力描述；不声称已独立验证其采集 worker 或获得本机网页 DOM/截图。
