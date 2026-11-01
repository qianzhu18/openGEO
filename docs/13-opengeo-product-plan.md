# OpenGEO 怎么做才算做好

日期：2026-11-02。基于三份拆解：Topify（商业闭环，[10](../references/competitors/topify/10-public-api-and-service-logic.md)）、niubigeo（测量严谨性，[deep dive](../references/competitors/niubigeo-deep-dive.md)）、开源格局（[landscape](../references/competitors/oss-geo-landscape.md)）。

## 1. 先定输赢标准

**不要做"第 7 个 AI 可见度仪表盘"。** 这个位置已经被 niubigeo、OneGlanse、GEO/AEO Tracker、Ansvisor、GetCito 占满。

OpenGEO 要赢，只可能赢在一件事：**别人给分数，我们给"能复算的交付"**。

一个外部用户定义"好"的标准应该是：

1. 5 分钟内，从官网跑出第一份报告；
2. 报告里每个数字都能点回原始回答、协议、分母与排除样本；
3. 每个建议都绑定证据与验收条件；
4. 改完之后，能用同一协议复测，并诚实披露"相关不等于因果"。

## 2. 定位

**一句话**：OpenGEO 是一个开源的 GEO 交付引擎——把 AI 回答变成可回放的证据、可执行的动作、可复测的结论。

**三个证明**（必须是产品里真实存在的功能）：

| 证明 | 具体形态 | 现在有没有 |
| --- | --- | --- |
| 可回放 | `opengeo replay <run>` 从原文重算指标，结果一致 | 部分（CLI replay 已有，指标未全接） |
| 可执行 | 动作绑定证据 ID，审批幂等，重启可恢复 | 无（只有规则任务） |
| 可复测 | 固定问题版本/引擎/地区/窗口，前后对比 | 无（只有单轮） |

**明确不做**：保证排名、私有 volume 估算、批量内容农场、自动发第三方平台、把 API 结果说成网页结果。

## 3. 目标用户与最小场景

| 优先级 | 用户 | 最小可用场景 | 付费意愿 |
| --- | --- | --- | --- |
| P0 | GEO/SEO Agency | 给客户出一份可辩护的诊断报告 + 30 天复测 | 高（按项目） |
| P1 | AI-native SaaS 创始人 | 官网 → 诊断 → 三条动作 → 自己发 | 中（订阅/一次性） |
| P2 | 开发者/技术营销 | CLI/MCP 接进现有工作流 | 低（但传播强） |

P0 决定收入，P2 决定传播。先服务 P0 的交付，再用 P2 做分发。

## 4. 架构：三层分离

```text
collect（采集） → judge（判定） → deliver（交付）
```

### 4.1 采集层

| Adapter | 状态 | 说明 |
| --- | --- | --- |
| API | 已有基础（OpenRouter 等） | Claude、Perplexity、OpenAI(search)、Gemini |
| Browser | **待做** | 本机 Chrome/ego lite 的 CDP；远程 Chrome；必须记录"UI 还是 API" |
| Import | 已有（JSONL/HAR 部分） | 用户导出的回答、截图、HAR |
| Platform | 待做 | Reddit 公开 JSON、G2、媒体（只做公开数据） |

约束：**采集协议必须落盘**（引擎、模式、地区、账号类型、时间、模型版本），否则数字不可比。

### 4.2 判定层

复用并强化现有 `brand-metrics.ts`：

```text
Attempt（原始响应）→ Observation（可用样本）
  → 品牌归一化（别名/域名/歧义标记）
  → 提及、位置（字符偏移）、情感、SOV、引用
  → MetricSnapshot（可重算）
```

必须坚持 niubigeo 的三条纪律：

1. 失败/排除不进分母，**null ≠ 0%**；
2. 重试是 Attempt，不是新样本；
3. 证据偏移可校验（`slice(start,end) === quote`）。

### 4.3 交付层

```text
诊断报告（HTML/JSON，含证据链）
  → 动作（4 类：on-page / new content / update / forum）
  → 草稿（只用已确认事实）→ 审批（checkpoint）
  → 发布（自有站 CMS adapter；第三方人工）→ 回执
  → 复测（固定协议）→ 对比报告
```

这是 Topify 有、niubigeo 没有、开源侧基本空白的一段。

### 4.4 存储与调度

- **存储**：从 JSON 文件迁到 SQLite（单机）→ Postgres（托管）。保留 JSON 导出，保证可移植。
- **调度**：cron + occurrence + 预算账本，直接采用 niubigeo 的语义：
  - 幂等键 `taskId:scheduledFor`；
  - 上次未结束则跳过；
  - request/token/cost 三类预算；
  - 终态对账。
