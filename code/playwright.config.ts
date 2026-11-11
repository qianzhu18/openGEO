import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8857', browserName: 'chromium', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:8857/api/status', reuseExistingServer: false, timeout: 120000,
    env: { OPENGEO_PORT: '8857', OPENGEO_DATA_DIR: 'data/browser-tests', NEXT_TELEMETRY_DISABLED: '1' } },
});
