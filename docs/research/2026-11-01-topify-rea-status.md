# Topify 逆向状态复核：2026-11-01

对象：<https://app.topify.ai/0d964228-0988-48ba-894b-a658019d6096/agent>（本次访问被重定向到登录页）
工具：REA `rea-agents@6.8.0`，CLI 模式，未注册 MCP
目的：回答四个问题——上次的逆向结论今天还成立吗、哪些能重跑、哪些不能、还缺什么。

## 1. 结论先行

1. **静态证据没有失效。** 本次从公开入口重新抓取 36 个客户端脚本，其中 28 个与 2026-10-30 保存的 84 份清单**逐字节相同**，0 个变化。承载 205 条接口候选的核心 API 客户端 chunk `6976-f79b9449050663d5.js` 哈希完全一致，因此那批静态接口证据仍然可引用。
> 2026-11-02 补记：已用 ego lite 复用登录态完成复核，产品代码 82/84 chunk 与 10-30 一致，但信息架构已改为 Analyze / Tracking 嵌套。见 [11 登录后产品复核](../../references/competitors/topify/11-logged-in-reverse-2026-11-02.md)。

2. **但登录后的产品页面无法复核。** 给定 URL 现在 302 到 `/account/sign-in`，本机没有可用的 CDP / WebBridge 登录态。上次分析的 17 个产品脚本中有 48 份（含各页面 chunk）不在本次可达范围。**没有重跑，不等于结论过期，也不等于结论仍然成立。**
3. **出现了比压缩脚本更权威的新证据源：公开 API 文档。** `docs.topify.ai/llms-full.txt` 单文件 294,643 字节，完整给出实体、字段、指标公式、动作状态机、Webhook 事件和计费口径。继续从 minified bundle 猜内部实现，收益已经低于直接读这份合同。整理见 [10 公开 API 与服务逻辑](../../references/competitors/topify/10-public-api-and-service-logic.md)。
4. **产品与商业信息已经变化，旧记录需要更新。** 定价改为 credits 制（$149 / $299 / $599，5,000 / 12,000 / 30,000 credits），新增 13 个免费工具；Sitemap 现有 1,235 个 URL，其中 1,111 个是博客页；引擎数量在不同页面分别写作 4 / 5 / 7 个，口径不一致。见第 6 节。
5. **本地服务可用。** `npm start` 正常，`npm run build` 无错误，55 项核心测试与 9 项浏览器测试通过。本轮修复了一处 320px 宽度下的表格横向溢出回归（见第 7 节）。

## 2. 复核边界

| 项目 | 本次状态 | 说明 |
| --- | --- | --- |
| 营销站 `topify.ai` | 可读 | 首页、定价、工具页、博客、Sitemap |
| 公开文档 `docs.topify.ai` | 可读 | `llms.txt`、`llms-full.txt`、changelog |
| 应用公开外壳 | 可抓 | 登录页及其 36 个 JS chunk |
| 登录后 11 个主页面 | **不可复核** | 需账号会话；本机无 9222 等 CDP 端点 |
| 真实响应样本 / 账号数据 | 不在范围 | 不抓取、不保存凭据与私有数据 |
| 服务端源码 / DDL / 提示词 | 不可恢复 | 与上次一致 |

## 3. REA 工具链：同一故障复现，同一修复有效

macOS 上 REA 编译进程所有权辅助程序时失败：

```text
/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap:13:8:
error: redefinition of module 'SwiftBridging'
```

两个文件都定义了 `module SwiftBridging`（内容相同，日期不同：2023-08 与 2025-04）。处理方式与 2026-10-30 相同：只在**本次编译视图**里用 VFS overlay 把旧的 `module.modulemap` 指向空文件，保留 `bridging.modulemap`；通过 `REA_DARWIN_SWIFTC_PATH` 指向包装脚本并设置 `SDKROOT`。未删除、未修改系统文件，也未关闭 REA 的检查。

修复后静态 worker 正常启动。**这不是产品缺陷，是本机 Xcode CommandLineTools 的重复 module 定义。** 复现命令见附录。

## 4. 产物漂移：28 个相同，0 个变化，8 个新增

