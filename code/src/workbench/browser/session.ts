import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type BrowserContext } from 'playwright-core';

export interface SessionOptions {
  /** Dedicated Chrome profile. Never point this at the user's daily Chrome profile. */
  profileDir?: string;
  headless?: boolean;
  channel?: string;
}

export function profileDir(): string {
  return resolve(process.env.OPENGEO_BROWSER_PROFILE || 'data/browser-profile');
}

export function isHeadless(): boolean {
  return process.env.OPENGEO_BROWSER_HEADLESS === '1';
}

/** Launch the dedicated, persistent Chrome profile used for logged-in collection. */
export async function openSession(options: SessionOptions = {}): Promise<BrowserContext> {
  const dir = resolve(options.profileDir || profileDir());
  await mkdir(dir, { recursive: true });
  try {
    return await chromium.launchPersistentContext(dir, {
      channel: options.channel || process.env.OPENGEO_BROWSER_CHANNEL || 'chrome',
      headless: options.headless ?? isHeadless(),
      viewport: { width: 1280, height: 960 },
      locale: 'en-US',
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not start Chrome for the dedicated profile (${dir}): ${message}. Install Google Chrome or set OPENGEO_BROWSER_CHANNEL.`);
  }
}

/** Attach to a Chrome the user started with --remote-debugging-port=9222. */
export async function attachSession(port = Number(process.env.OPENGEO_CDP_PORT || 9222)): Promise<BrowserContext> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error(`Connected to port ${port}, but Chrome exposed no browser context.`);
  return context;
}

export async function closeSession(context: BrowserContext): Promise<void> {
  await context.close().catch(() => {});
}
