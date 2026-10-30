# 公开归档核验记录

核验日期：2026-10-29。类型：公开数据只读检查。新增模型调用：0；新增模型调用费用：0。

## 目的与范围

判断 niubigeo 公开归档是否具有本项目需要的回答原文、失败状态和来源关联信息，为测量适配设计提供依据。

固定提交：`dd51eedc8e400006755639c0cb332a7fa1a71420`，对应 Git 标签 v0.3.2。归档包含的是 2026-09-08 的历史测量，不能据文件所在版本推断当时的执行代码也是 v0.3.2。

输入为两个公开文件：

- [R01：niubistar.com](https://github.com/Albert-Weasker/niubigeo/blob/dd51eedc8e400006755639c0cb332a7fa1a71420/examples/cases/R01/public-evidence.json)
- [R04：posthog.com](https://github.com/Albert-Weasker/niubigeo/blob/dd51eedc8e400006755639c0cb332a7fa1a71420/examples/cases/R04/public-evidence.json)

仅检查 `state.measurementRuns[].probes[]` 及它们的 Attempt、evidence，不把 `recognitionRuns` 初始认知记录混入样本数。

## 检查方法

1. 按 measurementRuns 数运行数，按 probes 数计划探针，按 attempts 数尝试。
2. 保留所有状态，分别统计探针状态与尝试状态。
3. 检查每次尝试是否有非空 `rawAnswer` 和 `rawProviderResponse`。
4. 分开计数 `evidence.providerCitations` 与 `evidence.answerMentionedUrls`。这里的数值是归档项数量，不是跨样本去重后的域名数。
5. 对每项 Provider 引用，按 `attemptId` 找对应尝试，再按 `providerPayloadPath` 读取原始响应，比较其中 URL 与归档 URL 是否相等。

## 实际结果

| 项目 | R01 | R04 |
| --- | ---: | ---: |
| 测量运行数 | 1 | 3 |
| 计划探针数 | 3 | 27 |
| target_domain 探针 | 3 | 9 |
| keyword_discovery 探针 | 0 | 18 |
| completed 探针 | 3 | 24 |
| failed 探针 | 0 | 3 |
| 尝试数 | 3 | 27 |
| 有原文的尝试 | 3 | 27 |
| 有原始响应的尝试 | 3 | 27 |
| analysis_failed 尝试 | 0 | 3 |
| Provider 引用项 | 0 | 3 |
| 正文 URL 项 | 0 | 12 |
| Provider 引用 URL 与原始响应路径匹配 | 0/0，不适用 | 3/3 |

R04 三个测量运行均为 partial。三个失败探针均为 keyword_discovery，对应尝试均为 analysis_failed，仍保存了回答原文。不能把这些记录算成品牌未出现，也不能把它们写成请求没有返回内容。

R04 的 3 个 Provider 来源项均为 provider_annotation。12 个正文 URL 项单独存在，不能合并后宣称得到 15 个 Provider 引用。

对应的机器可读结果见 [JSON 记录](2026-10-29-archive-audit.json)。

## 对本项目设计的影响

- 采集完成与分析完成是两个状态，需要分别统计。
- 引用项的来源类型与原始响应定位信息应保留到报告导出。
- 报告必须能返回样本明细，不能只展示百分比。
- 上游归档可用于设计回放与兼容性验证，不能替代本项目的运行测试。

## 结论边界

本次检查支持“这些公开归档含有可供适配的原文、失败和来源信息”。没有独立核验模型陈述、来源网页支持程度、历史费用或采样代表性，也没有运行上游测试套件、建立新基线或验证优化提升。
