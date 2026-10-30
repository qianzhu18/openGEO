# 02 前端结构与设计系统

## 1. 直接测得的布局与 token（UI / JS）

浏览器 viewport 为 1864 × 977 CSS px，DPR 2；截图像素不能直接当 CSS 尺寸。

| 项目 | 证据 |
| --- | --- |
| 侧栏 | `15vw`，min 200px / max 300px；本次宽约 279.6px；fixed、全屏高、可内部滚动 |
| 顶栏 | 当前桌面页面 68px 高；Agent 脚本区分 48px 小屏与 68px 桌面 |
| 根背景 / 前景 | `--background: #fff` / `--foreground: #0a0a0a` |
| muted / border / primary | `#f5f5f5` / `#e5e5e5` / `#171717` |
| 根圆角 | `--radius: 8px`；组件另有较大圆角 |
| 侧栏实用色 | DOM class 为 `#FAFAF9`，边框 `#E7E5E4`、1.5px |
| 字体栈 | Geist、Inter、PingFang SC、Microsoft YaHei、Noto Sans CJK SC、system-ui |
| 内容组织 | 筛选行 → 双列主分析 → 全宽行动 → 全宽明细；页面内表格和抽屉承接细节 |
| 主色使用 | stone 中性色；多品牌曲线用不同颜色；情绪用条形刻度；自身品牌单独突出 |

不要把本地第一版的 232px 侧栏、64px 顶栏误标为 Topify 原值。它们是已实现的近似基线，后续对齐时可按以上实测调整。

## 2. 组件清单

- Workspace / Project selector：团队、项目和账单主体有不同上下文。
- Sidebar：分组标题、图标、Tracking 子导航、底部支持与账号入口。
- Topbar：面包屑、侧栏切换、报告 / 导出；Agent 页换成 GSC 与审批模式。
- Filter bar：日期 preset / 自定义范围、Provider、多品牌、主题、域名。
- Segmented tabs：四指标、Active / Suggested / Heatmap、Domain / URL、Todo / History。
- Metric panel：标题、解释、loading、趋势、图例、空态；图表 hover 与竞品 hover 在脚本中联动。
- Data table：排序、checkbox、分组展开、列设置、批量操作、分页、局部横向滚动。
- Drawer / dialog：问题与竞品新增、设置、回答原文、Action 审批和产物。
- Workflow：阶段、流式内容、Preview / Edit / Feedback、Approve / Regenerate / Skip。
- 通用状态：tooltip、toast、错误信息、额度不足、集成未连接、尚未取得数据。

## 3. 可确认的前端技术

| 结论 | 等级与依据 |
| --- | --- |
| Next.js App Router + React | JS：`/_next/static/chunks/app/(dashboard)/[workspace]/...`，Webpack 工厂与 React hooks |
| 工具类样式体系 | UI / JS：大量 Tailwind 风格 class、响应式前缀和 CSS variables |
| Radix / shadcn 风格组件 | UI / JS：data-state、checkbox 角色、Slot 风格组件；不等于恢复了原组件仓库 |
| 查询缓存层 | JS：queryKey / queryFn / enabled / staleTime / retry / refetchInterval；呈现 TanStack Query 风格 API |
| 聊天 SDK | JS：useChat 风格接口，`streamProtocol: data`；配套数据流解析器 |
| SSE Action workflow | JS：ReadableStream + `data:` JSON 事件解析 |
| 埋点 | NET / JS：growth events；浏览器加载过 PostHog 等第三方资源 |
| 认证后端 | NET：`/api/supabase/users`；不能仅凭路径证明全部业务数据都在 Supabase |
| 账单 | JS / NET shape：Stripe session 路径与 subscription 字段 |

不能从这些证据断言后端使用 LangGraph、LangChain、特定数据库、Redis、特定队列或浏览器采集框架。

## 4. 缓存、刷新与通信

页面脚本中多个概览查询使用 `staleTime: 300000`；问题页也可见 60000，账单页部分为 0。它们是特定查询的缓存参数，不能推广成统一刷新周期。

问题和竞品存在 `/events` 通道；推荐生成有 task status；回答与优化执行使用不同接口。前端必须区分缓存失效、后台生成完成通知和工作流流式输出，不能只用一个全局定时刷新覆盖。

网络 helper 对部分请求做重试，并明确对含 messages 的 POST 避免自动重试，以减少重复消息。具体退避与限制来自客户端，不能据此推断服务端重试策略。

## 5. 响应式证据与限制

桌面实测、脚本内 sm / lg / xl 分支均已取得；Agent 顶栏在小屏隐藏部分标签，Action / Chat 有面板切换和移动菜单。原站所有页面的手机视口未逐页验收，因此不能宣称完全恢复其移动设计。

OpenGEO 的实现要求：在 320 / 375 / 768 / 1440px 检查导航、筛选、表格局部滚动和抽屉。保持可触达的返回 / 关闭入口；主要操作不依赖 hover。原站部分可点击行是 cursor-pointer 的 tr，本地应补齐键盘交互和语义。

## 6. 素材处理

观察到品牌图标具有多个来源和 fallback。品牌图标是数据展示，不是固定界面素材。OpenGEO 使用自己品牌与公开案例，不复制真实 workspace logo、成员头像、品牌指标或文章。

Geist / Inter 可作为候选，但使用许可与本地字体文件应独立确认；当前本地工作台继续用系统字体，避免新增远程请求。
