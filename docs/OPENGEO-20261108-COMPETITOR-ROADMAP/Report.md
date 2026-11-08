# 国内外竞品与规划交付记录

状态：reference。最后复核：2026-11-08。

## 已交付

- [Klepsy](../../references/competitors/klepsy/README.md)：国内平台/端型、问题组织、报价未知、异步任务/SSE/报告合同、渲染模板风险、REA 证据摘要。
- [Topify 松灵项目](../../references/competitors/topify/12-松灵项目实测-2026-11-08.md)：Overview 数值、模型、主题、Actions 具体性与依据不足、Sources、自然网络状态、当前 Actions chunk 的 REA 摘要；明确本轮未生成独立报告。
- [比较](../../references/competitors/COMPARISON.md#2026-11-08-国内外商业产品实测)与[版本待办](../todo/版本里程碑.md)：M0–M7，逐项复选框、下一版与长期候选、验收、工程边界、面试最小链路。

## 工具、失败与取舍

REA 6.8.0 直接 CLI 分析公开 JS。Klepsy 1/1 文件、110 findings、0 parse failure；Topify 本轮只选 Actions 当前 chunk，1/1、447 findings、0 parse failure。范围是静态前端，不是服务端源码或对后台采样的确认。完整工具 Evidence 与输入留在忽略提交的本地 data，references 只保存摘要、公开 URL、哈希和短证据片段；摘要不能冒充完整原始 Evidence。

初次 REA 遇 macOS SwiftBridging 重复 module map，工具无法完成；采用临时 Swift VFS overlay 后两次分析成功，系统文件不变。工具声明要求略高于本机 Node 22.23.2，复现应满足其 Node 要求。故事边界：可以讲诊断工具链冲突并验证恢复，不能说发现了竞品服务漏洞。

Kimi 健康检查显示扩展已连接后读取指定竞品页；这不是 OpenGEO 的 Xue 真实 AI 采样身份验收，本轮没有提交观测题。Topify Prompts 路由报错、主题子项 Loading、heatmap 404，故没有把子项与原文缺口推成确定分母；原用户 Overview 标签已恢复可读。没有按未知效果连续重试付费任务。

最关键的事实修正：10积分不等于人民币10元/题；海外引擎不等于只支持英文题或国外信源；页面有引用不等于支持事实；具体建议不等于正确建议。下一版优先可信观测与有依据的动作，再做完整进度 UI 和新平台。

未保留账号截图、身份、余额、认证头或 Cookie。页面原始快照仅作本机临时取证；有账号界面的临时截图已移出仓库。没有产品代码改动，没有启动新付费采样或内容发布。

## 验证与遗留

验证完成：docs-ops 检查器通过（其状态筛选只检查到 4 个链接）；另对本轮 11 份新增/更新 Markdown 全量检查 100 个本地链接及标题锚点，0 错误；两份 REA 摘要 JSON 解析、证据文件存在性与零 parse failure 校验通过；完整 Evidence 已确认被 Git 忽略。已跟踪文件 scoped diff 空白检查通过，新增文件逐行空白检查通过。没有本轮代码测试结果；前轮 101 单测 / 17 浏览器测试仅适用于其当时的品牌来源实现。M1–M7 均未因此打勾，正式净 v5、公司 PDF 实际入库、品牌约束模型、策略语义验收、真实发布与后测仍待执行。
