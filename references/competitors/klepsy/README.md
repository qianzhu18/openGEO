# Klepsy 国内 GEO 诊断逆向

状态：reference。复核：2026-11-08。用途：给 OpenGEO 的本地诊断、国内覆盖和任务进度设计提供证据。只分析用户可访问的前台与公开分发脚本，不恢复私有服务端，也未提交消耗积分的任务。

## 结论与边界

**UI：国内平台选择、按主题组织问题、运行前报价、异步诊断记录是主要产品结构。JS：客户端存在诊断任务、进度事件、结果和报告文件合同。UNKNOWN：实际采样工人、真实终端、计费兑换、成功率和正式报告质量。**

[官网](https://www.klepsy.com/) · [品牌诊断](https://www.klepsy.com/diagnosis?query=&brand=%E6%9D%BE%E7%81%B5%E6%9C%BA%E5%99%A8%E4%BA%BA) · [REA](https://github.com/morluto/rea) · [本轮静态证据摘要](evidence/2026-11-08-rea摘要.json)

## 前台工作流（UI）

1. 品牌名称 → 基础版 / 专业版 → 主题与问题 → 检测平台与端型 → 报价 → 提交 → 诊断记录。
2. 用户提供截图：问题按主题分组，包含价格与决策、风险与实施、品牌召回；主题有手动添加、继续推荐，题目有复制、删除、移动，显示问题类型与热度。热度 78、76、75 等的来源未核实，不等于搜索量。
3. 本次页面读取：品牌为松灵机器人，基础版 / 专业版可见；诊断记录为空。未生成正式报告。
4. 平台矩阵：豆包、DeepSeek、元宝、千问均显示网页版 / 手机版；KIMI、文心、百度 AI、AI 抖音显示网页版；小红书 APP.点点卡片也显示网页版。端型名称是产品标签，不能证明其后台确实使用对应设备或浏览器。

截图中的「10积分」**不能证明一题收费人民币 10 元**。需要确认积分兑换、所选问题数、平台数和优惠；脚本中有 promptCount、platformCount、requiredPoints、submitUnitCount 等合同，也不能单靠这些字段推导价格公式。用户对成本的体验作为需求来源保留，价格事实保持 UNKNOWN。

## 公开客户端恢复（JS）

当前诊断页面为 Vue 编译产物。分析文件：`BrandDiagnosis-BLBm4yV3.js`，127,909 bytes，SHA-256 `6625af67bff494d9652ab6123aedc553a28b8a9d18131d15bfeaa1279d0b4fff`。下表为静态引用，不代表本轮逐个调用成功。

| 合同 | 静态行为 |
| --- | --- |
| POST `/api/wk/pre-sales-diagnosis/pricingRule/getActive` | sceneCode 对应报价规则 |
| GET `/api/wk/pre-sales-diagnosis/tasklist` | 诊断任务列表 |
| POST `/api/wk/pre-sales-diagnosis/task_commit` | 专业路径提交 |
| POST `/api/wk/pre-sales-diagnosis/tasks/{taskId}/stream-ticket` | 申请事件流票据 |
| GET `/api/wk/pre-sales-diagnosis/tasks/{taskId}/events` | SSE；ticket、lastEventId、fromId；存在恢复游标 |
| GET `/api/wk/pre-sales-diagnosis/tasks/{taskId}/result` | 读取任务结果 |

事件候选：agent_trace、status、progress、tool_call、tool_result、done、error。基础路径导入 monitor chunk，诊断文件可见提交对象包含 requestId、bizId、sceneCode、brandName、prompts、brandTopics、competitorBrands、myBrands、platforms；本轮没有解析该依赖的完整实现，不把上述专业接口套到所有模式。

结果映射字段包括：taskId、requestId、diagnosisType、billingStatus、aiQuestionCount、platformCount、submitUnitCount、platforms、questions、aisoAnswers、files、aisoTotalCount、aisoSuccessCount、aisoFailedCount、aisoTimeoutCount、resultContent、ossFileUrl、errorMessage、createdAt、finishedAt。静态文件类型可见 `DIAGNOSIS_REPORT`；状态含排队、运行步骤、完成、失败与退款分支。**不证明每次任务都会完整返回这些字段。**

报告视图映射可见 brandScore、brandMentionRate、avgMentionRank、mentionCount、positiveNeutralSentiment。没有运行结果，不能判断这些数值的公式或可信度。脚本字符偏移约 8,555 的引用列表模板含固定日期 `2026-05-11` 和固定类别「门户/自媒体平台」。这是渲染模板风险，未证明本次真实报告出现错误；OpenGEO 不应以固定日期/类别填补未知来源元数据。

## REA 运行与恢复

REA 6.8.0 CLI 完成诊断 chunk 的静态分析：1/1 文件、36,735 AST 节点、110 findings、0 parse failure。Evidence ID 见摘要。findings 数是工具分析量，不是漏洞数；只输入一个 chunk，依赖未全量恢复。

第一次运行受 macOS SwiftBridging 重复 module map 阻塞。随后使用临时 Swift VFS overlay 屏蔽重复声明，原文件和系统配置未修改，重跑成功。Node 22.23.2 低于该包声明的 22.23.4 下限，虽然实际运行成功，复现应使用满足工具要求的版本。完整 Evidence 和输入脚本保存在忽略提交的 `code/data/competitor-research/20261108/klepsy/`，摘要附完整文件哈希；临时截图和登录态原始快照不进入仓库。

复现：从上方公开 asset URL 取得脚本，核对哈希，在项目外目录运行 `rea analyze-javascript-application <仅含选定脚本的目录> --json`。本次使用已有安装的绝对入口 `node /Users/mac/.local/share/rea-cli/node_modules/rea-agents/scripts/rea.mjs`。静态分析不执行目标 bootstrap，不扫描私有接口、不绕过付费墙。

## 对 OpenGEO 的启发（INFER）

- 借鉴「品牌 → 问题 → 平台 → 计划预览」；题目分类要显式保存，热度没有来源就 UNKNOWN。
- 平台卡片增加真实能力、网页/API、已验证/未实现、配置状态；国内平台的 API 不能冒充其网页版。
- 长任务显示阶段、计划/处理/有效/失败、最后心跳与中断状态；恢复读取状态，不重新提交同一问题。
- 区分尝试数、计划单元和有效回答数；失败原因可定位到题目和入口。
- 不照搬积分、账号、计费、退款与多租户。只研究业务合同，不据此前端断言「后台只是一台电脑」。

本地版本的取舍与验收统一在 [里程碑待办](../../../docs/todo/版本里程碑.md)，不在竞品资料维护第二套任务清单。
