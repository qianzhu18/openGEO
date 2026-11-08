# 任务信息：OPENGEO-20261108-V5-QUESTION-VALIDATION

- **日期**：2026-11-08
- **状态**：进行中
- **负责人**：OpenGEO 维护者
- **触发原因**：松灵 v5 诊断 run 将两个展示分组标签导入为真实采样问题。
- **受影响 run**：`20952027-9bb5-4844-b224-ba55f396c32d`
- **来源报告**：`/Users/mac/Downloads/松灵机器人报告，问题集改变后.md`
- **代码范围**：`code/src/citekeel/question-set.ts`、`code/src/citekeel/server.ts`、`code/src/citekeel/prompts.ts`
- **测试范围**：`code/test/question-set.test.ts`

## 任务目标

防止问题集里的展示标题进入诊断采样；把被污染的 v5 run 记录为质量事故；保留净重跑前必须完成的工程事项。

## 当前决策

原 v5 run 保留为证据，但不作为有效基线，其顶层汇总指标不得引用。有效问题集只包含 10 个编号问题；两个分组标签必须剔除。

## 交接文件

- `Report.md`：已完成的工程审计和验证记录
- `Todo.md`：剩余 P0 / P1 / P2 工作
- `Comment.md`：可对外复制的任务评论草稿

