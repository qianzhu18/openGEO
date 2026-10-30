# competitors/ · 竞对分析

放「竞对拆解」文档：我们借鉴与对比的开源项目。每个竞对都写清它给了我们什么、边界在哪、我们不继承什么，以及 license、commit / release 和本地快照位置。

## 当前内容

- [COMPARISON.md](./COMPARISON.md)：OpenGEO vs Pi vs niubigeo 的定位、能力、边界与差异化对比。
- [pi.md](./pi.md)：派 Agent（Pi）—— 轻量可扩展 harness、按需 Skill、CLI / JSON / RPC / SDK、包分发。
- [niubigeo.md](./niubigeo.md)：牛比 GEO（niubigeo）—— Provider 目录、测量运行、原始回答、引用溯源、失败保留、可复现历史。
- [topify.md](./topify.md)：Topify（商业 SaaS）—— 浏览器自动化采样、prompt 发现、action 工作流、agent 框架逆向与对标。

## 源码快照

竞对的完整源码固定快照统一放在 [`../../vendor/`](../../vendor/)（例如 `vendor/niubigeo/`），供本地复现与逐行对照。本目录只放分析记录与归属边界，不把带 node_modules 的完整仓库搬进来。

## 归属原则

1. 历史公开归档仍归原项目执行，回放不等于新的在线测量，也不等于优化提升证明。
2. 借用的是架构与思路，不是把竞对代码合并成一个 monolith。
3. 每个竞对都要可追溯：仓库、license、commit / release、本地快照路径。
