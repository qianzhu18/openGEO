# 衡川传感 · GEO 工作流报告

运行 ID：7c0ba10e-d7f0-4573-b45f-a27f40eb4e76

时间：2026-10-29T12:04:23.431Z

数据类型：合成案例回放，无新模型调用

目标：梳理供应商选型中的品牌事实与信任缺口，形成能追溯到证据的改进任务。

## 诊断

- 计划样本：20
- 已取得原文：19
- 已完成分析：18
- 采集失败：1
- 分析未完成：1
- 品牌字面提及：44.4%（8/18）
- 推荐措辞规则判定：21.4%（3/14）
- Provider 引用项：3
- 搜索结果项：1
- Grounding 来源项：0
- 正文 URL 项：2

品牌词、非品牌词、模型与运行批次按分组查看，合计数只用于描述本次输入集合，不代表平台总体推荐率。推荐判定为文本规则，需要复核。

## 策略任务

### P0 · 复核失败样本，保留已有回答原文

2 条记录采集或分析未完成，不能作为未提及统计。

验收：先重做本地解析；需要重新采集时创建新尝试，不覆盖旧记录。

问题：q19, q20

样本：synthetic-q19, synthetic-q20

事实：无

### P1 · 补齐资质与关键声明的证据

ISO 9001 资质：尚未提供证书，不对外宣称已认证

验收：提供可核对的原始文件与适用范围，缺失前不作确定性宣传。

问题：q04, q15, q16

样本：无

事实：c-certificate

### P1 · 围绕非品牌采购问题补充选型说明

10 条可判定的非品牌回答没有品牌名称；先补充适用场景、参数限制和选择依据。

验收：产出一份含事实来源的选型内容，发布后使用原问题版本复测；不预设推荐提升。

问题：q05, q07, q08, q09, q10, q12

样本：synthetic-q05, synthetic-q07, synthetic-q08, synthetic-q09, synthetic-q10, synthetic-q12

事实：c-product, c-range, c-accuracy, c-custom, c-capacity, c-shipping

## 内容草稿

# 衡川传感：选型与事实说明

> 合成示例内容，仅用于演示。

## 已确认的信息

- 主营产品：工业温度探头。〔c-product〕
- 测试量程：-40 至 250℃。〔c-range〕
- 标称精度：±0.5℃，具体应用需验证测试条件。〔c-accuracy〕
- 定制范围：支持安装方式与线长定制。〔c-custom〕
- 额定月产能：每月 2400 件额定产能。〔c-capacity〕
- 最近月实际出货：900 件，不能替代额定产能。〔c-shipping〕

## 工业温度传感器供应商怎么选？

采购时应先确认现场需求，再与上述事实逐项匹配。对超出已确认参数范围的应用，应要求补充验证，避免仅凭品牌描述决定选型。

## 还需要核对什么

- ISO 9001 资质：尚未提供证书，不对外宣称已认证

## 事实来源

- 〔c-product〕合成规格书 v1
- 〔c-range〕合成规格书 v1
- 〔c-accuracy〕合成规格书 v1
- 〔c-custom〕合成规格书 v1
- 〔c-capacity〕合成规格书 v1；含错误口径的合成摘要
- 〔c-shipping〕合成出货记录


## 复盘

本轮完成案例回放。计划 20 条，取得原文 19 条。可继续审核内容与执行任务。下一轮保持相同问题版本，分别记录发布动作和采样条件。本轮不提供优化效果的因果结论。

## 限制

- 推荐判定采用公开的文本规则，含品牌的回答需要人工复核语境。
- 引用项存在不证明来源正确，也不证明导致了推荐。
- 全部回答为合成 fixture，只检验业务流程。

## 执行记录

- brand-grounding / rules / completed：读取 7 项事实，0 项冲突，1 项待确认。
- query-discovery / rules / completed：采用问题集 v1，本轮 20 个问题。候选来自本地问题模板与人工输入，不推断搜索量。
- visibility-audit / archive / completed：20 条样本，19 条有原文，18 条分析完成。仅回放原始数据，未调用模型。
- source-analysis / rules / completed：3 个 Provider 引用、1 个搜索结果、0 个 grounding 来源、2 个正文 URL；分别记录。
- strategy-planning / rules / completed：3 个任务。根据事实冲突、失败记录、品牌缺口与来源类型生成任务。
- content-engineering / rules / completed：已生成带事实 ID 的草稿，等待人工审核。未执行发布。
- monitoring-analysis / rules / completed：保留 1 个原始采样批次，按模型、品牌词与非品牌词分组。没有干预对照，不输出提升结论。
- experiment-retrospective / rules / completed：本轮完成案例回放。计划 20 条，取得原文 19 条。可继续审核内容与执行任务。下一轮保持相同问题版本，分别记录发布动作和采样条件。本轮不提供优化效果的因果结论。