| 指标 | 数量 |
| --- | --- |
| 2026-10-30 清单文件 | 84 |
| 本次公开入口可达 | 36 |
| 与旧清单逐字节相同 | 28 |
| 已记录文件发生变化 | **0** |
| 本次新增（旧清单没有） | 8 |
| 因登录墙不可达 | 48 |

新增文件：`1087-4eda739b4ff80b3e.js`、`1641-6e4701f3b37198f4.js`、`3835-3d02b278bb0a3471.js`、`4340-2106c15c52816988.js`、`5428-05e26d7ca54cf199.js`、`layout-fc7148d5fb7efdae.js`、`page-d348d517b50cc28d.js`、`polyfills-c67a75d1b6f99dc8.js`。它们是登录外壳、布局、签到页和 polyfill，不是产品页。

要点：

- `6976`（API 客户端，134 处 `/api/` 字面量）、`1840`、`f059c9b4`、`8543` 等与上次一致，说明**客户端接口层未变**。
- 48 个不可达文件里包含上次分析的产品页面 chunk。没有这些文件，就不能声称"今天的 Agent 页仍然长这样"。
- 完整哈希清单：[bundle-manifest-20261101.json](../../references/competitors/topify/evidence/bundle-manifest-20261101.json)。

## 5. 本轮 REA 运行

| 运行 | 选择 | 统计 | 证据 ID | 结果 |
| --- | --- | --- | --- | --- |
| 全目录 | 37 个文件 | 13 个解析完成、153,819 AST 节点、592 findings、138 modules、0 parse failure | `ev_727c1673c1c450f1814055cc790ffefcb8badf1a2391924d17ecaab7fdf7f92b` | `provider_timeout`，部分证据保留 |
| 聚焦 API 客户端 | 3 个文件 | 29,676 AST 节点、303 findings、27 modules、0 parse failure；应用图 315 节点 / 404 边 | `ev_5bf09f28f28677bc874751ded758c762265f0842c158891fa914abd679f07759` | `completed`，partial coverage |

限制（REA 自述，未改写）：

- 34 个已清点文件在分析范围之外，跨文件关系未知。
- 只做惰性解析，没有执行 bundle；静态 import 和路径不等于运行时行为。
- 图覆盖为 partial，未解析片段保持 UNKNOWN，不能读作"不存在"。
- 证据置信度为 `derived`，权威性是 `shipped-artifact`。

结论：**REA 仍然适合"验证某个已抓到的分发脚本里有什么"，不适合"从登录墙外重建整个产品"。** 用它复核接口层有效；用它宣称页面功能完整无效。

## 6. 新证据：产品已经向前走了

以下均来自公开页面，属于 DOC / UI 级证据，不是服务端实现。

- **定价改为 credits。** Starter $149/月（5,000 credits，50 prompts/日，15 篇文章，50 条 AI 回复）；Standard $299（12,000 credits，100 prompts）；Pro $599（30,000 credits，300 prompts，多项目）；Enterprise 定制。credits 跨月累积不过期。旧记录里的"$99 起"已过期。
- **免费工具成为获客入口。** 13 个工具：AI Search Volume Checker、AI Robots Checker、Brand Sentiment Checker、Prompts Researcher、Competitor Analysis、Brand Authority Checker、GEO Score Checker、AI Trends Tracker、AI Visibility Report、Brand Profile Checker、User Review Echo、Knowledge Freshness Checker、Social Question Search。
- **内容规模是增长引擎。** Sitemap 1,235 个 URL，1,111 个博客页，大量 "X vs Y" / "free vs paid" / "how to" 结构，最近更新时间为 2026-11-01。
- **公开 API 与 Webhook 已产品化。** changelog 显示 2026-02-20 文档上线、2026-03-30 prompt 创建/更新 API；API 覆盖 projects、aliases、recordings、prompts、competitors、sources、topics、overview、visibility、actions、reports、webhooks。这是"第二形态"——可被 Agent 调用的服务，而不只是仪表盘。
- **引擎口径不一致。** 首页 FAQ 写 4 个（ChatGPT、Gemini、Perplexity、Google AI Overview）；集成文档写 5 个（加 Claude，且说明 Claude 走官方 API）；博客对比文写 7 个并声称覆盖 DeepSeek / 豆包 / 通义。三处都没有版本说明。对一家把"可测量"作为卖点的公司，这是**可被公开质疑的口径问题**，也是 OpenGEO 用"协议收据"定位的切入口。

