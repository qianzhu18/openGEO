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
  else {
    console.log('Usage: browser:check | browser:ask -- "question" | browser:probe');
    process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Browser command failed.');
  process.exitCode = 1;
}
