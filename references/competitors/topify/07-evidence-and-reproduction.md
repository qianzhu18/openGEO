# 07 证据、REA 执行与复现

## 1. 已保存的脱敏产物

| 文件 | 内容 |
| --- | --- |
| [pages.json](evidence/pages.json) | 11 个页面、路由占位、表头和重试标记 |
| [bundle-manifest.json](evidence/bundle-manifest.json) | 84 个公开脚本的文件名、字节数、SHA-256 |
| [static-client-contracts.json](evidence/static-client-contracts.json) | 205 条静态候选，含 method / function / 文件 / 字符偏移 |
| [network-operations.json](evidence/network-operations.json) | 36 组 method + path，其中 34 组取得至少一个状态，2 组窗口结束前未完成 |
| [response-shapes.json](evidence/response-shapes.json) | 64 份响应形状；只保留字段名和类型 |
| [design-tokens.json](evidence/design-tokens.json) | CSS 根 token、字体、viewport 与顶栏尺寸 |
| [rea-runs.json](evidence/rea-runs.json) | 三轮成功 REA 的 Evidence ID、输入 / 输出指纹、覆盖与限制 |

接口候选中的 offset 是原始压缩脚本的字符偏移，不是源码行号。响应空数组的 item 标为 unobserved；字符串值未保存。

## 2. REA 成功运行

工具输出版本：`rea@6.7.0`。使用已获取的 npm 包，通过 CLI 分析，没有修改产品依赖或全局 MCP 配置。

| 运行 | 选取文件 | 应用图节点 / 边 | 语义覆盖 |
| --- | --- | --- | --- |
| overview 校验 | 2 个概览 / 布局文件 | 332 / 513 | partial，存在每文件限额截断 |
| 全站产品 | 13 个页面 / 布局 / API 客户端文件 | 1274 / 1836 | partial，50,000 节点上限 |
| 工作流补查 | 4 个执行 / Agent helper / Action / 账单文件 | 311 / 363 | partial，未截断，但有未选文件与动态路径未知 |

全站轮访问 356,160 个 AST 节点，解析 13 个文件，parse failure 为 0。共分析 17 个不同产品脚本。不要把“执行成功”“未发生 parse failure”和“恢复完整原始源码”混为一谈。

REA 的指纹校验用于把结论绑定到本次脚本版本；不证明该版本来自服务端 Git 仓库，也不证明所有分支在真实会话中执行。

## 3. 修复前后的工具链问题

初次 REA 静态分析的 worker 被 macOS SwiftBridging 重复 module definition 阻断；浏览器 9222 的 discovery endpoint 也不是可用 CDP JSON 接口。这是两种不同失败。

本轮通过 Swift 的 VFS overlay，在 **该次编译视图** 中让重复的旧 modulemap 指向临时空文件，保留当前 bridging.modulemap；使用已安装的 Swift 编译器和匹配 MacOSX15.5 SDK。随后 REA 的进程所有权辅助程序真实编译和运行，静态 worker 正常启动。没有删除系统文件、伪造进程所有权结果或关闭 REA 的检查。

浏览器证据仍由可用的 Kimi WebBridge 取得；没有宣称 REA 直接连接过登录态浏览器。

## 4. 可复现的静态提取

仓库脚本：[extract-client-contracts.mjs](../../../scripts/research/topify/extract-client-contracts.mjs)。它只解析文件，不执行 bundle。使用 REA 所带的 Babel parser，避免把逆向工具加入产品依赖。

```bash
# REA_PACKAGE_ROOT 指向已获取的 rea-agents 包根目录。
REA_PACKAGE_ROOT=/absolute/path/to/rea-agents \
  node scripts/research/topify/extract-client-contracts.mjs \
  /absolute/path/to/captured-scripts /tmp/topify-contracts.json
```

提取保留 dynamic / unresolved；不把符号路径参数猜成确定语义。当前结果中 167 条候选具有已解析方法，38 条 unresolved。候选记录可重复，不等于唯一 endpoint 数。

## 5. 重跑 REA

先根据官方 [REA](https://github.com/morluto/rea) 说明使用可用的 Node / CLI。下载包应在目标项目之外进行。正常工具链不需要下面的本机故障修复。

```bash
rea analyze-javascript-application /absolute/path/to/captured-scripts \
  --source-path page-62c3a4ddabcdf725.js \
  --source-path 6976-f79b9449050663d5.js \
  --format json > /tmp/topify-rea.json
```

`--source-path` 要逐项传入真实文件名，不能把 JSON 数组文本作为一个路径。要扩大语义限额时显式设置并记录 max-semantic-nodes / per-file 上限，检查 returned coverage，不能静默忽略 truncation。

本机修复仅在故障复现时使用：临时 wrapper 给 Swift 编译增加 `-vfsoverlay`，通过 `REA_DARWIN_SWIFTC_PATH` 和 `SDKROOT` 让 REA 采用它；路径、SDK 与 overlay 不应硬编码进产品。临时文件位于 `/tmp/opengeo-topify-full` 与 `/tmp/opengeo-swift-overlay.json`，会被系统清理。

## 6. 动态采集复现纪律

1. 用正常账号会话打开指定项目，仅检查自己可访问的页面。
2. 同一任务使用同一浏览器会话组；记录页面是否完成加载，必要时有界重试。
3. 先开 network capture 再导航；结合截图、语义树、DOM 和请求状态。
4. 查看弹窗和配置分区；保存或执行前需要区别本地 UI 操作和真实副作用。
5. 特别注意 Overview / Actions 页面挂载可能自动调用 recommend；Action 详情代码也可能自动 start workflow。不能以为「只打开界面」一定没有服务调用。
6. 不在仓库放原始 HAR、headers、cookies、key、完整响应、账号截图或项目标识。只导出规范化路径、字段类型与文件指纹。

## 7. 本轮边界

没有创建成员、API key、订阅、竞品或问题，没有提交 CMS 发布或审批决策。浏览器页面自身自然发起的查询和推荐任务已被记录。没有端到端测试付费生成链路，也没有恢复服务端私有代码。

部分公开文档页本轮读取失败，如 recordings / reports / agent-settings；不能把这些页面的旧记录当作本轮新验证。相应功能由本次 UI / JS 或其他成功读取的官方页面支持，未验证部分在各文档单列。