- **执行**：server 与 worker 分离，worker 可单独部署（这是 niubigeo 的教训，也是可运维的前提）。

## 5. 与两家的分工

| 维度 | Topify | niubigeo | OpenGEO 目标 |
| --- | --- | --- | --- |
| 采集 | 网页 UI 为主（4 引擎）+ Claude API | API 为主（OpenRouter） | API + 浏览器双适配，明确标注 |
| 测量 | 商业口径，部分不公开 | 严谨、可重算、披露已知问题 | 严谨 + 可重算 + 公开协议 |
| 交付 | Actions + 审批 + CMS | 报告 + 服务 | 动作 + 审批 + 发布回执 + 复测 |
| 形态 | SaaS | 自托管 Web | CLI + Web + MCP |
| 商业 | 订阅（$149–599） | 服务（¥99 报告/真人测试） | 开源 + 服务/托管（后续） |

**一句话**：Topify 的闭环 + niubigeo 的严谨 + 开源的分发。

## 6. 90 天路线图

| 阶段 | 时间 | 交付 | 验收 |
| --- | --- | --- | --- |
| P0 冻结 | 第 1–2 周 | 数据契约（Project/Prompt/Attempt/Observation/Metric/Action/Publication）+ SQLite 迁移 | 一条命令从旧数据迁移；56 项测试仍过 |
| P1 一条链路 | 第 3–4 周 | `opengeo audit <url>`：建档 → 问题 → 3 次采样 → 报告 | 外部用户 5 分钟跑通；失败显式；报告含协议与分母 |
| P2 采集与调度 | 第 5–6 周 | 浏览器 adapter（单引擎）+ 本地 scheduler + 预算/attempt | 连续 3 天自动跑；重启恢复；重复不重复计费 |
| P3 交付闭环 | 第 7–8 周 | 动作 → 草稿 → 审批 → 发布登记 → 复测 | 每个动作有证据；审批幂等；复测对比可导出 |
| P4 分发 | 第 9–12 周 | Docker、MCP、对比页、第一份公开基准、v1.0 | 外部安装 ≥300；报告被引用；HN/PH 上线 |

**不要并行做**：Competitors 页、Members、Billing、CMS 全量适配——这些是 P3 之后的事。

## 7. 度量

**产品**：首次报告耗时（目标 <5 分钟）、replay 一致率（100%）、失败样本显式率（100%）、自动跑成功率（>95%）。
**增长**：stars、`npx`/Docker 首次运行、完成一次 audit、4 周留存、AI 答案引用率、agency 对话数。
**反指标**：报告被质疑无法复算的次数、issue 里"看不懂"的比例、每客户模型成本。

## 8. 风险

| 风险 | 应对 |
| --- | --- |
| 浏览器采集被封/易碎 | 默认 API；UI 采集单开关 + 披露；账号与地区隔离 |
| 指标争议 | 协议、分母、失败样本全公开；提供 replay |
| 与 niubigeo 同质化 | 只讲交付闭环与可复算，不做"又一个报告" |
| 上游 license/归属 | Apache-2.0 保留 NOTICE；README 明确 vendored 版本与增量 |
| 范围膨胀 | 每阶段只做一条链路，拒绝"顺便加个页面" |
| 单作者疲劳 | 自动化测试、模板化 issue、限定支持范围 |

## 9. 未来两周的具体任务

1. 写 `docs/14-data-contract.md`：实体、字段、状态机、幂等键、错误码。
2. SQLite 迁移：`store` 接口不变，内部换实现；旧 JSON 自动导入。
3. `opengeo audit <url>` 串起来：research → prompts → 3 次 API 采样 → 报告（含协议）。
4. 报告加"证据链"：每个指标可跳到回答与引用。
5. replay 一致性测试：同输入重算指标，断言相等。
6. 用 openGEO 自己跑一次（官网/README），把结果作为第一个公开案例。

## 10. 反模式

- 先做漂亮仪表盘，再补数据可信度；
- 用"预计提升 X%"当卖点；
- 抄 niubigeo 的案例数量，不抄它的证据纪律；
- 把"发布成功"写成"被 AI 引用"；
- 在没有 scheduler 的情况下宣称"持续监测"；
- 为了 star 做与产品无关的蹭热点功能。

---

**结论**：OpenGEO 做好的关键不是功能更多，而是**把一条链路的可信度做到别人无法反驳**：采集有协议、判定有分母、报告有证据、动作有验收、复测有条件披露。先把这条链路跑通，再谈平台化。
