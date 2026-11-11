import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/citekeel/server.js';
import { Store } from '../src/citekeel/storage.js';
import { HostBrowserMailbox, workerProof } from '../src/citekeel/browser/host-mailbox.js';

const token = 'a'.repeat(64);
const fixture = {
  engine: 'chatgpt', answer: 'Fixture answer.', citations: [], url: 'https://chatgpt.com/c/fixture',
  evidenceId: 'test-中文-id', latencyMs: 100, protocolId: 'browser-ui/v3;fixture',
};

test('Docker browser mailbox accepts one authenticated claim and binds each result to the planned question', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opengeo-worker-test-'));
  const browserWorker = new HostBrowserMailbox(token);
  const { server } = await createApp(new Store(dir), { browserWorker });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const request = (path: string, payload: object = {}, auth?: string) => fetch('http://127.0.0.1:' + address.port + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(payload),
  });
  const call = async (action: string, payload: object = {}, nonce = Date.now() + '-' + randomUUID()) => {
    const proof = workerProof(token, 'request', action, nonce, payload);
    const response = await request('/api/local-browser-worker/' + action, payload, 'OpenGEO ' + nonce + '.' + proof);
    if (response.status !== 403) {
      const value = await response.clone().json();
      assert.equal(response.headers.get('x-opengeo-proof'), workerProof(token, 'response', action, nonce, value));
    }
    return response;
  };
  try {
    assert.equal((await request('/api/local-browser-worker/claim')).status, 403);
    assert.equal((await request('/api/browser/check')).status, 503);
    const nonce = Date.now() + '-' + randomUUID();
    assert.deepEqual(await (await call('claim', {}, nonce)).json(), { task: null });
    assert.equal((await call('claim', {}, nonce)).status, 403);
    const check = request('/api/browser/check');
    let checkTask;
    for (let i = 0; !checkTask && i < 25; i++) {
      checkTask = (await (await call('claim')).json()).task;
      if (!checkTask) await new Promise(done => setTimeout(done, 10));
    }
    assert.equal(checkTask?.kind, 'check');
    assert.equal((await call('finish', { id: checkTask.id, reply: { ok: true } })).status, 200);
    assert.deepEqual(await (await check).json(), { ok: true, profile: 'Xue', authenticated: true });
    const collector = browserWorker.collector(['Q1', 'Q2']);
    const first = collector.ask('Q1');
    const { task } = await (await call('claim')).json();
    assert.deepEqual(task.prompts, ['Q1', 'Q2']);
    assert.deepEqual(await (await call('claim')).json(), { task: null });
    assert.equal((await call('finish', { id: 'wrong', reply: { ok: true, rows: [] } })).status, 409);
    assert.equal((await call('finish', { id: task.id, reply: { ok: true, rows: [{ ok: true, data: fixture }] } })).status, 409);
    assert.equal((await call('finish', { id: task.id, reply: { ok: true, rows: [
      { ok: true, data: fixture }, { ok: false, error: '页面结构变化', evidenceId: 'failed-attempt' },
    ] } })).status, 200);
    assert.deepEqual(await first, fixture);
    await assert.rejects(collector.ask('wrong prompt'), /计划不一致/);
    await assert.rejects(collector.ask('Q2'), { message: '页面结构变化', evidenceId: 'failed-attempt' });
    assert.deepEqual(await (await call('claim')).json(), { task: null });
    const project = await (await request('/api/projects', { brand: 'Fixture', industry: 'Robotics' })).json();
    const launch = await request('/api/runs', {
      projectId: project.id, mode: 'live', channel: 'browser', questions: ['一条离线测试问题'],
    });
    assert.equal(launch.status, 202);
    const { id: runId } = await launch.json();
    let runTask;
    for (let i = 0; !runTask && i < 25; i++) {
      runTask = (await (await call('claim')).json()).task;
      if (!runTask) await new Promise(done => setTimeout(done, 10));
    }
    assert.deepEqual(runTask?.prompts, ['一条离线测试问题']);
    assert.equal((await call('finish', { id: runTask.id, reply: { ok: true, rows: [{ ok: true, data: fixture }] } })).status, 200);
    let run;
    for (let i = 0; i < 40; i++) {
      run = await (await fetch('http://127.0.0.1:' + address.port + '/api/runs/' + runId)).json();
      if (!['queued','running'].includes(run.status)) break;
      await new Promise(done => setTimeout(done, 10));
    }
    // Successful sampling does not confirm the new project's unreviewed facts.
    assert.equal(run.status, 'needs_review');
    assert.equal(run.samples[0].collectionStatus, 'completed');
    assert.equal(run.samples[0].origin, 'browser');
    assert.equal(run.samples[0].upstreamAttemptId, fixture.evidenceId);
    assert.equal(run.samples[0].answer, fixture.answer);
  } finally {
    await new Promise<void>(done => server.close(() => done()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('timed out jobs cannot be claimed or completed later', async () => {
  const mailbox = new HostBrowserMailbox(token, { onlineMs: 3000, pickupMs: 5, batchMs: 500, checkMs: 30 });
  mailbox.claim();
  const unused = mailbox.submit({ kind: 'check' });
  assert.equal((await unused).ok, false);
  assert.equal(mailbox.claim(), null);
  const old = mailbox.submit({ kind: 'check' });
  const task = mailbox.claim()!;
  assert.ok(mailbox.alive(task.id));
  assert.equal((await old).ok, false);
  assert.equal(mailbox.alive(task.id), false);
  assert.equal(mailbox.finish(task.id, { ok: true }), false);
});

test('host worker rejects unsupported engines before creating a browser collector', { timeout: 10_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opengeo-worker-cli-'));
  const tokenFile = join(dir, 'token');
  await writeFile(tokenFile, token, { mode: 0o600 });
  const mailbox = new HostBrowserMailbox(token);
  let finished!: () => void;
  const finish = new Promise<void>(resolve => { finished = resolve; });
  let submitted = false;
  let taskResult: ReturnType<typeof mailbox.submit> | undefined;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const action = req.url!.split('/').at(-1)!;
    const nonce = mailbox.authorize(action, req.headers.authorization, input);
    if (!nonce) { res.writeHead(403); res.end('{}'); return; }
    if (!submitted) {
      mailbox.claim();
      taskResult = mailbox.submit({ kind: 'batch', engine: 'perplexity', prompts: ['Must never reach ChatGPT'] });
      submitted = true;
    }
    const result = action === 'claim' ? { task: mailbox.claim() } : action === 'alive'
      ? { alive: mailbox.alive(input.id) } : { ok: mailbox.finish(input.id, input.reply) };
    res.setHeader('x-opengeo-proof', mailbox.sign(action, nonce, result));
    res.end(JSON.stringify(result));
    if (action === 'finish') finished();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/citekeel/browser/host-worker.ts'], {
    env: { ...process.env, OPENGEO_HOST_WORKER_TOKEN_FILE: tokenFile,
      OPENGEO_WORKER_APP_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}` },
    stdio: 'ignore',
  });
  const exited = once(child, 'exit');
  try {
    await Promise.race([finish, exited.then(() => { throw new Error('worker exited before replying'); })]);
    assert.ok(taskResult);
    const result = await taskResult;
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /当前仅支持 ChatGPT/);
  } finally {
    child.kill('SIGTERM');
    await exited;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
