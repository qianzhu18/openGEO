import { createScriptCollector, type ScriptOptions } from './script-collector.js';

export type BrowserEngine = 'chatgpt' | 'perplexity';
export interface BrowserAskResult {
  engine: string;
  answer: string;
  citations: string[];
  url: string;
  evidenceId: string;
  latencyMs: number;
  evidencePath?: string;
  protocolId?: string;
}
export type BrowserAsk = (prompt: string) => Promise<BrowserAskResult>;

/** Actual sampling only uses the verified Xue bridge; never launch a replacement profile. */
export async function createBrowserCollector(engine: BrowserEngine, options: ScriptOptions = {}) {
  return createScriptCollector(engine, options);
}
