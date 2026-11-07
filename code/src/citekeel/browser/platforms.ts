export const WEB_PLATFORMS = {
  chatgpt: { url: 'https://chatgpt.com/' },
  perplexity: { url: 'https://www.perplexity.ai/' },
  gemini: { url: 'https://gemini.google.com/app' },
} as const;

export type BrowserEngine = keyof typeof WEB_PLATFORMS;
export function isBrowserEngine(value: unknown): value is BrowserEngine {
  return typeof value === 'string' && Object.hasOwn(WEB_PLATFORMS, value);
}
export function onEngineOrigin(engine: BrowserEngine, value: unknown): boolean {
  try {
    return typeof value === 'string' && new URL(value).origin === new URL(WEB_PLATFORMS[engine].url).origin;
  } catch { return false; }
}
