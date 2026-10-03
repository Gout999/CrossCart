import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/stripe-restart', workers: 1, retries: 0, timeout: 240000,
  expect: { timeout: 150000 }, outputDir: 'test-results/stripe-restart',
  reporter: [['list'], ['json', { outputFile: `${process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence/2026-10-03-completion-audit'}/pending-restart-results.json` }]],
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: process.env.APP_URL || 'http://127.0.0.1:3107', trace: 'off', video: 'off', screenshot: 'only-on-failure' }
});