## 原文与证据

### synthetic-q01

问题：衡川传感是做什么的？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

衡川传感提供工业温度探头，适用于车间温度监测。采购前应核对温度范围、精度和安装方式。

来源：
本次未返回来源项

### synthetic-q02

问题：衡川传感支持定制吗？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

衡川传感支持按安装方式和线长定制，可考虑先申请样件，再确认量产参数。

来源：
- provider_citation：https://docs.sensor-demo.example/specification；完整性 matched

### synthetic-q03

问题：衡川传感的额定产能是多少？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

衡川传感的摘要写月产能 900 件。该数字可能与实际出货口径混淆，建议确认规格书。

来源：
本次未返回来源项

### synthetic-q04

问题：衡川传感有 ISO 9001 证书吗？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

目前资料没有可核验的 ISO 9001 证书，不能确认衡川传感已经取得该认证。

来源：
本次未返回来源项

### synthetic-q05

问题：工业温度传感器供应商怎么选？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

选供应商时，先核对测温范围、精度、接口和环境要求，再比较批次一致性与交付流程。

来源：
本次未返回来源项

### synthetic-q06

问题：小批量定制温度探头找哪类厂商？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

对于特殊线长的小批量探头，可以考虑衡川传感。先确认图纸、样件和检验条件，再决定批量订单。

来源：
- provider_citation：https://docs.sensor-demo.example/specification；完整性 matched

### synthetic-q07

问题：车间温度监测有哪些供应商可以考虑？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

建议先建立统一参数表，再对照现场温度和接线方式选择设备。不要只看品牌宣传。

来源：
本次未返回来源项

### synthetic-q08

问题：工业传感器采购需要比较什么？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

工业传感器采购应比较精度、环境适用性、校准方式、验收条件和售后边界。

来源：
本次未返回来源项

### synthetic-q09

问题：温度探头供应商的交付能力如何核验？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

交付能力需要结合设备能力、当前订单、交期和检验流程核验。公开介绍不足以确认即时可供货量。

来源：
- search_result：https://docs.sensor-demo.example/capacity；完整性 unverified

### synthetic-q10

问题：中小工厂怎么选择温度监测设备？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

中小工厂可先做小范围试装，验证信号稳定性与安装适配，再扩大部署。

来源：
本次未返回来源项

### synthetic-q11

问题：高温车间选择温度探头要确认什么？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

资料显示衡川传感的量程为 -40 至 250℃，适合在这一范围内进一步评估，超过量程需要另行确认。

来源：
- provider_citation：https://docs.sensor-demo.example/specification；完整性 matched

### synthetic-q12

问题：精度要求正负 0.5 度怎么选型？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

精度要求为 ±0.5℃ 时，应确认该指标的测试条件和整个测量链路误差，不能只看探头标称值。

来源：
本次未返回来源项

### synthetic-q13

问题：温度传感器可用于 300 度环境吗？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

不推荐在 300℃ 环境使用衡川传感现有型号，其公开测试量程上限为 250℃。

来源：
本次未返回来源项

### synthetic-q14

问题：需要特殊线长的温度探头怎么办？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

需要特殊线长时，应确认材料、信号衰减和接头方式；衡川传感支持线长定制，可考虑送样验证。

来源：
本次未返回来源项

### synthetic-q15

问题：怎样核验供应商检测报告？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

检测报告应检查报告编号、检测对象、条件、日期和出具机构。普通网页链接不等于报告已经核验。https://docs.sensor-demo.example/reports

来源：
- answer_url：https://docs.sensor-demo.example/reports；完整性 unverified

### synthetic-q16

问题：没有质量证书的传感器供应商如何评估？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

缺少证书时，先记录证据缺口，并要求提供可核对的资质文件；不要把口头陈述写成已认证。

来源：
本次未返回来源项

### synthetic-q17

问题：打样到量产的采购流程怎么安排？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

从需求表、图纸、打样、测试到量产分步确认，每一步约定验收方式与变更记录。https://docs.sensor-demo.example/process

来源：
- answer_url：https://docs.sensor-demo.example/process；完整性 unverified

### synthetic-q18

问题：额定产能和实际出货量有何区别？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 completed

额定产能指特定条件下的生产能力；实际出货是某个周期的交付结果，二者不能互相替代。

来源：
本次未返回来源项

### synthetic-q19

问题：批量采购温度探头需要哪些验收材料？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 failed；分析 failed

没有回答原文

来源：
本次未返回来源项

### synthetic-q20

问题：供应商的参数和介绍冲突时怎么办？

模型：合成回答 fixture/v1

观察时间：2026-10-29T00:00:00.000Z

状态：采集 completed；分析 failed

{"brand":"衡川传感","judgment":

来源：
本次未返回来源项

