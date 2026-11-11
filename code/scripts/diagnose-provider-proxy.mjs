// Read-only network diagnosis: no API keys, generation calls, or proxy setting changes.
// The temporary local proxy deliberately rejects CONNECT to prove route selection.
import http from 'node:http';
import { spawn } from 'node:child_process';

const events = [];
const sockets = new Set();
const proxy = http.createServer((_req, res) => {
  events.push('HTTP');
  res.writeHead(502).end('diagnostic proxy');
});
proxy.on('connection', socket => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
proxy.on('connect', (_req, socket) => {
  events.push('CONNECT');
  socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
});
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
const source = `
  try {
    const response = await fetch('https://api.cloro.dev/v1/credits', {signal: AbortSignal.timeout(10000)});
    console.log(JSON.stringify({httpStatus: response.status}));
    await response.body?.cancel();
  } catch (error) {
    console.log(JSON.stringify({error: error.message, cause: error.cause?.code || error.cause?.message}));
  }
`;
try {
  for (const mode of ['environment_only', 'explicit_node_env_proxy']) {
    const before = events.length;
    const env = { ...process.env, HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl, https_proxy: proxyUrl, NO_PROXY: '', no_proxy: '' };
    // Keep comparison isolated from the caller's optional Node preload/proxy flags.
    delete env.NODE_OPTIONS;
    delete env.NODE_USE_ENV_PROXY;
    const child = spawn(process.execPath, [
      ...(mode === 'explicit_node_env_proxy' ? ['--use-env-proxy'] : []),
      '--input-type=module', '-e', source,
    ], { env });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.resume();
    const watchdog = setTimeout(() => child.kill(), 15000);
    const exit = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    }).finally(() => clearTimeout(watchdog));
    console.log(JSON.stringify({ mode, node: process.version, proxyHits: events.length - before,
      proxyMethods: events.slice(before), result: output.trim(), exit }));
  }
} finally {
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => proxy.close(resolve));
}
