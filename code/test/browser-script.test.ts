import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CollectionError, KimiBridge, collectorLock, historyContains, selectedHistory, verifyProfile, type BrowserBridge, type VerifiedProfile } from '../src/workbench/browser/bridge.js';
import { createScriptCollector } from '../src/workbench/browser/script-collector.js';

const profile: VerifiedProfile = { profileName: 'Xue', profileDirectory: 'Profile 11', method: 'exact-task-history-url', verifiedAt: '2026-11-06T00:00:00Z' };
const isCode = (code: string) => (error: unknown) => error instanceof CollectionError && error.code === code;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-script-'));
  const profileDir = join(root, 'chrome', 'Profile 11');
  await mkdir(profileDir, { recursive: true });
  const configPath = join(root, 'browser-config.json');
  await writeFile(configPath, JSON.stringify({ profileName: 'Xue', chromeUserDataDir: join(root, 'chrome') }));
  await writeFile(join(root, 'chrome', 'Local State'), JSON.stringify({ profile: { info_cache: { 'Profile 11': { name: 'Xue' }, Default: { name: '用户1' } } } }));
  const history = join(profileDir, 'History');
  const db = new DatabaseSync(history);
  db.exec('CREATE TABLE urls (url TEXT)'); db.prepare('INSERT INTO urls VALUES (?)').run('https://unrelated.invalid/'); db.close();
  return { root, configPath, history, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('profile proof queries exactly one task URL in the selected Xue history, and fails closed', async () => {
  const f = await fixture();
  try {
    assert.equal(await selectedHistory(f.configPath), f.history);
    assert.equal(await historyContains(f.history, 'https://other.invalid/'), false);
    let recordHistory = true;
    const navigations: string[] = [];
    const bridge: BrowserBridge = {
      async command<T>(action: string, args: any = {}): Promise<T> {
        if (action === 'find_tab') throw new CollectionError('tab_not_found', 'fixture');
        if (action === 'navigate') {
          navigations.push(args.url);
          const response = await fetch(args.url); assert.equal(response.status, 200);
          if (recordHistory) { const db = new DatabaseSync(f.history); db.prepare('INSERT INTO urls VALUES (?)').run(args.url); db.close(); }
        }
        return {} as T;
      },
      async evaluate<T>(): Promise<T> { throw new Error('Profile check must not read page identity or cookies'); },
    };
    const proof = await verifyProfile(bridge, { configPath: f.configPath, timeoutMs: 1 });
    assert.equal(proof.profileName, 'Xue'); assert.equal(proof.profileDirectory, 'Profile 11');
    recordHistory = false;
    await assert.rejects(verifyProfile(bridge, { configPath: f.configPath, timeoutMs: 1 }), isCode('profile_unverified'));
    assert.notEqual(navigations[0], navigations[1]);
    assert.ok(navigations.every(url => /^http:\/\/127\.0\.0\.1:\d+\/opengeo-profile-check\//.test(url)));
    await writeFile(f.configPath, JSON.stringify({ profileName: '用户1' }));
    await assert.rejects(selectedHistory(f.configPath), isCode('wrong_profile'));
    const holder = new DatabaseSync(f.history);
    holder.exec('BEGIN IMMEDIATE');
    try { assert.equal(await historyContains(f.history, 'https://unrelated.invalid/'), true); }
    finally { holder.close(); }
  } finally { await f.cleanup(); }
});

test('bridge speaks the local JSON protocol and refuses remote addresses and redirects', async () => {
  const seen: any[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); seen.push(input);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(input.action === 'evaluate' ? { ok: true, data: { type: 'string', value: '{"value":42}' } } : { ok: false, error: { code: 'extension_not_connected' } }));
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const bridge = new KimiBridge(`http://127.0.0.1:${address.port}`);
    assert.deepEqual(await bridge.evaluate('fixture'), { value: 42 });
    assert.equal(seen[0].session, 'opengeo-collector');
    await assert.rejects(bridge.command('navigate'), isCode('extension_not_connected'));
    assert.throws(() => new KimiBridge('https://remote.example'), isCode('invalid_bridge_url'));
    assert.throws(() => new KimiBridge('http://user:password@localhost'), isCode('invalid_bridge_url'));
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

test('bridge preserves daemon error envelopes and safely replaces a closed owned tab', async () => {
  const actions: string[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); actions.push(input.action);
    res.setHeader('content-type', 'application/json');
    if (input.action === 'find_tab') {
      res.writeHead(502);
      res.end(JSON.stringify({ ok: false, error: { code: 'tool_error', message: 'session "opengeo-collector": current tab 123 was closed; call list_tabs to re-target, or navigate to open a new tab' } }));
    } else if (input.action === 'snapshot') {
      res.writeHead(503);
      res.end(JSON.stringify({ ok: false, error: { code: 'extension_not_connected' } }));
    } else {
      assert.equal(input.args.newTab, true);
      assert.equal(input.args.url, 'http://127.0.0.1:8847/opengeo-profile-check/fixture');
      res.end(JSON.stringify({ ok: true, data: {} }));
    }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const bridge = new KimiBridge(`http://127.0.0.1:${address.port}`);
    const { taskNavigate } = await import('../src/workbench/browser/bridge.js');
    await taskNavigate(bridge, 'http://127.0.0.1:8847/opengeo-profile-check/fixture');
    assert.deepEqual(actions, ['find_tab', 'navigate']);
    await assert.rejects(bridge.command('snapshot'), isCode('extension_not_connected'));
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});

function scriptedBridge(options: { incomplete?: boolean; interrupt?: boolean; screenshotMissing?: boolean; auth?: boolean } = {}) {
  const commands: string[] = [];
  let clicked = false;
  const bridge: BrowserBridge = {
    async command<T>(action: string, args: any = {}): Promise<T> {
      commands.push(action);
      if (action === 'mouse_click') clicked = true;
      if (action === 'screenshot' && !options.screenshotMissing) await writeFile(args.path, Buffer.from([137,80,78,71,13,10,26,10,0]));
      return {} as T;
    },
    async evaluate<T>(code: string): Promise<T> {
      if (code.includes('const action = "auth"')) return { authenticated: options.auth !== false } as T;
      if (code.includes('const action = "prepare"')) return { ready: true } as T;
      if (!clicked) return { sendReady: true } as T;
      if (options.interrupt) return { error: 'user_interrupted' } as T;
      return { answer: 'A full fixture answer.', complete: !options.incomplete, citations: ['https://source.example/'], url: 'https://chatgpt.com/c/fixture', html: '<article>A full fixture answer.</article>' } as T;
    },
  };
  return { bridge, commands };
}

test('script collector returns full evidence and excludes incomplete or interrupted answers', async t => {
  for (const scenario of ['completed','timeout','interrupt','screenshot','auth','profile'] as const) {
    await t.test(scenario, async () => {
      const root = await mkdtemp(join(tmpdir(), 'opengeo-script-'));
      const fake = scriptedBridge({ incomplete: scenario === 'timeout', interrupt: scenario === 'interrupt', screenshotMissing: scenario === 'screenshot', auth: scenario !== 'auth' });
      const collector = await createScriptCollector('chatgpt', { bridge: fake.bridge, evidenceDir: root, lockPath: join(root, 'lock'), pollMs: 1, timeoutMs: 1000,
        verify: async () => { if (scenario === 'profile') throw new CollectionError('profile_unverified', 'fixture'); return profile; } });
      try {
        if (scenario === 'completed') {
          const answer = await collector.ask('Question?');
          assert.equal(answer.answer, 'A full fixture answer.');
          const record = JSON.parse(await readFile(answer.evidencePath!, 'utf8'));
          assert.equal(record.status, 'completed'); assert.equal(record.protocol.model, 'UNKNOWN');
          assert.equal(await readFile(record.answerPath, 'utf8'), answer.answer);
          await access(record.screenshotPath); await access(record.domPath);
          assert.match(answer.protocolId!, /profile=Xue;session=fresh/);
          assert.equal(fake.commands.filter(action => action === 'mouse_click').length, 1);
        } else {
          const expected = { timeout: 'answer_timeout', interrupt: 'user_interrupted', screenshot: 'screenshot_missing', auth: 'not_logged_in', profile: 'profile_unverified' }[scenario];
          let failure: CollectionError | undefined;
          await assert.rejects(collector.ask('Question?'), error => { if (error instanceof CollectionError) failure = error; return isCode(expected)(error); });
          const record = JSON.parse(await readFile(failure!.evidencePath!, 'utf8'));
          assert.equal(record.status, 'failed'); assert.equal(record.answer, '');
          assert.equal(fake.commands.includes('mouse_click'), !['auth','profile'].includes(scenario));
          const before = fake.commands.length;
          await assert.rejects(collector.ask('Next question?'), isCode('collector_stopped'));
          assert.equal(fake.commands.length, before);
        }
      } finally { await collector.close(); await rm(root, { recursive: true, force: true }); }
    });
  }
});

test('collection lock prevents overlap and is released, including invalid transport construction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengeo-lock-')), path = join(root, 'lock');
  try {
    const release = await collectorLock(path);
    await assert.rejects(collectorLock(path), isCode('collector_busy'));
    await release();
    await writeFile(path, '1073741824');
    await (await collectorLock(path))();
    await assert.rejects(createScriptCollector('chatgpt', { lockPath: path, daemonUrl: 'http://remote.example' }), isCode('invalid_bridge_url'));
    await (await collectorLock(path))();
    await assert.rejects(createScriptCollector('perplexity', { lockPath: path }), isCode('engine_not_supported'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
