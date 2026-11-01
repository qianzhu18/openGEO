# OpenGEO

开源 GEO 交付引擎：把 AI 回答变成可回放的证据、可执行的动作、可复测的结论。

当前是 `0.2.0` 本地原型：URL-first 建档、可选模型研究、英文诊断工作台、Recording URL 池、CLI 回放。**还没有**每日调度、浏览器采集 adapter、Competitors 实体、发布与复测闭环——这些是 [OpenGEO 计划](docs/13-产品计划.md) 的 P0–P4。

## 目录

| 目录 | 放什么 | 谁来维护 |
| --- | --- | --- |
| [`code/`](code/) | 全部代码：CLI、本地工作台、测试、脚本、上游 vendor、运行数据 | 开发 |
| [`docs/`](docs/) | 给人读的文档：产品、路线、研究、增长、设计 | 你 |
| [`references/`](references/) | 参考资料：竞品拆解、行业资料、知识库、上游归属 | 你 |

> 所有命令都在 `code/` 下执行。文档里出现的历史路径（如 `src/citekeel/...`）现在对应 `code/src/citekeel/...`；上游 niubigeo 对应 `code/vendor/niubigeo/...`。

## 快速开始

```bash
cd code
npm ci
npm start          # http://127.0.0.1:8847
```

打开 [Create workspace](http://127.0.0.1:8847/create-workspace)：输入官网、语言（English / 中文）、市场（US/GB/CA/AU/CN）→ 自动收集来源与品牌画像 → 可选一次模型研究生成问题 → 审核 → 进入工作台。

其他命令：

```bash
npm test                 # 56 项核心测试
npm run test:browser     # 10 项浏览器测试（需要本机 Chrome）
npm run build            # TypeScript 编译
npm run opengeo -- demo  # CLI 回放演示
npm run opengeo -- skills
```

模型 ID 用自己账号可用的值；API key 只在当前请求内存中使用，不写入项目或浏览器存储。

## 文档入口

| 想了解 | 看这里 |
| --- | --- |
| 这个产品怎么运转（白话版） | [Topify 流程、检测与采集](docs/11-产品运转机制.md) |
| OpenGEO 怎么定位、怎么做 | [OpenGEO 产品计划](docs/13-产品计划.md) |
| 海外 MVP 的范围与差距 | [海外 MVP](docs/09-海外最小可行版.md) |
| 90 天增长方案 | [海外增长](docs/10-海外增长方案.md) |
| 交付边界、抓数、发布 | [GEO 交付与采集架构](docs/12-交付与采集架构.md) |
| 项目路线图 | [路线图](docs/06-路线图.md) |
| 上游 niubigeo 怎么做的 | [niubigeo 拆解](references/competitors/niubigeo-deep-dive.md) |
| 开源 GEO 竞争格局 | [开源格局](references/competitors/oss-geo-landscape.md) |
| Topify 逆向全套 | [Topify 索引](references/competitors/topify/README.md) |

完整文档索引见 [`docs/文档索引.md`](docs/文档索引.md)。

## 数据与隐私

- 运行数据在 `code/data/`（已 gitignore）。
- `.env` 不入库；示例见 `code/.env.example`。
- 逆向证据只保留字段名/类型，项目与品牌标识已替换；不存回答原文、凭据或账号截图。
- 单机自托管，默认只接受 `127.0.0.1` / `localhost`。

## 许可证与归属

Apache-2.0。包含 [Albert-Weasker/niubigeo](https://github.com/Albert-Weasker/niubigeo) v0.3.2 的源码快照（Apache-2.0），归属与边界见 [`references/UPSTREAM.md`](references/UPSTREAM.md) 和 [`code/vendor/niubigeo/LICENSE`](code/vendor/niubigeo/LICENSE)。

## 边界

- 不保证 AI 推荐或排名；不把一次采样写成趋势，不把相关写成因果。
- 失败样本不进分母，未知显示为未知。
- 发布回执不等于被索引或被引用。
