/**
 * Optional browser rendering for client-rendered sites.
 * Uses the locally installed Chrome/Chromium through Playwright; returns null when unavailable.
 */
export interface RenderedPage { url: string; text: string; contentType: string }

export async function renderPage(url: string, timeoutMs = 20_000): Promise<RenderedPage | null> {
  let browser: Awaited<ReturnType<typeof import('@playwright/test')['chromium']['launch']>> | undefined;
  try {
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({ channel: 'chrome', headless: true }).catch(() => chromium.launch({ headless: true }));
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 OpenGEO/0.2',
      locale: 'en-US',
      javaScriptEnabled: true,
    });
    await context.route('**/*', route => {
      const type = route.request().resourceType();
      return ['image', 'media', 'font'].includes(type) ? route.abort() : route.continue();
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const html = await page.content();
    return { url: page.url(), text: html, contentType: 'text/html; charset=utf-8' };
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
