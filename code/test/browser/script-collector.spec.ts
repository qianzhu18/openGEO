import { test, expect } from '@playwright/test';
import { chatgptScript } from '../../src/workbench/browser/chatgpt-script.js';

const prompt = 'Which tools\nshould a small team use?';
const html = `<!doctype html><meta charset="utf-8"><main><div class="ProseMirror" contenteditable="true" role="textbox" aria-label="询问 ChatGPT"></div><button aria-label="听写">Dictate</button><button aria-label="发送">Send</button></main>`;
test.beforeEach(async ({ page }) => {
  // No real account or network: only the page-context adapter executes against this fixture.
  await page.route('**/*', route => route.fulfill(route.request().url().endsWith('/api/auth/session')
    ? { contentType: 'application/json', body: JSON.stringify({ user: { id: 'fixture' }, expires: '2030-01-01T00:00:00Z', accessToken: 'fixture-must-not-leave-page' }) }
    : { contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('https://chatgpt.com/');
});

test('adapter binds the answer to the exact question, requires a completion control, and scopes evidence', async ({ page }) => {
  expect(JSON.parse(await page.evaluate(chatgptScript('auth')))).toEqual({ authenticated: true });
  expect(JSON.parse(await page.evaluate(chatgptScript('prepare')))).toEqual({ ready: true });
  await page.evaluate(({ prompt }) => {
    document.querySelector('main')!.insertAdjacentHTML('beforeend', '<div data-message-author-role="user"></div><article><div data-message-author-role="assistant"><p>Answer <a href="https://source.example/doc">source</a><a href="https://source.example/?token=fixture">bad link</a></p><script type="application/json">fixture-secret</script></div><button data-testid="copy-turn-action-button" hidden>Copy</button></article>');
    document.querySelector('[data-message-author-role="user"]')!.textContent = prompt;
  }, { prompt });
  const partial = JSON.parse(await page.evaluate(chatgptScript('read', { prompt })));
  expect(partial.complete).toBe(false);
  expect(JSON.parse(await page.evaluate(chatgptScript('read', { prompt: 'Different question' })))).toMatchObject({ answer: '', complete: false });
  await page.locator('[data-testid="copy-turn-action-button"]').evaluate(el => el.removeAttribute('hidden'));
  const final = JSON.parse(await page.evaluate(chatgptScript('read', { prompt, marker: 'fixture-marker' })));
  expect(final.complete).toBe(true);
  expect(final.citations).toEqual(['https://source.example/doc']);
  expect(final.html).not.toContain('fixture-secret'); expect(final.html).not.toContain('token=');
  expect(final.html).not.toContain('询问 ChatGPT'); expect(final.html).not.toContain('fixture-must-not-leave-page');
  expect(await page.locator('[data-opengeo-evidence="fixture-marker"]').count()).toBe(1);
});

test('inject writes the prompt into the ProseMirror composer and marks send', async ({ page }) => {
  expect(JSON.parse(await page.evaluate(chatgptScript('prepare')))).toEqual({ ready: true });
  const injected = JSON.parse(await page.evaluate(chatgptScript('inject', { prompt })));
  expect(injected).toMatchObject({ inserted: true, sendReady: true });
  expect(await page.locator('[role="textbox"]').innerText()).toContain('Which tools');
  expect(await page.locator('[data-opengeo-send="1"]').getAttribute('aria-label')).toBe('发送');
  expect(await page.locator('button[aria-label="听写"][data-opengeo-send]').count()).toBe(0);
});

test('trusted user input interrupts the owned task page; an anonymous session fails authentication', async ({ page }) => {
  await page.evaluate(chatgptScript('prepare'));
  await page.locator('[role="textbox"]').click();
  await page.keyboard.type('User takeover');
  expect(JSON.parse(await page.evaluate(chatgptScript('read', { prompt })))).toEqual({ error: 'user_interrupted' });
  await page.route('**/api/auth/session', route => route.fulfill({ contentType: 'application/json', body: '{}' }));
  expect(JSON.parse(await page.evaluate(chatgptScript('auth')))).toEqual({ authenticated: false });
});
