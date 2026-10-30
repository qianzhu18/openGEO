# CiteKeel 的八项 Skill

每个目录的 `SKILL.md` 定义输入、输出、实现位置与证据边界。实际运行由 `src/citekeel/engine.ts` 统一控制，执行记录可在工作台查看。

本地回放使用规则与历史数据。实时模式通过 niubigeo 的 Provider 适配器取得新回答，并可用模型规划策略和生成内容。模型返回无效证据 ID 时，验证器拒绝该计划。

能力约定可以供其他 Agent 阅读和复用；这里没有自动向系统安装或覆盖用户已有 Skill。
