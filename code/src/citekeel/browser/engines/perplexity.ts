import type { Page } from 'playwright-core';
import { evidenceId, saveEvidence, type AnswerEvidence } from '../evidence.js';
import type { LoginState } from './chatgpt.js';

// Kept as a string: bundler helpers (e.g. esbuild keepNames) must not leak into page.evaluate.
const EXTRACT_SCRIPT = `(() => {
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
  const prose = Array.from(document.querySelectorAll('div.prose')).map((n) => clean(n.innerText));
  let answer = prose.filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
  if (!answer) {
    const blocks = Array.from(document.querySelectorAll('main, [data-testid="answer"]')).map((n) => clean(n.innerText));
    answer = blocks.sort((a, b) => b.length - a.length)[0] || '';
    answer = answer.replace(/^Answer\s+Links\s+Images\s+Share\s+.*?\d{1,2}:\d{2}\s*(?:AM|PM)?/i, '');
    answer = answer.replace(/Finished\s+\d+\s*[sm].*$/i, '');
  }
  const seen = new Set();
  const citations = [];
  for (const a of Array.from(document.querySelectorAll('a[href^="http"]'))) {
    const href = a.href;
    if (/perplexity\.ai/.test(href) || seen.has(href)) continue;
    seen.add(href); citations.push(href);
    if (citations.length >= 15) break;
  }
  return { answer: clean(answer), citations };
})()`;

async function extractAnswer(page: Page): Promise<{ answer: string; citations: string[] }> {
  return page.evaluate(EXTRACT_SCRIPT);
}

export async function perplexityStatus(page: Page): Promise<LoginState> {
  if (/just a moment|attention required/i.test((await page.title().catch(() => '')) || '')) return 'unknown';
  // A signed-in session carries a session cookie; anonymous profiles do not.
  const cookies = await page.context().cookies('https://www.perplexity.ai').catch(() => []);
  if (cookies.some(cookie => /session|auth/i.test(cookie.name) && !/^__?cf/i.test(cookie.name))) return 'signed_in';
  const account = page.locator('img[alt*="profile" i], button[aria-label*="account" i], [data-testid="accounts-button"]').first();
  if (await account.count().catch(() => 0) && await account.isVisible().catch(() => false)) return 'signed_in';
  return 'unknown';
}

/** Ask Perplexity in the dedicated profile. Anonymous sessions work; login improves limits. */
export async function askPerplexity(page: Page, prompt: string, timeoutMs = 120_000): Promise<AnswerEvidence> {
  const startedAt = Date.now();
  await page.goto('https://www.perplexity.ai/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (/just a moment|attention required/i.test((await page.title().catch(() => '')) || '')) throw new Error('Perplexity is behind a challenge. Open the dedicated profile window once and retry.');
  const composer = page.locator('div[contenteditable="true"], textarea').first();
  await composer.waitFor({ state: 'visible', timeout: 20_000 });
  const state = await perplexityStatus(page);

  await composer.click();
  await page.keyboard.insertText(prompt);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/search\//, { timeout: Math.min(timeoutMs, 30_000) }).catch(() => {});

  // Poll until the answer text stops changing; Perplexity streams its response.
  let stable = ''; let stableCount = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    const { answer } = await extractAnswer(page);
    if (answer && answer === stable) { stableCount++; if (stableCount >= 3) break; }
    else { stableCount = 0; stable = answer; }
  }
  const { answer, citations } = await extractAnswer(page);
  const text = stable.length > answer.length ? stable : answer;
  if (!text) throw new Error('No Perplexity answer appeared within the timeout.');
  // A sign-in wall (modal or inline) must never be recorded as an answer.
  const wallMarkers = [/sign\s+in\s+to\s+continue/i, /sign\s+in\s+with\s+google/i, /create\s+account/i, /before\s+using\s+this\s+app/i, /sign\s+up\s+and\s+repeat/i, /log\s+in\s+to\s+continue/i];
  if (wallMarkers.filter(marker => marker.test(text)).length >= 2) {
    throw new Error('Perplexity asked to sign in (anonymous limit reached). Sign in once in the dedicated profile (npm run browser:check), then retry.');
  }
  const id = evidenceId('perplexity', prompt);
  return saveEvidence(page, { id, engine: 'perplexity', prompt, answer: text, citations, loginState: state, startedAt });
}
