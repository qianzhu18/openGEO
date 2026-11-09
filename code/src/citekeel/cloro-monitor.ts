import type { Citation } from './types.js';
import type { ProviderHttpEvent } from '../../vendor/niubigeo/src/providers/http.js';
import { apiAnswerProblem, redactApiEvidence } from './api-receipts.js';

// Personal workbench: one shared slot also covers ChatGPT and Gemini together.
// Free Cloro plans allow one monitor job; a timeout releases only our local slot.
let monitorQueue: Promise<void> = Promise.resolve();

/** Official contract: cloro-dev/cloro-python 0.4.0, resources/monitor.py.
 * Monitoring is deliberately separate from ModelSession (strategy/content).
 * No automatic retries: an interrupted monitoring call may have been charged.
 */
export class CloroMonitor {
  private stopped = false;
  private requests = 0;
  constructor(private readonly key: string) {}

  ask(engine: string, prompt: string, country: string, observe?: (event: ProviderHttpEvent) => Promise<void>) {
    const work = monitorQueue.then(() => this.perform(engine, prompt, country, observe));
    monitorQueue = work.then(() => {}, () => {});
    return work;
  }

  private async perform(engine: string, prompt: string, country: string, observe?: (event: ProviderHttpEvent) => Promise<void>) {
    if (this.stopped) throw new Error('Cloro 上次请求失败，本目标后续问题已停止；不会自动重试。');
    if (this.requests >= 10) throw new Error('Cloro 已达到单目标每轮 10 次监测上限。');
    if (!['chatgpt', 'gemini'].includes(engine) || !/^[A-Z]{2}$/.test(country) || !this.key) throw new Error('Cloro 需要有效的引擎、两位国家代码与 API Key。');
    const started = Date.now();
    try {
      this.requests++;
      await observe?.({ phase: 'attempted' });
      const response = await fetch(`https://api.cloro.dev/v1/monitor/${engine}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300_000),
        headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ prompt, country, include: { markdown: true } }),
      });
      const body = await response.text();
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { parsed = { unparsedBody: body }; }
      const raw = redactApiEvidence(parsed, this.key) as any;
      await observe?.({ phase: 'response', status: response.status, data: raw,
        requestId: response.headers.get('x-request-id') || response.headers.get('request-id') || undefined });
      if (!response.ok) throw new Error(`Cloro HTTP ${response.status}；本目标已停止。`);
      if (raw?.success !== true || typeof raw.result?.text !== 'string' || !raw.result.text.trim()) throw new Error('Cloro 未返回成功且非空的 result.text；原文未计为有效回答。');
      const answerProblem = apiAnswerProblem(raw.result.text, raw);
      if (answerProblem) throw new Error(answerProblem);
      const citations: Citation[] = [];
      for (const [index, source] of (Array.isArray(raw.result.sources) ? raw.result.sources : []).entries()) {
        if (typeof source?.url !== 'string') continue;
        try {
          const url = new URL(source.url);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
          // A returned source is not proof that the answer cited or supports it.
          citations.push({ url: source.url, kind: 'search_result', source: 'cloro_monitor_source', payloadPath: `result.sources[${index}].url`, integrity: 'matched' });
        } catch { /* Invalid source URL stays only in the redacted raw response. */ }
      }
      return { answer: raw.result.text as string, rawResponse: raw, citations, latencyMs: Date.now() - started,
        observedAt: new Date().toISOString(), observation: { transport: 'cloro-monitor-api' as const, engine, requestedCountry: country, actualModel: 'UNKNOWN' as const, searchExecution: 'UNKNOWN' as const } };
    } catch (error) {
      this.stopped = true;
      const message = error instanceof Error ? error.message : 'Cloro 请求失败';
      throw new Error(message.split(this.key).join('[REDACTED]'));
    }
  }

}
