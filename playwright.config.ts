import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  reporter: [['list'], ['json', { outputFile: process.env.CROSSCART_EVIDENCE_DIR ? `${process.env.CROSSCART_EVIDENCE_DIR}/playwright/local/results.json` : 'output/playwright/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:3118', channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'on' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3118', reuseExistingServer: false, env: { PORT: '3118', APP_URL: 'http://127.0.0.1:3118', PAYMENT_PROVIDER: 'local', CROSSCART_DB: 'data/e2e.sqlite', DEMO_PASSWORD: 'crosscart-demo', AI_API_KEY: '', AI_MODEL: '' }, timeout: 90000 }
});
