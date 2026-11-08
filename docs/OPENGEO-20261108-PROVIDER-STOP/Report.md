# 修复与证据

JS / NET：OpenAI 地区拒绝后旧循环仍继续请求后续题。改为按 target.id 复用会话，并复用主目标策略会话，失败后不再发送同目标网络请求。单元继续显式记录失败，其他平台独立执行。

新增三题地区拒绝回归；旧实现失败；只复用采样会话时仍有一次策略调用，测试继续失败；复用主目标会话后通过。npm run build 与 npm test（109 项）通过。

面试故事：单题的费用保护无法自动覆盖题集循环，必须核对状态的生命周期与调用路径。未声称降低了具体费用比例。

## 2026-11-08 采样入口收敛

- [x] 海外执行入口收敛为 ChatGPT 与 Gemini；Perplexity 不再出现在默认诊断矩阵。
- [x] ChatGPT 默认走 Xue + Kimi 网页；网页失败时，当前题、当前平台才可补测 OpenRouter，并保留两次尝试的身份。
- [x] Gemini 默认走 OpenRouter 的 Gemini 模型作为可执行基线。
- [x] DeepSeek、千问、豆包记录浏览器优先策略；因为正式网页 adapter 尚未实现，当前执行时明确降级为 OpenRouter API，协议和样本不冒充网页。
- [x] Cloro 未加入通用 ProviderCatalog。官方 Gemini 接口和 HTTP 合约未核实，现阶段只作为外部监测适配器候选；避免把未知协议写成已接通能力。
- [x] `searchMode` 与 `browserPreference` 写入目标和 protocol ID，可在回放时区分 Provider 原生搜索、网页搜索和未启用搜索。

验证：`npm run build`、`npm test` 通过；浏览器测试原有断言已更新为两款海外平台，完整浏览器回归待最后一轮执行。
