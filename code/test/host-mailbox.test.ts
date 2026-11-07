import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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
    assert.equal(run.status, 'completed');
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
