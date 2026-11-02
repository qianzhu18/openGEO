import { openSession, closeSession } from './session.js';
import { askChatGPT } from './engines/chatgpt.js';
import { askPerplexity } from './engines/perplexity.js';

export type BrowserEngine = 'chatgpt' | 'perplexity';
export interface BrowserAskResult {
  engine: string;
  answer: string;
  citations: string[];
  url: string;
  evidenceId: string;
  latencyMs: number;
}
export type BrowserAsk = (prompt: string) => Promise<BrowserAskResult>;

/**
 * One collector = one dedicated-profile browser, one page, prompts asked serially.
 * The profile keeps the user's own sessions; nothing is uploaded.
 */
export async function createBrowserCollector(engine: BrowserEngine, options: { headless?: boolean } = {}): Promise<{ ask: BrowserAsk; close: () => Promise<void>; engine: BrowserEngine }> {
  const context = await openSession({ headless: options.headless });
  const page = context.pages()[0] || await context.newPage();
  return {
    async ask(prompt: string) {
      const evidence = engine === 'chatgpt' ? await askChatGPT(page, prompt) : await askPerplexity(page, prompt);
      return { engine, answer: evidence.answer, citations: evidence.citations, url: evidence.url, evidenceId: evidence.id, latencyMs: evidence.durationMs };
    },
    async close() { await closeSession(context); },
    engine,
  };
}
