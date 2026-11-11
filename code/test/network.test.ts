import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { configureNetwork, networkRoute } from '../src/workbench/network.js';

test('configured proxy receives HTTPS CONNECT; localhost bypasses proxy; proxy rejection does not fall back', async () => {
  const original = getGlobalDispatcher();
  let connects = 0;
  const proxy = http.createServer();
  proxy.on('connect', (_req, socket) => {
    connects++;
    socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  const local = http.createServer((_req, res) => res.end('local'));
  await Promise.all([new Promise<void>(r => proxy.listen(0, '127.0.0.1', r)), new Promise<void>(r => local.listen(0, '127.0.0.1', r))]);
  const port = (proxy.address() as { port: number }).port;
  const agent = configureNetwork({ OPENGEO_PROXY_URL: `http://127.0.0.1:${port}`, HTTPS_PROXY: 'http://127.0.0.1:1' })!;
  try {
    assert.equal(networkRoute().endpoint, `http://127.0.0.1:${port}`);
    await assert.rejects(fetch('https://example.invalid/proxy-proof', { signal: AbortSignal.timeout(2000) }));
    assert.equal(connects, 1);
    const r = await fetch(`http://127.0.0.1:${(local.address() as { port: number }).port}`, { signal: AbortSignal.timeout(2000) });
    assert.equal(await r.text(), 'local');
    assert.equal(connects, 1);
    assert.throws(() => configureNetwork({ OPENGEO_PROXY_URL: 'socks5://127.0.0.1:7897' }), /http\/https/);
  } finally {
    setGlobalDispatcher(original);
    await agent.destroy();
    await Promise.all([new Promise<void>(r => proxy.close(() => r())), new Promise<void>(r => { local.closeAllConnections(); local.close(() => r()); })]);
  }
});
