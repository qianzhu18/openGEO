# Topify → OpenGEO 界面基线

> 后续同日补查已完成：[全站逆向与落地规格](../../references/competitors/topify/README.md)。REA 的 Swift 阻塞现已通过临时编译覆盖解决，成功分析 17 个不同产品脚本。本文保留首轮失败记录；Recording 与 Agent 的临时映射以新规格为准。

日期：2026-10-30。用户明确指定参考 Topify，并使用 morluto/rea 逆向；先采用框架和设计，以后按需要优化。

## 已观察的证据

参考页面：https://app.topify.ai/ （用户提供的登录后 Analyze / Overview 页面）。通过现有浏览器会话读取可见结构、页面截图、导航和实际加载的静态资源；未记录账号资料或客户指标。

- 左侧工作空间与导航分组：Agent、Analysis（Overview / Tracking → Prompts / Recording / Sources / Fanouts）、Optimization（Actions）、Preferences、Management。
- 顶栏：breadcrumb、报告与导出。
- 主区：日期、模型、品牌筛选；Visibility / Sentiment / Position / SOV 切换；Brand Charts 与 Competitors 双栏；Next Actions by Agent；Topic Performance Breakdown。
- 可见字体栈为 Geist / Inter / PingFang SC / 系统无衬线；白底、浅灰面板、细边框、中性深灰按钮。
- 概览加载成功；Prompts 跳转后出现 Something went wrong。因此没有宣称验证该子页的完整交互。
- 页面自身暴露了一条服务错误；未保存该错误的原始内容，也未复用其错误输出展示方式。

## REA 执行记录

官方项目：https://github.com/morluto/rea 。按 README 使用命令行，无需更改全局 MCP 配置或重启当前会话。

本次 npm 获取的可执行版本为 `rea@6.7.0`。命令从 `/tmp` 执行，未将 REA 加入产品依赖。

1. `list-browser-targets http://127.0.0.1:9222 --format json` 返回 `invalid_endpoint_response`，未完成运行时采集。
2. 从浏览器资源清单获得公开分发的 48 个脚本，共 4,154,102 字符，临时保存在 `/tmp/opengeo-topify-bundle`。完整脚本不随项目分发。
3. 选择 overview 与 workspace layout 两个实际文件，以 `analyze-javascript-application` 执行。REA 返回清单、SHA-256 与部分 Application Graph；解析 worker 启动被本机 Swift `SwiftBridging` module redefinition 编译错误阻断。
4. 尝试已有 Xcode 应用目录作为开发者目录，该目录缺少完整 Developer 工具链，也未成功。未修改系统工具链或绕过 REA 进程所有权检查。

因此：REA **已调用并取得部分清单证据，未完成语义分析**。技术结构结论只来自页面运行时和公开脚本的直接读取，不将其包装成 REA 的完整分析结果。机器可读记录见同目录 `2026-10-30-topify-rea-summary.json`。

公开脚本直接可见 Next.js app-router 的 overview/layout 路径、React 组件和 queryFn；overview 包含 getVisibility、getCompetitorsV2、topicGroups 与报告数据映射。这支持界面分区与数据流推断，不能推断私有服务端实现。

## 本地映射

| Topify | 本次 OpenGEO 实现 |
| --- | --- |
| Overview | 工作概览 |
| Prompts | 问题空间（现有问题编辑与版本） |
| Recording | 回答与信源（原文检查器） |
| Sources | 独立信源分析列表，可返回回答 |
| Agent / Actions | 执行轨迹、历史与有依据的策略任务 |
| Project | 品牌事实与来源 |
| 品牌趋势 / 竞品榜 | 品牌实际观察点 / 模型表现表 |
| Sentiment / Position / SOV | 待采集和判定能力补齐后接入 |

采用系统布局与组件组织，保留现有工作流；不增加没有后端支持的成员、账单和自动发布入口。当前是原工作台的新界面，CLI workspace 与工作台数据统一仍属于后续工程。

## 验证

`npm run check`；`npm run test:browser`。浏览器覆盖归档回放、原文与导出、新建项目与确认事实、内容审核与链接登记、375/320px 无整页横向溢出；新增筛选、指标切换、侧栏收起与信源返回原文的检查。

最终结果：构建通过，核心测试 19/19、浏览器流程 5/5 通过；桌面 1440px、手机 375px / 320px 截图已检查，手机无整页横向溢出。预览截图位于 `artifacts/topify-baseline/`。旧版文件备份位于 `artifacts/backups/topify-20261030/`。
