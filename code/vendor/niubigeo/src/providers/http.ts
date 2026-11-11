import { AsyncLocalStorage } from "node:async_hooks";
import { isRequestProviderScope, redactRequestSecrets } from "../config/env.js";

import { customConnection, customProviderFetch } from "./custom-connection.js";

const scopedAttempts = new AsyncLocalStorage<number>();
const scopedTimeout = new AsyncLocalStorage<number>();
export function withProviderHttpTimeout<T>(ms: number, operation: () => T): T {
  return scopedTimeout.run(ms, operation);
}
export type ProviderHttpEvent =
  | { phase: 'attempted' }
  | { phase: 'response'; status: number; data: unknown; requestId?: string; retryAfterMs?: number };
export function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  const delay = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay >= 0 ? delay : undefined;
}
const httpObserver = new AsyncLocalStorage<(event: ProviderHttpEvent) => Promise<void>>();
/** OpenGEO: retain paid response evidence before adapter validation can throw. */
export function withProviderHttpObserver<T>(observer: (event: ProviderHttpEvent) => Promise<void>, operation: () => T): T {
  return httpObserver.run(observer, operation);
}

/** Bound retries for one paid operation without changing other concurrent callers. */
export function withProviderHttpAttempts<T>(attempts: number, operation: () => T): T {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 8) throw new Error("Invalid HTTP attempt limit");
  return scopedAttempts.run(attempts, operation);
}

export interface JsonResponse {
  status: number;
  ok: boolean;
  data: unknown;
  latencyMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestTimeoutMs(): number {
  if (scopedTimeout.getStore()) return scopedTimeout.getStore()!;
  const configured = Number(process.env.PROVIDER_TIMEOUT_MS || 45000);
  return Number.isFinite(configured) && configured > 0 ? configured : 45000;
}

function requestAttempts(): number {
  const scoped = scopedAttempts.getStore();
  if (scoped !== undefined) return scoped;
  const configured = Number(process.env.PROVIDER_HTTP_ATTEMPTS || 3);
  if (!Number.isInteger(configured) || configured < 1) return 3;
  return Math.min(configured, 8);
}

function isTransient(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export async function postJsonWithRetry(url: string, init: RequestInit, attempts = requestAttempts()): Promise<JsonResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());
    try {
      await httpObserver.getStore()?.({ phase: 'attempted' });
      const response = await (customConnection() && url.startsWith(customConnection()!.baseUrl + "/") ? customProviderFetch : fetch)(url, { ...init, ...(isRequestProviderScope() ? { redirect: "error" as const } : {}), signal: controller.signal });
      let data: unknown;
      if (httpObserver.getStore()) {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = { unparsedBody: text }; }
      } else data = await response.json().catch(() => ({}));
      data = redactRequestSecrets(data);
      const latencyMs = Date.now() - started;
      await httpObserver.getStore()?.({ phase: 'response', status: response.status, data, retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
        requestId: response.headers.get('x-request-id') || response.headers.get('request-id') || undefined });
      if (response.ok || !isTransient(response.status) || attempt === attempts) {
        return { status: response.status, ok: response.ok, data, latencyMs };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = isRequestProviderScope() ? new Error(redactRequestSecrets(error instanceof Error ? error.message : String(error))) : error;
      if (attempt === attempts) throw lastError;
    } finally {
      clearTimeout(timeout);
    }
    await sleep(500 * attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
