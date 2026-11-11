import { copyFile, constants } from 'node:fs/promises';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, publicUrl, readEvidence } from './evidence.js';
import type { CampaignAttempt, CampaignProtocol, CampaignSpec } from './model.js';

type Metadata = {
  chromeProfile?: unknown; channel?: unknown; engine?: unknown; prompt?: unknown; language?: unknown;
  model?: unknown; region?: unknown; loginState?: unknown; session?: unknown; capturedAt?: unknown;
  answer?: unknown; citations?: unknown; citationStatus?: unknown;
};

export type ImportAttemptOptions = {
  id: string; jobId?: string; questionId: string; platform: string; evidence: string; failureReason?: string;
};

const known = (value: unknown) => typeof value === 'string' && Boolean(value.trim());
const identity = (attempt: CampaignAttempt) => JSON.stringify([
  attempt.questionId, attempt.questionText, attempt.questionRevision, attempt.protocol,
]);

async function copyEvidenceFile(root: string, sourceDir: string, destinationDir: string, file: string): Promise<string> {
  const source = await readEvidence(root, join(sourceDir, file));
  if (!source.length) throw new Error(`证据文件为空：${file}`);
  const destination = join(root, destinationDir, file);
  await copyFile(join(root, sourceDir, file), destination, constants.COPYFILE_EXCL);
  await chmod(destination, 0o600);
  return destination;
}

export async function importAttempt(root: string, spec: CampaignSpec, existing: CampaignAttempt[], options: ImportAttemptOptions): Promise<CampaignAttempt> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.id)) throw new Error('采样 ID 只能使用字母、数字、下划线和连字符');
  const jobId = options.jobId || options.id;
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId) || !/^[a-zA-Z0-9_-]+$/.test(options.questionId) || !/^[a-z0-9_-]+$/.test(options.platform)) throw new Error('任务 ID、jobId、问题或平台格式无效');
  if (existing.some(attempt => attempt.id === options.id)) throw new Error('采样 ID 已存在，重试必须使用新 ID 和同一 jobId');
  const question = spec.questions.find(row => row.id === options.questionId);
  if (!question || !spec.platforms.includes(options.platform)) throw new Error('问题或平台不在案例合约中');
  const status = options.failureReason ? 'failed' as const : 'completed' as const;
  if (status === 'failed' && !known(options.failureReason)) throw new Error('失败样本必须记录失败原因');
  if (status === 'completed' && options.failureReason) throw new Error('完成样本不能同时声明失败');

  const rawMetadata = await readEvidence(root, join(options.evidence, 'evidence.json'));
  let metadata: Metadata;
  try { metadata = JSON.parse(rawMetadata.toString('utf8')) as Metadata; } catch { throw new Error('evidence.json 不是有效 JSON'); }
  if (metadata.chromeProfile !== 'Xue' || metadata.channel !== 'web-ui' || metadata.engine !== options.platform || metadata.prompt !== question.text) throw new Error('metadata 与问题、平台或 Xue 用户不匹配');
  if (metadata.language !== question.language) throw new Error('metadata 语言与问题不一致');
  if (!known(metadata.capturedAt) || !Number.isFinite(Date.parse(String(metadata.capturedAt)))) throw new Error('metadata 缺少有效采样时间');
  if (metadata.model !== null && !known(metadata.model)) throw new Error('metadata 模型必须为非空字符串或 null');
  if (metadata.region !== null && !known(metadata.region)) throw new Error('metadata 地区必须为非空字符串或 null');
  if (metadata.loginState !== null && !known(metadata.loginState)) throw new Error('metadata 登录态必须为非空字符串或 null');
  if (metadata.session !== 'fresh' && metadata.session !== 'existing') throw new Error('metadata 会话必须为 fresh 或 existing');
  if (!Array.isArray(metadata.citations) || metadata.citations.some(value => typeof value !== 'string')) throw new Error('metadata 可见链接必须为字符串数组');
  for (const citation of metadata.citations as string[]) {
    try { publicUrl(citation); } catch { throw new Error('metadata 可见链接必须是可公开访问的 HTTP(S) 地址'); }
  }
  if (!['complete', 'partial', 'unknown'].includes(String(metadata.citationStatus))) throw new Error('metadata 引用提取状态无效');

  const protocol: CampaignProtocol = {
    channel: 'web-ui', platform: options.platform, model: metadata.model === null ? null : String(metadata.model),
    region: metadata.region === null ? null : String(metadata.region), language: question.language,
    loginState: metadata.loginState === null ? null : String(metadata.loginState),
    session: metadata.session, profile: 'Xue',
  };
  const answer = typeof metadata.answer === 'string' ? metadata.answer.trim() : '';
  const rawAnswer = status === 'completed' ? (await readEvidence(root, join(options.evidence, 'answer.txt'))).toString('utf8') : '';
  if (status === 'completed' && (!answer || !rawAnswer.includes(answer))) throw new Error('answer.txt 不能回证 metadata.answer');
  const html = await readEvidence(root, join(options.evidence, 'page.html'));
  const screenshot = await readEvidence(root, join(options.evidence, 'screenshot.png'));
  if (!html.length || !screenshot.length) throw new Error('page.html 或 screenshot.png 缺失');

  const destinationDir = join('evidence', 'attempts', options.id);
  const attempt: CampaignAttempt = {
    id: options.id, jobId, questionId: question.id, questionText: question.text, questionRevision: question.revision,
    capturedAt: String(metadata.capturedAt), status, failureReason: status === 'failed' ? options.failureReason : undefined,
    protocol, evidence: {
      answer: status === 'completed' ? join(destinationDir, 'answer.txt') : undefined,
      html: join(destinationDir, 'page.html'), screenshot: join(destinationDir, 'screenshot.png'),
      metadata: join(destinationDir, 'evidence.json'), sha256: status === 'completed' ? digest(answer) : undefined,
    },
  };
  const previousJob = existing.find(row => row.jobId === jobId);
  if (previousJob && identity(previousJob) !== identity(attempt)) throw new Error('同一 jobId 的重试不能改变问题或协议');

  await mkdir(join(root, 'evidence', 'attempts'), { recursive: true });
  await mkdir(join(root, destinationDir), { recursive: false });
  try {
    await copyEvidenceFile(root, options.evidence, destinationDir, 'page.html');
    await copyEvidenceFile(root, options.evidence, destinationDir, 'screenshot.png');
    await copyEvidenceFile(root, options.evidence, destinationDir, 'evidence.json');
    if (status === 'completed') {
      await writeFile(join(root, destinationDir, 'answer.txt'), answer, { mode: 0o600, flag: 'wx' });
    }
  } catch (error) {
    throw error instanceof Error && error.message.includes('EEXIST') ? new Error('目标证据目录已存在，拒绝覆盖') : error;
  }
  return attempt;
}
