export const BATCH_LIMITS = { questions: 50, units: 300 } as const;
export const batchPolicy = () => ({
  maxRequests: BATCH_LIMITS.units * 3, maxAttempts: 3, outputTokens: 6000,
  requestTimeoutMs: 120_000, remoteDeadlineMs: 20 * 60_000,
  concurrency: { openrouter: 2, cloro: 1 } as Record<string, number>,
});
export type BatchPolicy = ReturnType<typeof batchPolicy>;

/** A run has bounded workers, not one socket for every planned question. */
export class ProviderSlots {
  private active = new Map<string, number>();
  private waiting = new Map<string, (() => void)[]>();
  constructor(private limits: Record<string, number>) {}
  async run<T>(provider: string, work: () => Promise<T>): Promise<T> {
    const limit = this.limits[provider] || 1;
    if ((this.active.get(provider) || 0) >= limit) {
      await new Promise<void>(resolve => {
        const queue = this.waiting.get(provider) || [];
        queue.push(resolve); this.waiting.set(provider, queue);
      });
    } else this.active.set(provider, (this.active.get(provider) || 0) + 1);
    try { return await work(); }
    finally {
      const next = this.waiting.get(provider)?.shift();
      if (next) next();
      else this.active.set(provider, (this.active.get(provider) || 1) - 1);
    }
  }
}

/** Equal jitter: the exponential floor remains, while workers do not wake together. */
export function backoffMs(attempt: number, random = Math.random, base = 1000, cap = 30_000) {
  const ceiling = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return Math.floor(ceiling / 2 + random() * ceiling / 2);
}
