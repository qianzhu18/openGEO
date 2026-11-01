import type { Page } from 'playwright-core';
import { evidenceId, saveEvidence, type AnswerEvidence } from '../evidence.js';

export type LoginState = 'signed_in' | 'signed_out' | 'unknown';

const COMPOSER = ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea[data-id]'];
const ASSISTANT = '[data-message-author-role="assistant"]';

async function firstVisible(page: Page, selectors: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).last();
      if (await locator.count().catch(() => 0) && await locator.isVisible().catch(() => false)) return locator;
    }
    await page.waitForTimeout(400);
  }
  return null;
}

export async function chatgptStatus(page: Page): Promise<LoginState> {
  const url = page.url();
  if (/\/auth\/|\/login/i.test(url)) return 'signed_out';
  if (/just a moment|attention required/i.test((await page.title().catch(() => '')) || '')) return 'unknown';
  // A logged-in ChatGPT session carries a session cookie; anonymous profiles do not.
  const cookies = await page.context().cookies('https://chatgpt.com').catch(() => []);
  if (cookies.some(cookie => /session|auth/i.test(cookie.name) && !/^cf_/i.test(cookie.name))) return 'signed_in';
  const profile = page.locator('[data-testid="profile-button"], [aria-label*="Profile" i], [aria-label*="Account" i]').first();
  if (await profile.count().catch(() => 0) && await profile.isVisible().catch(() => false)) return 'signed_in';
  const login = page.getByRole('button', { name: /log in|sign up/i }).first();
  if (await login.count().catch(() => 0) && await login.isVisible().catch(() => false)) return 'signed_out';
  return 'unknown';
}

/** Ask one prompt in the user's logged-in ChatGPT session and capture the answer as evidence. */
export async function askChatGPT(page: Page, prompt: string, timeoutMs = 120_000): Promise<AnswerEvidence> {
  const startedAt = Date.now();
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (/just a moment|attention required/i.test((await page.title()) || '')) throw new Error('Cloudflare challenge hit ChatGPT. Run with a visible window (OPENGEO_BROWSER_HEADLESS=0) and complete it once in the dedicated profile.');
  const composer = await firstVisible(page, COMPOSER, 30_000);
  if (!composer) throw new Error('ChatGPT composer not found. Sign in once in the dedicated profile, or the UI changed.');
  const state = await chatgptStatus(page);
  if (state === 'signed_out') throw new Error('ChatGPT is signed out in the dedicated profile. Open the window and sign in once, then retry.');

  const before = await page.locator(ASSISTANT).count();
  await composer.click();
  await page.keyboard.insertText(prompt);
  await page.keyboard.press('Enter');
  await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length > count, { selector: ASSISTANT, count: before }, { timeout: timeoutMs }).catch(() => {
    throw new Error('No ChatGPT answer appeared within the timeout. Check the visible window for a challenge or rate limit.');
  });
  // Wait for streaming to settle: the stop button disappears and the last message stops changing.
  const stop = page.locator('[data-testid="stop-button"]').first();
  if (await stop.count().catch(() => 0)) await stop.waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_200);

  const messages = page.locator(ASSISTANT);
  const last = messages.last();
  const answer = (await last.innerText()).trim();
  const citations = await last.locator('a[href^="http"]').evaluateAll(nodes => [...new Set(nodes.map(node => (node as HTMLAnchorElement).href))]);
  if (!answer) throw new Error('ChatGPT returned an empty answer.');
  const id = evidenceId('chatgpt', prompt);
  return saveEvidence(page, { id, engine: 'chatgpt', prompt, answer, citations, loginState: state, startedAt });
}
