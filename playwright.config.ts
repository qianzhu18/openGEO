import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8857', browserName: 'chromium', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:8857/api/status', reuseExistingServer: false, timeout: 20000,
    env: { CITEKEEL_PORT: '8857', CITEKEEL_DATA_DIR: 'data/browser-tests' } },
});
