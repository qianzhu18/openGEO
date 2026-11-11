import { findMention } from './analysis.js';

/**
 * Question-set rates for one brand on one platform and one protocol.
 * These are not the first-appearance ranks in brand-metrics.ts.
 */
export const GEO_RATE_FORMULAS = {
  mention: '提及率 = 该品牌问题集中，合格回答里出现品牌名或已确认别名的条数 / 合格回答条数。按通道、平台和模型分开，不把多个平台加成一个百分比。',
  appearance: '出现率 = 提及率。现有代码没有另一套出现率公式；出现率就是品牌名或已确认别名是否出现。',
  top1: 'Top1 率 = 品牌是枚举名单第 1 项的合格回答数 / 存在枚举名次的合格回答数。没有编号列表或明确排序时，该条 Top1 为 null，不进入分母，也不记成否。',
  top3: 'Top3 率 = 品牌名次为 1、2 或 3 的合格回答数 / 存在枚举名次的合格回答数。没有枚举时 Top3 为 null。名次大于 3，或名单里没有该品牌，记为否。',
  excluded: '失败调用、空回答、登录墙、验证页、限流和拒绝回答不进入任何分母。null 不是 0%。一个平台的结果不能写成多平台合计。API 结果的通道是 api。',
  ranking: '枚举名次只认四种，并只取最先出现的一种：从 1 连续编号且至少两项的列表；从 1 连续的序数行（第N、首选/其次/再次、first/second）；表头写明 Priority、Rank、名次或排名且序号连续的表格；或“推荐顺序 / ranking / in order”后的并列名单。普通提及和没有名次表头的表格不是名次。代码围栏里的编号不算。',
} as const;

export interface GeoRate { numerator: number; denominator: number; value: number | null }
export interface GeoJudgment {
  eligible: boolean; exclusion: string | null;
  mentioned: boolean | null; appearance: boolean | null;
  top1: boolean | null; top3: boolean | null; rank: number | null;
}
export interface RankedOption { rank: number; text: string; start: number; end: number }
export interface GeoObservation {
  id: string; questionId: string; platform: string; model: string;
  channel: 'api' | 'web-ui' | 'manual';
  eligible: boolean; exclusion: string | null;
  mentioned: boolean | null; appearance: boolean | null;
  top1: boolean | null; top3: boolean | null; rank: number | null;
}
export interface GeoRateSlice {
  mention: GeoRate; appearance: GeoRate; top1: GeoRate; top3: GeoRate;
  eligibleIds: string[]; excludedIds: string[];
}
export interface GeoRateGroup {
  channel: GeoObservation['channel']; platform: string; model: string;
  questionSet: GeoRateSlice;
  questions: (GeoRateSlice & { questionId: string })[];
}
export interface GeoRateReport { formulas: typeof GEO_RATE_FORMULAS; groups: GeoRateGroup[] }

const emptyJudgment = (exclusion: string): GeoJudgment => ({
  eligible: false, exclusion, mentioned: null, appearance: null, top1: null, top3: null, rank: null,
});

/** Failures that must stay out of every rate denominator. */
export function answerExclusion(answer: string): string | null {
  const trimmed = answer.trim();
  if (!trimmed) return '回答原文为空';
  if (trimmed.length < 1500 && /^(?:sign in|log in|please sign in|登录后|请先登录|just a moment|verify you are human|验证码)/i.test(trimmed)) return '登录或验证页面不是有效回答';
  if (trimmed.length < 400 && /(?:访问过于频繁|访问频繁|too many requests|rate limit exceeded|quota exceeded)/i.test(trimmed)) return '限流或配额提示不是有效回答';
  const refusal = /^(?:i(?:'m| am) sorry[,.]?\s+)?(?:i (?:can(?:not|'t)|am unable to|won't) (?:help|answer|assist|comply)|sorry,? i can(?:not|'t) (?:help|answer)|as an ai,? i can(?:not|'t) (?:help|answer))/i.test(trimmed)
    || /^(?:抱歉|对不起|很抱歉)[，,。\s]{0,8}(?:我)?(?:无法|不能|没法)(?:回答|提供|帮助|协助)/.test(trimmed);
  if (refusal && trimmed.length < 500) return '拒绝回答不是有效回答';
  return null;
}

const CN_RANK: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const ORDINAL_RANK: Record<string, number> = {
  第一: 1, 第一名: 1, 第一位: 1, 首选: 1, first: 1, '1st': 1,
  第二: 2, 第二名: 2, 第二位: 2, 其次: 2, second: 2, '2nd': 2,
  第三: 3, 第三名: 3, 第三位: 3, 再次: 3, third: 3, '3rd': 3,
  第四: 4, 第四名: 4, 第四位: 4, fourth: 4, '4th': 4,
  第五: 5, 第五名: 5, 第五位: 5, fifth: 5, '5th': 5,
};

function linesOf(answer: string): { line: string; start: number }[] {
  const lines: { line: string; start: number }[] = [];
  let offset = 0;
  for (const line of answer.split('\n')) {
    lines.push({ line: line.replace(/\r$/, ''), start: offset });
    offset += line.length + 1;
  }
  return lines;
}

function numberedRank(line: string): number | null {
  const arabic = line.match(/^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?(?:（(\d{1,2})）|\((\d{1,2})\)|(\d{1,2})[\.、\)])(?:\*\*)?[ \t]+\S/u);
  if (arabic) return Number(arabic[1] || arabic[2] || arabic[3]);
  const chinese = line.match(/^[ \t]*([一二三四五六七八九十])[、.．][ \t]*\S/u);
  return chinese ? CN_RANK[chinese[1]!] ?? null : null;
}

