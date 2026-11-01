import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright-core';

export interface AnswerEvidence {
  id: string;
  engine: string;
  url: string;
  prompt: string;
  answer: string;
  citations: string[];
  loginState: 'signed_in' | 'signed_out' | 'unknown';
  capturedAt: string;
  durationMs: number;
  screenshotPath: string;
  domPath: string;
  answerPath: string;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'prompt';

export function evidenceId(engine: string, prompt: string): string {
  return `${stamp()}-${slug(engine)}-${slug(prompt)}-${randomUUID().slice(0, 8)}`;
}

/** Save the three pieces of evidence: rendered DOM, screenshot, and answer text. */
export async function saveEvidence(page: Page, input: { id: string; engine: string; prompt: string; answer: string; citations: string[]; loginState: AnswerEvidence['loginState']; startedAt: number }): Promise<AnswerEvidence> {
  const dir = resolve(process.env.OPENGEO_EVIDENCE_DIR || join('data', 'evidence'), input.id);
  await mkdir(dir, { recursive: true });
  const screenshotPath = join(dir, 'screenshot.png');
  const domPath = join(dir, 'page.html');
  const answerPath = join(dir, 'answer.txt');
  const evidencePath = join(dir, 'evidence.json');
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' }).catch(() => {});
  const dom = await page.content().catch(() => '');
  await writeFile(domPath, dom.slice(0, 4_000_000), 'utf8');
  await writeFile(answerPath, `${input.prompt}\n\n---\n\n${input.answer}\n`, 'utf8');
  const record: AnswerEvidence = {
    id: input.id,
    engine: input.engine,
    url: page.url(),
    prompt: input.prompt,
    answer: input.answer,
    citations: input.citations,
    loginState: input.loginState,
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - input.startedAt,
    screenshotPath,
    domPath,
    answerPath,
  };
  await writeFile(evidencePath, JSON.stringify(record, null, 2), 'utf8');
  return record;
}
