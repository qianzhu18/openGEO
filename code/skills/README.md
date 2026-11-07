# OpenGEO Skills 与案例交付

完整案例先读 [opengeo](opengeo/SKILL.md) 和[案例架构](../../docs/案例交付.md)。受众与决策由 [audience-research](audience-research/SKILL.md) 明确，问题进入 [content-layout](content-layout/SKILL.md) 后再写正文，避免只给泛泛建议或一批标题。

松灵首轮：在 code/ 执行 `npm run campaign -- run "../案例/松灵机器人/第1轮"`。语义分析保存在策划，代码做来源／引用校验、有效采样统计和交付生成，不新增模型调用；真实采样、发布和业务效果仍须各自验收。

# CiteKeel 的八项 Skill

每个目录的 `SKILL.md` 定义输入、输出、实现位置与证据边界。实际运行由 `src/citekeel/engine.ts` 统一控制，执行记录可在工作台查看。

本地回放使用规则与历史数据。实时模式通过 niubigeo 的 Provider 适配器取得新回答，并可用模型规划策略和生成内容。模型返回无效证据 ID 时，验证器拒绝该计划。

能力约定可以供其他 Agent 阅读和复用；这里没有自动向系统安装或覆盖用户已有 Skill。
