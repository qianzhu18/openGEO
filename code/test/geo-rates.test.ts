import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateGeoRates, answerExclusion, extractEnumeratedRanking, judgeGeoAnswer, type GeoObservation } from '../src/citekeel/geo-rates.js';

const aliases = ['松灵机器人', 'AgileX Robotics', 'AgileX', 'AGILE·X', '松灵'];

function observation(partial: Partial<GeoObservation> & Pick<GeoObservation, 'id' | 'platform'>): GeoObservation {
  return { questionId: 'Q01', model: 'fixture', channel: 'api', eligible: true, exclusion: null, mentioned: false, appearance: false, top1: null, top3: null, rank: null, ...partial };
}

test('mention without an enumerated list leaves Top1 and Top3 unknown', () => {
  const judged = judgeGeoAnswer('AgileX PiPER is often discussed for teleoperation, but this paragraph does not rank options.', aliases);
  assert.equal(judged.eligible, true);
  assert.equal(judged.mentioned, true);
  assert.equal(judged.appearance, true);
  assert.equal(judged.top1, null);
  assert.equal(judged.top3, null);
  assert.equal(judged.rank, null);
  assert.equal(extractEnumeratedRanking(judged.eligible ? 'AgileX is one candidate.' : ''), null);
});

test('a numbered list ranks only the enumerated options', () => {
  const answer = [
    'A university lab could start with these arms:',
    '1. Franka Research 3 for torque control.',
    '2. AgileX PiPER for imitation-learning capture.',
    '3. Universal Robots UR5e for teaching.',
    '4. UFACTORY xArm for a lower budget.',
  ].join('\n');
  const judged = judgeGeoAnswer(answer, aliases);
  assert.equal(judged.mentioned, true);
  assert.equal(judged.rank, 2);
  assert.equal(judged.top1, false);
  assert.equal(judged.top3, true);
  const first = judgeGeoAnswer('1. AgileX Robotics PiPER\n2. Franka Research 3\n3. UR5e', aliases);
  assert.equal(first.top1, true);
  assert.equal(first.top3, true);
  const fourth = judgeGeoAnswer('1. Franka\n2. UR5e\n3. xArm\n4. AgileX PiPER is last here.', aliases);
  assert.equal(fourth.rank, 4);
  assert.equal(fourth.top1, false);
  assert.equal(fourth.top3, false);
});

test('a list that omits the brand is a negative rank, while a fenced or single item is not a rank', () => {
  const missing = judgeGeoAnswer('1. Franka Research 3\n2. UR5e\n3. xArm', aliases);
  assert.equal(missing.mentioned, false);
  assert.equal(missing.top1, false);
  assert.equal(missing.top3, false);
  const outside = judgeGeoAnswer('AgileX also sells mobile bases.\n\n1. Franka Research 3\n2. UR5e', aliases);
  assert.equal(outside.mentioned, true);
  assert.equal(outside.top1, false);
  assert.equal(outside.rank, null);
  const fenced = judgeGeoAnswer('AgileX appears only in prose.\n\n```\n1. Franka\n2. UR5e\n```', aliases);
  assert.equal(fenced.mentioned, true);
  assert.equal(fenced.top1, null);
  assert.equal(extractEnumeratedRanking('1. Only one option, AgileX PiPER.'), null);
});

test('Chinese numerals, ordinal lines and an explicit order are ranks', () => {
  const chinese = judgeGeoAnswer('一、Franka\n二、优傲\n三、松灵机器人 PiPER', aliases);
  assert.equal(chinese.rank, 3);
  assert.equal(chinese.top3, true);
  assert.equal(chinese.top1, false);
  const ordinal = judgeGeoAnswer('首选：松灵机器人\n其次：越疆\n再次：优傲', aliases);
  assert.equal(ordinal.top1, true);
  const ordered = judgeGeoAnswer('推荐顺序：Franka > AgileX > UR', aliases);
  assert.equal(ordered.rank, 2);
  assert.equal(ordered.top3, true);
  const inline = judgeGeoAnswer('1. Franka 2. UR5e 3. AGILE·X PiPER', aliases);
  assert.equal(inline.rank, 3);
  assert.equal(inline.top3, true);
});

test('an explicit priority table is a ranking and a spec table is not', () => {
  const ranked = judgeGeoAnswer(['| Priority | Arm |', '| --- | --- |', '| 1 | Franka |', '| 2 | AgileX PiPER |', '| 3 | UR5e |'].join('\n'), aliases);
  assert.equal(ranked.rank, 2);
  assert.equal(ranked.top1, false);
  assert.equal(ranked.top3, true);
  const specs = judgeGeoAnswer('松灵 publishes these figures.\n\n| Item | Value |\n| --- | --- |\n| 1 | payload |\n| 2 | weight |', aliases);
  assert.equal(specs.mentioned, true);
  assert.equal(specs.top1, null);
  assert.equal(specs.top3, null);
});

test('refusals, login walls, rate limits and empty answers stay out of the denominator', () => {
  for (const answer of ['', '   ', 'Please sign in to continue.', '抱歉，我无法回答这个问题。', 'Sorry, I can\'t answer that.', '访问频繁，请稍后再试']) {
    const judged = judgeGeoAnswer(answer, aliases);
    assert.equal(judged.eligible, false, answer);
    assert.equal(judged.mentioned, null);
    assert.equal(judged.top1, null);
    assert.equal(judged.top3, null);
  }
  assert.equal(answerExclusion('I cannot verify the official payload, but the comparison below is still an answer.\n\n1. Franka\n2. AgileX PiPER'), null);
  const substantive = judgeGeoAnswer('I cannot verify the official payload, but the comparison below is still an answer.\n\n1. Franka\n2. AgileX PiPER', aliases);
  assert.equal(substantive.eligible, true);
  assert.equal(substantive.rank, 2);
});

test('question-set rates stay inside one platform and do not turn a missing rank into zero', () => {
  const prose = observation({ id: 'prose', platform: 'openai', mentioned: true, appearance: true, top1: null, top3: null });
  const ranked = observation({ id: 'ranked', platform: 'openai', questionId: 'Q03', mentioned: true, appearance: true, top1: false, top3: true, rank: 2 });
  const refused = observation({ id: 'refused', platform: 'openai', questionId: 'Q11', eligible: false, exclusion: '拒绝回答不是有效回答', mentioned: null, appearance: null });
  const other = observation({ id: 'other', platform: 'gemini', model: 'other-model', mentioned: false, appearance: false, top1: false, top3: false, rank: null });
  const report = aggregateGeoRates([prose, ranked, refused, other]);
  assert.equal(report.groups.length, 2);
  const openai = report.groups.find(group => group.platform === 'openai')!;
  assert.equal(openai.questionSet.mention.numerator, 2);
  assert.equal(openai.questionSet.mention.denominator, 2);
  assert.equal(openai.questionSet.appearance.denominator, openai.questionSet.mention.denominator);
  assert.equal(openai.questionSet.appearance.numerator, openai.questionSet.mention.numerator);
  assert.equal(openai.questionSet.top1.numerator, 0);
  assert.equal(openai.questionSet.top1.denominator, 1);
  assert.equal(openai.questionSet.top3.numerator, 1);
  assert.equal(openai.questionSet.top3.denominator, 1);
  assert.deepEqual(openai.questionSet.excludedIds, ['refused']);
  assert.equal(report.groups.find(group => group.platform === 'gemini')!.questionSet.mention.denominator, 1);
  assert.notEqual(openai.questionSet.mention.denominator, 3);
});
