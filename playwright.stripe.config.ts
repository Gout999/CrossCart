import { defineConfig, devices } from '@playwright/test';

// Run separately against the already-running Stripe app. Never reuse a local
// adapter as evidence of official sandbox behavior.
export default defineConfig({
  testDir: './tests/stripe-e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 60000 },
  outputDir: 'test-results/stripe',
  reporter: [['list'], ['json', { outputFile: process.env.CROSSCART_EVIDENCE_DIR ? `${process.env.CROSSCART_EVIDENCE_DIR}/playwright/stripe/results.json` : 'output/playwright/stripe/results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.APP_URL || 'http://127.0.0.1:3107',
    channel: 'chrome',
    locale: 'en-US',
    screenshot: 'only-on-failure',
    video: 'on',
    trace: 'off',
  },
});
