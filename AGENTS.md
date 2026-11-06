# AGENTS.md — 在这个仓库里工作

本文件是给 AI Agent 与新贡献者的工作约定。产品方向、边界和验收以 [docs/13 产品计划](docs/13-产品计划.md) 与 [docs/15 本地浏览器与复刻策略](docs/15-本地浏览器与复刻策略.md) 为准。

## 0. 先读什么

1. [docs/13-产品计划.md](docs/13-产品计划.md)：定位、路线、反模式
2. [docs/15-本地浏览器与复刻策略.md](docs/15-本地浏览器与复刻策略.md)：为什么本地浏览器是核心
3. [docs/14-采集方式与差异.md](docs/14-采集方式与差异.md)：抓取链路与失败分类
4. [docs/06-路线图.md](docs/06-路线图.md)：当前优先级

## 1. 项目是什么

OpenGEO 是一个**个人可用的开源 GEO 工作台**：用本机的浏览器登录态、API Key 和文件，把 AI 回答变成可回放的证据、可执行的动作、可复测的结论。

**它不是 SaaS，也不打算做商业化版本。**

- 个人用户：自己的电脑、自己的账号、自己的数据。
- 企业/团队/多租户/云端采样/计费/权限：**不在本仓库范围**；这类需求由 Topify 结构的云端产品承接。

## 2. 硬约束：做什么、不做什么

### 要做

- 本地单用户、CLI + 本地 Web
- 复用用户明确选择的本机 Chrome 用户 Xue；本机选择保存在忽略提交的 `code/data/browser-config.json`
- API 采集与浏览器采集并存，明确标注
- 证据三件套：回答原文、DOM、截图
- 可导出、可给客户看的诊断报告（个人获客）
- 失败显式、未知显示未知、可 replay

### 不要做

- 账号体系、团队、席位、SSO、权限
- 计费、credits、订阅、发票
- 云端多租户、浏览器农场、账号池
- 排名保证、私有 volume 估算、批量内容农场
- 为了"像 Topify"而增加企业复杂度

## 3. 目录

```text
code/        全部代码与运行数据（npm 项目）
docs/        给人读的文档（中文文件名）
references/  竞品、行业、知识库、上游归属
AGENTS.md    本文件
```

所有命令在 `code/` 下执行。文档里的历史路径 `src/...` 现在指 `code/src/...`；上游 `code/vendor/niubigeo/...`。

## 4. 核心原则

1. **证据第一**：每个数字能回到原文、引用、协议、分母。
2. **UI / API 分开标注**：浏览器采集的结果不能写成 API 结果，反之亦然。
3. **失败不进分母**：`null ≠ 0%`；重试不是新样本。
4. **不编数据**：没有来源就不生成事实；没有搜索量就标 UNKNOWN。
5. **本地优先**：默认不上传、不采集无关页面；用户可一键清除。
6. **可回放**：同一输入能重算指标；协议必须落盘。
7. **小步交付**：一次只打通一条链路，测试和文档同步更新。

## 5. 浏览器采集规则

- 真实 AI 网页采样只使用 **Xue**，运行前核对实际窗口或 profile；接不通标未采集，不回退到旧专用 profile、用户1或其他用户；
- 首次登录/验证码由用户在有头窗口完成，**不绕过**；
- 默认有头（`OPENGEO_BROWSER_HEADLESS=0`）；headless 只适合公开静态页；
- 串行、限速、可中断；用户一操作就暂停；
- 每次采集保存 `answer.txt`、`page.html`、`screenshot.png`、`evidence.json`；
- 不保存密码、Cookie 原文、无关页面内容；
- 平台 ToS 风险写进文档，不隐藏。

### 账号政策（2026-11-05 同步当前用户指令）

- 本机指定 Chrome 用户为 Xue，不复制、导出或读取 Cookie，不通过新 profile 绕过平台配额或风控；
- 使用 Google SSO 的平台沿用指定账号；国内平台由用户按实际方式登录，不强制 Google SSO；Claude 暂不纳入网页采样；
- 旧 `session.ts` 与 Playwright engine 仅留作历史实现，不得用于真实采样或判断 Xue 登录态；当前 `browser:probe/check/ask/batch` 走本机 Kimi 扩展脚本桥接，提交前必须核验 Xue，具体见 [17 脚本化网页采集](docs/17-脚本化网页采集.md)；
- Xue 自动化须连接已有浏览器或扩展并核对实际 profile；验证码和登录由用户本人处理。用户名或采集器 signed_in 标记本身不能证明认证状态；
- 登录墙、验证、失败页面保留原因，不计入有效回答。只有记录而没有真实发布与后测，不能称 GEO 效果闭环。

## 6. 代码地图

| 位置 | 作用 |
| --- | --- |
| `code/src/citekeel/campaign/` | 案例合约、来源、受众、布局、正文、真实采样导入与复查交付；CLI 为 `scripts/campaign.ts` |
| `code/src/citekeel/server.ts` | 本地 HTTP 服务、页面与 API |
| `code/src/citekeel/onboarding.ts` | 官网研究、抽取、回退、模板 |
| `code/src/citekeel/research-service.ts` | 研究任务生命周期与建档 |
| `code/src/citekeel/browser/` | Xue 核验、脚本采集桥接、ChatGPT adapter、证据、CLI；旧专用 profile 实现仅供历史参考 |
| `code/src/citekeel/prompts.ts` | 问题库、主题、表设置 |
| `code/src/citekeel/recordings.ts` | URL 池与候选问题 |
| `code/src/citekeel/brand-metrics.ts` | 品牌归一化与指标 |
| `code/src/opengeo/` | CLI 引擎与回放 |
| `code/public/` | 页面（onboarding、workspace） |
| `code/test/` | 单测与浏览器测试 |

## 7. 命令

```bash
cd code
npm run build
npm test
npm run test:browser
npm start                # http://127.0.0.1:8847

npm run browser:probe    # 验证本机扩展实际连接 Xue；不提交问题
npm run browser:check    # 核验 Xue 与 ChatGPT 有效会话；登录由用户处理
npm run browser:ask -- "你的问题"
npm run browser:batch -- --file questions.jsonl
```

## 8. 文档规则

- 文件名用中文 + 数字前缀；新增文档要登记到 [docs/文档索引.md](docs/文档索引.md)；
- 事实分级：UI / DOC / NET / JS / INFER / UNKNOWN，不要把推断写成事实；
- 未实现的能力必须标"未实现"，不要写成已完成；
- 改动行为时同步更新 `docs/13`、`docs/15` 或对应规格，不要让文档落后于代码。

## 9. 提交与验证

- 提交前缀：`feat` / `fix` / `docs` / `refactor` / `test`；
- 代码改动必须跑 `npm test`；界面改动加跑 `npm run test:browser`；
- 浏览器采集改动要手动跑 `browser:probe` / `browser:check`；
- 不提交 `.env`、`data/`、`data/browser-profile`、`data/evidence`、截图与凭据。

## 10. 安全

- 不保存或输出密码、Cookie、API Key、账号截图；
- 不抓取与任务无关的页面；
- 不把用户项目数据发到外部服务（模型调用除外，且需用户自己配置 Key）；
- 不实现绕过验证码、风控、付费墙的功能。

## 11. 判断标准

一个改动是否值得做，只问三个问题：

1. 它是否让**个人用户**更快拿到可信的 GEO 结论？
2. 它是否让证据更可回放、更可解释？
3. 它是否会把项目推向"又一个企业 SaaS"？

前两个"是"、第三个"否"，才做。
