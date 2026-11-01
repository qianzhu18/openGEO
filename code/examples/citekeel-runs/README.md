# 实际执行的案例报告

这些文件由 CiteKeel 0.1.0 的实际本地工作流生成。执行时间、样本数与检查结果见 [summary.json](summary.json)。

- [合成制造业：冲突未确认时](sensor-conflict.md)
- [合成制造业：确认后生成内容](sensor.md)
- [PostHog：公开历史归档](posthog.md)
- [NiubiStar：公开历史归档](niubistar.md)
- [PostHog：新 API 观察与模型草稿](posthog-live.md)
- [实时验证及失败修正记录](live-summary.json)

对应 JSON 是白名单导出。合成数据仅用于流程验证；公开归档的模型回答来自上游在 2026-09-08 的执行。前三项是零新模型调用的回放；最后一项是实际 API 未联网基线，最终一轮共 4 次调用。没有验证线上优化提升。
