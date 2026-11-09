# 本地持久队列与采样恢复

日期：2026-11-09。版本：0.5.0。分支：`codex/durable-sampling-queue`，基于 `codex/api-receipts-v041` 的 API 回执增量。

用户提出采样失败后需要队列、重试、死信、幂等与数据库，并提供 DOVideo-AI 项目拷打文档讨论 RocketMQ/MySQL。参考资料是设计输入，不是本项目的事实或实施指令。

根因（JS）：`executeRun` 在内存循环里执行题目，旧 JSON 快照没有独立任务状态，无法区分未发送、已发送但结果未知和可以安全继续的工作。服务商本身的 429、空回答、截断和额度错误仍需分别处理，增加队列不等于恢复服务商可用性。

决策：本地单服务以 SQLite WAL 保存任务与运行快照，使用同一事务消除新增消息代理带来的双写窗口。保留 JSON 兼容镜像，SQLite 为新队列运行的读取权威。原 JSON 历史运行不迁移、不自动重采。只接 API-only 多平台品牌诊断；旧浏览器与独立单模型入口保持原流程。

参考：`/Users/mac/qianzhu Vault/project/videoagent/模拟面试/炒肉多问题梳理/项目拷打文档.md`，开篇第 4 条明确讨论低并发引入 RocketMQ/Redisson 的过度设计；参考其任务 ID、异步执行、Checkpoint 和前端轮询，不沿用“绝对幂等”的外部 API 承诺。

交付与验收见 [Report](Report.md)；剩余范围见 [Todo](Todo.md)。
