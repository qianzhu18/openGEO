import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { openSession, closeSession, profileDir } from './session.js';
import { askChatGPT, chatgptStatus } from './engines/chatgpt.js';

const [command, ...rest] = process.argv.slice(2);

async function check() {
  const context = await openSession();
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2_000);
  let state = await chatgptStatus(page);
  console.log(`Profile: ${profileDir()}`);
  console.log(`ChatGPT: ${state}`);
  if (state !== 'signed_in') {
    console.log('Sign in in the opened Chrome window, then press Enter to re-check.');
    const rl = createInterface({ input: stdin, output: stdout });
    await rl.question('');
    rl.close();
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2_000);
    state = await chatgptStatus(page);
    console.log(`ChatGPT: ${state}`);
  }
  await closeSession(context);
}

async function ask() {
  const prompt = rest.join(' ').trim();
  if (!prompt) throw new Error('Usage: npm run browser:ask -- "your question"');
  const context = await openSession();
  const page = context.pages()[0] || await context.newPage();
  try {
    const evidence = await askChatGPT(page, prompt);
    console.log(JSON.stringify({ id: evidence.id, engine: evidence.engine, url: evidence.url, answer: evidence.answer.slice(0, 400), citations: evidence.citations, screenshot: evidence.screenshotPath, evidence: evidence.answerPath }, null, 2));
  } finally {
    await closeSession(context);
  }
}

async function login() {
  const engine = rest[0] === 'chatgpt' ? 'chatgpt' : 'perplexity';
  const context = await openSession({ headless: false });
  const page = context.pages()[0] || await context.newPage();
  try {
    await page.goto(engine === 'chatgpt' ? 'https://chatgpt.com/' : 'https://www.perplexity.ai/', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
    console.log(`Sign-in window opened for ${engine}.`);
    console.log('Use the designated Google account (non-Claude engines all support Google SSO). Complete any 2FA in the window.');
    console.log('Waiting for sign-in (up to 5 minutes)...');
    const domain = engine === 'chatgpt' ? 'https://chatgpt.com' : 'https://www.perplexity.ai';
    const deadline = Date.now() + 300_000;
    let signedIn = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(5_000);
      const cookies = await context.cookies(domain).catch(() => []);
      signedIn = cookies.some(cookie => /session|auth/i.test(cookie.name) && !/^__?cf/i.test(cookie.name));
      if (signedIn) break;
    }
    console.log(signedIn ? `${engine}: signed_in (session cookie present)` : `${engine}: still not signed in after 5 minutes. Run this command again when ready.`);
    if (!signedIn) process.exitCode = 1;
  } finally {
    await closeSession(context);
  }
}

async function probe() {
  const context = await openSession();
  const page = context.pages()[0] || await context.newPage();
  try {
    await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log(JSON.stringify({ url: page.url(), title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 120) }, null, 2));
  } finally {
    await closeSession(context);
  }
}

try {
  if (command === 'check') await check();
  else if (command === 'ask') await ask();
  else if (command === 'probe') await probe();
  else if (command === 'login') await login();
  else {
    console.log('Usage: browser:check | browser:login [perplexity|chatgpt] | browser:ask -- "question" | browser:probe');
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Browser command failed.');
  process.exitCode = 1;
}
