import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
// The config is also imported in worker processes. Pass the invocation's unique
// test directory to workers, and never reuse a user's production data directory.
const browserDataDir = process.env.TEST_WORKER_INDEX === undefined
  ? `data/browser-tests-${randomUUID()}` : process.env.OPENGEO_DATA_DIR!;
process.env.OPENGEO_DATA_DIR = browserDataDir;
export default defineConfig({
  testDir: './test/browser', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8857', browserName: 'chromium', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:8857/api/status', reuseExistingServer: false, timeout: 120000,
    env: { OPENGEO_PORT: '8857', OPENGEO_DATA_DIR: browserDataDir, NEXT_TELEMETRY_DISABLED: '1' } },
});
