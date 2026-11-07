---
name: browser-collector
description: 在 OpenGEO 中用已核验的 Xue Chrome 脚本采集 ChatGPT 网页回答，返回 JSON 与本地证据。
---

# 网页脚本采集

先读仓库 `AGENTS.md` 和 `docs/17-脚本化网页采集.md`。本 skill 只描述调用，不宣称真实平台验收已经完成。

在仓库 `code/` 下运行（本机路径 `code/`）：

```bash
npm run --silent browser:probe
npm run --silent browser:check
npm run --silent browser:ask -- "用户确认的问题"
npm run --silent browser:batch -- --file questions.jsonl
```

需要 `kimi-webbridge` 本机 daemon 和 Xue 中连接的扩展。daemon 不可达时按该 skill 的恢复流程执行 `start`；不自动升级、重启或改连其他 profile。非默认本机地址用 `--daemon-url`。登录与验证码由用户完成，禁止读取／导出 Cookie。

输入文件每行 `{"id":"唯一ID","prompt":"问题"}`，每轮最多 3 条。stdout 每行 `{"ok":true,"data":…}` 或 `{"ok":false,"error":…}`，问题输出含 `id`。非零退出表示有失败；首个失败后的题目标记 `skipped`，不自动重发。完整正文、引用、证据 ID 和路径在成功结果中。

只实现 ChatGPT。`profile_unverified` 表示没有证明实际连接 Xue，不等于平台未提及品牌。模型与地区未独立核验，保持 UNKNOWN。结果来源是网页 UI，不能标 API。失败片段不进分母；不得编造截图、引用或后测效果。当前结果不会自动转换为 Campaign attempt。
