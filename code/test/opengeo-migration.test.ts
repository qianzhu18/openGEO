import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { defaultDataDirectory, Store } from '../src/workbench/storage.js';
import { createApp } from '../src/workbench/server.js';

test('OpenGEO prefers explicit configuration and reuses an existing legacy data directory without moving data', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'opengeo-migration-'));
  try {
    assert.equal(defaultDataDirectory({}, cwd), join(cwd, 'data/opengeo'));
    await mkdir(join(cwd, 'data/citekeel'), { recursive: true });
    assert.equal(defaultDataDirectory({}, cwd), join(cwd, 'data/citekeel'));
    await mkdir(join(cwd, 'data/opengeo'), { recursive: true });
    assert.equal(defaultDataDirectory({}, cwd), join(cwd, 'data/opengeo'));
    assert.equal(defaultDataDirectory({ CITEKEEL_DATA_DIR: 'old-custom' }, cwd), 'old-custom');
    assert.equal(defaultDataDirectory({ OPENGEO_DATA_DIR: 'new-custom', CITEKEEL_DATA_DIR: 'old-custom' }, cwd), 'new-custom');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('Next frontend delegation retains local origin protection and keeps API requests in the existing service', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-frontend-'));
  const paths: string[] = [];
  const { server } = await createApp(new Store(root), {
    frontend(req, res) {
      paths.push(req.url || '/');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<main>OpenGEO React frontend</main>');
    },
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  try {
    assert.match(await (await fetch(base + '/workspace?project=sensor')).text(), /OpenGEO React frontend/);
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.name, 'OpenGEO');
    assert.equal((await fetch(base + '/api/missing')).status, 404);
    assert.equal((await fetch(base + '/', { headers: { Origin: 'https://external.example' } })).status, 403);
    const badHostStatus = await new Promise<number | undefined>((done, reject) => {
      const req = request(base + '/', { headers: { Host: 'external.example' } }, res => { res.resume(); done(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(badHostStatus, 403);
    assert.deepEqual(paths, ['/workspace?project=sensor']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(done => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