function ordinalRank(line: string): number | null {
  const match = line.match(/^[ \t]*(?:(第[一二三四五](?:名|位)?)|(首选|其次|再次)|(first|second|third|fourth|fifth)|([1-5](?:st|nd|rd|th)))(?:[:：、.．]|[ \t]+)\S/iu);
  if (!match) return null;
  const token = (match[1] || match[2] || match[3] || match[4] || '').toLowerCase();
  return ORDINAL_RANK[token] ?? null;
}

function fencedLines(lines: { line: string }[]): boolean[] {
  const hidden: boolean[] = [];
  let fence = false;
  for (const { line } of lines) {
    if (/^[ \t]*```/.test(line)) { hidden.push(true); fence = !fence; }
    else hidden.push(fence);
  }
  return hidden;
}

/** First consecutive sequence that starts at 1 and has at least two items. Fenced lines are ignored. */
function firstSequence(answer: string, rankOf: (line: string) => number | null): RankedOption[] | null {
  const lines = linesOf(answer);
  const hidden = fencedLines(lines);
  for (let index = 0; index < lines.length; index++) {
    if (hidden[index] || rankOf(lines[index]!.line) !== 1) continue;
    const items = [index];
    let cursor = index + 1;
    let closedAt = lines.length;
    while (cursor < lines.length) {
      if (hidden[cursor]) { closedAt = cursor; break; }
      const rank = rankOf(lines[cursor]!.line);
      if (rank !== null) {
        if (rank !== items.length + 1) { closedAt = cursor; break; }
        items.push(cursor);
      }
      cursor++;
    }
    if (items.length < 2) { index = Math.max(index, closedAt - 1); continue; }
    return items.map((lineIndex, itemIndex) => {
      const start = lines[lineIndex]!.start;
      const endLine = itemIndex + 1 < items.length ? items[itemIndex + 1]! : closedAt;
      const end = endLine < lines.length ? lines[endLine]!.start : answer.length;
      return { rank: itemIndex + 1, text: answer.slice(start, end).trim(), start, end };
    });
  }
  return null;
}

function inlineNumbered(answer: string): RankedOption[] | null {
  const marker = /(\d{1,2})[\.、\)][ \t]+/g;
  for (const { line, start } of linesOf(answer)) {
    if (/```/.test(line)) continue;
    const hits = [...line.matchAll(marker)].filter(hit => hit.index !== undefined);
    if (hits.length < 2 || hits[0]!.index !== line.search(/\S/)) continue;
    const ranks = hits.map(hit => Number(hit[1]));
    if (ranks.some((rank, index) => rank !== index + 1)) continue;
    return hits.map((hit, index) => {
      const local = hit.index! + hit[0].length;
      const next = index + 1 < hits.length ? hits[index + 1]!.index! : line.length;
      const text = line.slice(local, next).trim();
      return { rank: index + 1, text, start: start + local, end: start + next };
    });
  }
  return null;
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.replace(/[*_`]/g, '').trim());
}

/** A markdown table is a ranking only when its header explicitly says so and the rank column is 1, 2, 3... */
function markdownRankTable(answer: string): RankedOption[] | null {
  const lines = linesOf(answer);
  const hidden = fencedLines(lines);
  for (let index = 0; index < lines.length - 2; index++) {
    if (hidden[index] || !lines[index]!.line.trim().startsWith('|')) continue;
    const header = splitCells(lines[index]!.line);
    const separator = lines[index + 1]?.line.trim() || '';
    if (!/^\|?\s*:?-{2,}/.test(separator)) continue;
    const rankColumn = header.findIndex(cell => /^(?:priority|rank|ranking|名次|排名|推荐顺序)$/i.test(cell));
    if (rankColumn < 0) continue;
    const rows: { cells: string[]; start: number; end: number }[] = [];
    for (let cursor = index + 2; cursor < lines.length; cursor++) {
      if (hidden[cursor] || !lines[cursor]!.line.trim().startsWith('|')) break;
      rows.push({ cells: splitCells(lines[cursor]!.line), start: lines[cursor]!.start, end: lines[cursor]!.start + lines[cursor]!.line.length });
    }
    const ranks = rows.map(row => Number((row.cells[rankColumn] || '').match(/^\d{1,2}$/)?.[0]));
    if (rows.length < 2 || ranks.some((rank, item) => rank !== item + 1)) continue;
    const nameColumn = rankColumn === 0 ? Math.min(1, header.length - 1) : 0;
    return rows.map((row, item) => ({ rank: item + 1, text: row.cells[nameColumn] || row.cells.filter((_, cell) => cell !== rankColumn).join(' '), start: row.start, end: row.end }));
  }
  return null;
}

function orderedCue(answer: string): RankedOption[] | null {
  const match = answer.match(/(?:推荐顺序|推荐排序|排名顺序|(?:^|\W)(?:ranked order|ranking|in (?:this )?order))\s*[:：]\s*([^\n]+)/i);
  if (!match || match.index === undefined) return null;
  const parts = match[1]!.split(/\s*(?:>|＞|→|然后|，|,|、|;|；)\s*/).map(part => part.replace(/^(?:and|以及)\s+/i, '').trim()).filter(Boolean);
  if (parts.length < 2 || parts.some(part => part.length > 80)) return null;
  const listStart = match.index + match[0].indexOf(match[1]!);
  let cursor = listStart;
  return parts.map((text, index) => {
    const found = answer.indexOf(text, cursor);
    const start = found === -1 ? cursor : found;
    cursor = start + text.length;
    return { rank: index + 1, text, start, end: cursor };
  });
}

/** Null means the answer does not enumerate options, so Top1 and Top3 stay unknown. */
export function extractEnumeratedRanking(answer: string): RankedOption[] | null {
  return firstSequence(answer, numberedRank) || firstSequence(answer, ordinalRank) || markdownRankTable(answer) || inlineNumbered(answer) || orderedCue(answer);
}

export function judgeGeoAnswer(answer: string, aliases: string[]): GeoJudgment {
  const exclusion = answerExclusion(answer);
  if (exclusion) return emptyJudgment(exclusion);
  const mentioned = Boolean(findMention(answer, aliases));
  const ranking = extractEnumeratedRanking(answer);
  if (!ranking) return { eligible: true, exclusion: null, mentioned, appearance: mentioned, top1: null, top3: null, rank: null };
  const hit = ranking.find(item => findMention(item.text, aliases));
  const rank = hit?.rank ?? null;
  return { eligible: true, exclusion: null, mentioned, appearance: mentioned, top1: rank === 1, top3: rank !== null && rank <= 3, rank };
}

export function rateFromFlags(flags: (boolean | null)[]): GeoRate {
  const known = flags.filter((flag): flag is boolean => flag !== null);
  const numerator = known.filter(Boolean).length;
  return { numerator, denominator: known.length, value: known.length ? numerator / known.length : null };
}

export function formatGeoRate(rate: GeoRate, emptyLabel: string): string {
  return rate.denominator ? `${rate.numerator}/${rate.denominator}` : emptyLabel;
}

function rateBlock(rows: GeoObservation[]) {
  const eligible = rows.filter(row => row.eligible);
  for (const row of eligible) {
    if (row.mentioned !== row.appearance) throw new Error(`出现率与提及率不一致: ${row.id}`);
  }
  const mention = rateFromFlags(eligible.map(row => row.mentioned));
  return { mention, appearance: rateFromFlags(eligible.map(row => row.appearance)), top1: rateFromFlags(eligible.map(row => row.top1)), top3: rateFromFlags(eligible.map(row => row.top3)), eligibleIds: eligible.map(row => row.id), excludedIds: rows.filter(row => !row.eligible).map(row => row.id) };
}

/** Groups stay split by channel, platform and model. No cross-platform total is produced. */
export function aggregateGeoRates(observations: GeoObservation[]): GeoRateReport {
  const groups = new Map<string, GeoObservation[]>();
  for (const row of observations) {
    const key = JSON.stringify([row.channel, row.platform, row.model]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return { formulas: GEO_RATE_FORMULAS, groups: [...groups.entries()].map(([, rows]) => {
    const first = rows[0]!;
    const questions = [...new Set(rows.map(row => row.questionId))].map(questionId => ({ questionId, ...rateBlock(rows.filter(row => row.questionId === questionId)) }));
    return { channel: first.channel, platform: first.platform, model: first.model, questionSet: rateBlock(rows), questions };
  }) };
}
