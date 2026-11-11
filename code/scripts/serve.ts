import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import type { NextServer } from "next/dist/server/next.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadDotEnv } from "../vendor/niubigeo/src/config/env.js";
import { createApp } from "../src/workbench/server.js";
import { configureNetwork } from "../src/workbench/network.js";
import { HostBrowserMailbox } from "../src/workbench/browser/host-mailbox.js";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`OpenGEO, local GEO workbench

  npm install
  npm run dev              Development, http://127.0.0.1:8847
  npm run build            Type-check backend and build the Next.js frontend
  npm start                Production; builds the frontend on first launch

No API key is needed to open the workbench, import files, or replay examples.
Configure OpenRouter / Cloro in the UI before explicitly starting paid sampling.
OPENGEO_PORT and OPENGEO_DATA_DIR override the local port and data directory.
Existing CITEKEEL_PORT / CITEKEEL_DATA_DIR and data/citekeel remain compatible.
Docker: docker compose up --build; opens http://127.0.0.1:8848.
Browser sampling: npm run browser:worker:prepare, then use compose.browser.yaml.
`);
  process.exit(0);
}
const unknown = process.argv.slice(2).filter((value) => value !== "--dev");
if (unknown.length)
  throw new Error(
    `Unknown arguments: ${unknown.join(" ")}. Run npm start -- --help.`,
  );

loadDotEnv();
configureNetwork();
const dev = process.argv.includes("--dev");
Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV || (dev ? "development" : "production"),
});
const port = Number(
  process.env.OPENGEO_PORT || process.env.CITEKEEL_PORT || 8847,
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("OPENGEO_PORT must be an integer between 1 and 65535.");
const container = process.env.OPENGEO_CONTAINER === "1";
const hostname = container ? "0.0.0.0" : "127.0.0.1";

if (!dev && !existsSync(resolve(".next/BUILD_ID"))) {
  console.log("OpenGEO: preparing the Next.js frontend for the first launch…");
  const exitCode = await new Promise<number | null>((done, reject) => {
    const child = spawn(
      process.execPath,
      [resolve("node_modules/next/dist/bin/next"), "build"],
      {
        stdio: "inherit",
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      },
    );
    child.on("error", reject);
    child.on("exit", done);
  });
  if (exitCode !== 0)
    throw new Error(
      "Next.js build failed. Fix the build output above and run npm start again.",
    );
}

let browserWorker: HostBrowserMailbox | undefined;
const tokenPath =
  process.env.OPENGEO_HOST_WORKER_TOKEN_FILE ||
  (container ? "/run/secrets/opengeo_worker_token" : undefined);
if (tokenPath && existsSync(tokenPath))
  browserWorker = new HostBrowserMailbox(
    (await readFile(tokenPath, "utf8")).trim(),
  );
else if (process.env.OPENGEO_HOST_WORKER_TOKEN_FILE)
  throw new Error("The configured browser worker token file does not exist.");

const next = createRequire(import.meta.url)("next") as (options: {
  dev: boolean;
  hostname: string;
  port: number;
}) => NextServer;
const frontend = next({ dev, hostname, port });
await frontend.prepare();
const handler = frontend.getRequestHandler();
const { server } = await createApp(undefined, {
  browserWorker,
  frontend: (req, res) => {
    const nonce = randomBytes(24).toString("base64");
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'" + (dev ? " ws://127.0.0.1:* ws://localhost:*" : ""),
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    // Next's renderer reads this request header to nonce its hydration scripts.
    // Never trust a client-supplied nonce, and do not cache per-request HTML.
    req.headers["content-security-policy"] = csp;
    req.headers["x-nonce"] = nonce;
    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("Cache-Control", "no-store");
    return handler(req, res);
  },
});
const upgrade = frontend.getUpgradeHandler();
server.on("upgrade", (req, socket, head) => {
  const host = req.headers.host || "";
  if (
    !["127.0.0.1", "localhost"].includes(host.split(":")[0]) ||
    (req.headers.origin && req.headers.origin !== `http://${host}`)
  ) {
    socket.destroy();
    return;
  }
  void upgrade(req, socket, head);
});
server.on("error", async (error) => {
  console.error(error.message);
  server.close();
  await frontend.close();
  process.exitCode = 1;
});
server.listen(port, hostname, () =>
  console.log(
    `OpenGEO: http://127.0.0.1:${port} (${dev ? "development" : "Next.js production"})`,
  ),
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(() => void frontend.close().then(() => process.exit(0)));
    server.closeIdleConnections();
  });
