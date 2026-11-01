import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceId } from '../src/citekeel/browser/evidence.js';

test('evidence ids are readable, unique per capture and safe as directory names', () => {
  const first = evidenceId('chatgpt', 'What is GEO?');
  const second = evidenceId('chatgpt', 'What is GEO?');
  assert.match(first, /chatgpt-what-is-geo-[a-f0-9]{8}$/);
  assert.match(first, /^[0-9T-]+-/);
  assert.notEqual(first, second);
  const chinese = evidenceId('chatgpt', '什么是 GEO？');
  assert.match(chinese, /什么是-geo-[a-f0-9]{8}$/);
  assert.ok(!/[\\/:*?"<>|]/.test(first));
});