## 7. 本地服务状态

```text
npm run build   → 通过
npm test        → 55 / 55 通过
npm run test:browser → 9 / 9 通过
npm start       → http://127.0.0.1:8847 正常
```

已验证入口：`/`（旧中文工作台）、`/create-workspace`（URL-first 建档）、`/workspace?project=…`（Agent / Overview / Prompts / Sources / Actions / Project）。

本轮修复：Prompts 表新增列后，在 320px 视口下 `.sr-only` 的绝对定位元素把 `documentElement.scrollWidth` 撑到 815px，浏览器测试失败。根因是 `.table-scroll` 没有建立定位上下文，绝对定位的隐藏表头逃出了滚动容器；给 `.table-scroll` 加 `position: relative` 后回到 320px，9 项浏览器测试全部通过。

仍未落地（与 [09 差距表](../09-international-mvp.md#8-当前实现与明确差距) 一致）：

- Recording / Fanouts / Competitors 三个 Topify 主页面没有独立实体与 UI；`src/citekeel/recordings.ts` 已写但**未接进 server 路由**，属于未完成工作区。
- 采集仍只有 API 基线，没有消费级网页 / 搜索采集；Topify 的四个引擎是浏览器驱动。
- 没有后台每日调度、公开 API、Webhook、credits 计费、CMS 发布与审批恢复。
- CLI workspace 与网页存储仍未统一。

## 8. 下一步（按价值排序）

1. **拿到登录态再补抓产品页面。** 用本机 Chrome 开 9222 远程调试或 WebBridge，只读取自己有权访问的项目；重跑上次同样 13 个页面 chunk，对比哈希与路由。没有登录态就不要把旧页面结论写成"当前版本"。
2. **以公开 API 合同为准重做数据模型。** 先把 projects / prompts / competitors / sources / topics / recordings / actions 的字段、状态机、幂等与错误码对齐，再谈 UI。文档在 [10](../../references/competitors/topify/10-public-api-and-service-logic.md)。
3. **把 Recording 接进 server 并有空态。** 现在模块存在但无路由，属于"看起来做了、实际不可用"的状态，必须在任何对外演示前消除。
4. **建立证据刷新脚本。** 每次复核自动保存：抓取时间、URL、文件哈希、REA 证据 ID、选择范围与限制。现在这些还靠手工记录。

## 附录：复现命令

```bash
# 1. 抓取公开外壳（不登录）
mkdir -p /tmp/topify/app && curl -sL https://app.topify.ai/account/sign-in -o /tmp/topify/app/index.html
grep -oE 'src="[^"]+\.js"' /tmp/topify/app/index.html | sed 's/src="//;s/"$//' | sort -u |
  while read -r u; do curl -s "https://app.topify.ai$u" -o "/tmp/topify/app/$(basename "$u")"; done

# 2. 本机 Swift 重复 module 修复（仅本次编译视图）
printf '{\n "version":0,"use-external-names":false,"case-sensitive":false,\n "roots":[{"type":"file","name":"/Library/Developer/CommandLineTools/usr/include/swift/module.modulemap","external-contents":"/tmp/empty.modulemap"}]\n}\n' > /tmp/overlay.json
printf '#!/bin/bash\nexec /usr/bin/xcrun swiftc -vfsoverlay /tmp/overlay.json "$@"\n' > /tmp/swiftc.sh && chmod +x /tmp/swiftc.sh

# 3. 聚焦分析（文件多时逐个 --source-path，避免 timeout）
REA_DARWIN_SWIFTC_PATH=/tmp/swiftc.sh SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk \
  npx -y rea-agents@6.8.0 analyze-javascript-application /tmp/topify/app \
  --source-path 6976-f79b9449050663d5.js --source-path 1641-6e4701f3b37198f4.js \
  --source-path layout-87567244faa615b5.js --json > /tmp/rea-client.json
```

运行摘要与哈希：[rea-runs-20261101.json](../../references/competitors/topify/evidence/rea-runs-20261101.json)。
