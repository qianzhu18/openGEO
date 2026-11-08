import type { Citation } from './types.js';

/** Official contract: cloro-dev/cloro-python 0.4.0, resources/monitor.py.
 * Monitoring is deliberately separate from ModelSession (strategy/content).
 * No automatic retries: an interrupted monitoring call may have been charged.
 */
export class CloroMonitor {
  private stopped = false;
  private requests = 0;
  constructor(private readonly key: string) {}

  async ask(engine: string, prompt: string, country: string) {
    if (this.stopped) throw new Error('Cloro 上次请求失败，本目标后续问题已停止；不会自动重试。');
    if (this.requests >= 10) throw new Error('Cloro 已达到单目标每轮 10 次监测上限。');
    if (!['chatgpt', 'gemini'].includes(engine) || !/^[A-Z]{2}$/.test(country) || !this.key) throw new Error('Cloro 需要有效的引擎、两位国家代码与 API Key。');
    const started = Date.now();
    try {
      this.requests++;
      const response = await fetch(`https://api.cloro.dev/v1/monitor/${engine}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(300_000),
        headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ prompt, country, include: { markdown: true } }),
      });
      // Never retain error bodies: they may contain request credentials or account data.
      if (!response.ok) throw new Error(`Cloro HTTP ${response.status}；本目标已停止。`);
      const raw = this.redact(await response.json()) as any;
      if (raw?.success !== true || typeof raw.result?.text !== 'string' || !raw.result.text.trim()) throw new Error('Cloro 未返回成功且非空的 result.text；原文未计为有效回答。');
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

  private redact(value: unknown): unknown {
    if (typeof value === 'string') return value.split(this.key).join('[REDACTED]');
    if (Array.isArray(value)) return value.map(item => this.redact(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name,
      /^(authorization|api[_-]?key|cookie|set-cookie|access[_-]?token|password|secret)$/i.test(name) ? '[REDACTED]' : this.redact(item)]));
    return value;
  }
}
