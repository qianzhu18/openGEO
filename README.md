# OpenGEO

OpenGEO 是个人使用的开源 GEO 工作台。用自己的浏览器登录态和 API Key 在本机采集回答、保存证据、生成诊断并复测。范围见[产品](docs/产品.md)和[协作约定](AGENTS.md)。

## 用 Docker 启动

在仓库的 `code/` 目录执行：

```bash
mkdir -p data/docker-worker
chmod 700 data/docker-worker
node -e 'require("node:fs").writeFileSync("data/docker-worker/token", require("node:crypto").randomBytes(32).toString("hex") + "\n", { flag: "wx", mode: 0o644 })'
docker compose up --build -d --wait
```

首次运行生成本机 worker 令牌；已有令牌时跳过生成。打开 [OpenGEO 工作台](http://127.0.0.1:8848/)。容器只发布给本机，记录保存在 Compose volume 中。Docker 中的官网建档能读取公开静态 HTML；需要浏览器渲染的公开页面用宿主机工作台处理。API Key 可在工作台按次填写。

需要真实网页采样时，在同一台电脑安装依赖并启动宿主机 worker：

```bash
npm ci
npm run --silent browser:probe
npm run browser:worker
```

先按[采集](docs/采集.md)配置 Xue 与 Kimi 桥接。worker 只接受工作台分配的 ChatGPT 任务，Chrome profile、Kimi daemon 和原始证据都留在宿主机。在另一个终端运行 `curl -X POST http://127.0.0.1:8848/api/browser/check`，可经容器核验 Xue 与 ChatGPT 会话，不发送问题。若改了 Compose 的宿主端口，同时设置 worker 的 `OPENGEO_WORKER_APP_URL`。

## 直接在宿主机运行

```bash
cd code
npm ci
npm start                     # http://127.0.0.1:8847
npm run build
npm test
npm run opengeo -- demo
```

- [产品](docs/产品.md)：产品范围、当前能力和下一步
- [采集](docs/采集.md)：官网研究、浏览器、API 和证据
- [案例交付](docs/案例交付.md)：案例合约和问题集指标

本机配置、密钥、运行数据和私有案例都在发布范围之外。当前已支持本地回放、API 采样和 ChatGPT 的宿主机采集链路；其余网页适配器、自动补测及七入口指标汇总见文档中的待实现规格。

Apache-2.0。包含 [niubigeo](https://github.com/Albert-Weasker/niubigeo) 的上游源码；见[归属](references/UPSTREAM.md)和[上游许可证](code/vendor/niubigeo/LICENSE)。
