import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestionSet } from '../src/citekeel/question-set.js';

const options = { min: 1, max: 40, maxLength: 800 };

test('parseQuestionSet removes Chinese and English group headings', () => {
  const result = parseQuestionSet(
    ['**非点名题**', 'Which robot vendors should a lab compare?', '**点名题**', 'What is AgileX Robotics?'],
    options,
  );

  assert.deepEqual(result.questions, [
    'Which robot vendors should a lab compare?',
    'What is AgileX Robotics?',
  ]);
  assert.deepEqual(result.ignoredHeadings, ['**非点名题**', '**点名题**']);
});

test('parseQuestionSet removes markdown hashes and plain group labels', () => {
  const result = parseQuestionSet(['## Unbranded questions', '非点名题', '点名的真实问题是什么？'], options);

  assert.deepEqual(result.questions, ['点名的真实问题是什么？']);
  assert.deepEqual(result.ignoredHeadings, ['## Unbranded questions', '非点名题']);
});

test('parseQuestionSet preserves numbered question text and ordering', () => {
  const questions = ['1. 哪些厂商适合科研教学？', '2. 哪些平台支持 ROS 2？'];
  const result = parseQuestionSet(questions, options);

  assert.deepEqual(result.questions, questions);
  assert.deepEqual(result.ignoredHeadings, []);
});

test('parseQuestionSet ignores blank lines and case-only duplicates', () => {
  const result = parseQuestionSet(['', 'What is GEO?', 'what is geo?'], options);

  assert.deepEqual(result.questions, ['What is GEO?']);
});

test('parseQuestionSet rejects a set containing only presentation headings', () => {
  assert.throws(() => parseQuestionSet(['**非点名题**'], options), /at least 1 actual question/);
});

test('parseQuestionSet enforces count and length limits before sampling', () => {
  assert.throws(() => parseQuestionSet([], options), /at least 1 actual question/);
  assert.throws(
    () => parseQuestionSet(Array.from({ length: 41 }, (_, index) => `问题${index + 1}是什么？`), options),
    /at most 40 actual questions/,
  );
  assert.throws(
    () => parseQuestionSet(['x'.repeat(801)], options),
    /at most 800 characters/,
  );
});

test('parseQuestionSet applies the maximum to actual questions, not pasted headings', () => {
  const values = [
    '**非点名题**',
    '**点名题**',
    ...Array.from({ length: 40 }, (_, index) => `${index + 1}. 真实问题${index + 1}是什么？`),
  ];
  const result = parseQuestionSet(values, options);

  assert.equal(result.questions.length, 40);
  assert.deepEqual(result.ignoredHeadings, ['**非点名题**', '**点名题**']);
});
