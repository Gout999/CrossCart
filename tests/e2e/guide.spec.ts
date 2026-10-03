import { test, expect } from '@playwright/test';
test('same-task benchmark records actual manual/normalized actions and keeps payment outside the comparison', async ({ page }) => {
  await page.goto('/benchmark');
  await page.getByRole('button', { name: 'Start manual comparison' }).click();
  await page.getByRole('heading', { name: 'Merchant A' }).waitFor();
  await page.getByRole('button', { name: 'Next merchant' }).click();
  await page.getByRole('heading', { name: 'Merchant B' }).waitFor();
  await page.getByRole('button', { name: 'Next merchant' }).click();
  await page.getByRole('heading', { name: 'Merchant C' }).waitFor();
  await page.getByRole('button', { name: 'Compare and choose' }).click();
  await page.getByRole('button', { name: 'Select Merchant A' }).click();
  const result = page.getByRole('table', { name: 'Your comparison observations' });
  await expect(result.getByRole('row', { name: /Manual layout/ }).getByRole('cell', { name: '4', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start CrossCart comparison' }).click();
  await page.getByRole('button', { name: 'Select Merchant A' }).click();
  await expect(result.getByRole('row', { name: /CrossCart layout/ }).getByRole('cell', { name: '1', exact: true })).toBeVisible();
  await expect(page.getByText('No payment was authorized.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('public evidence has dated sources, exact gross total and conditional rewards, without guide overflow', async ({ page }) => {
  await page.goto('/evidence');
  await expect(page.getByRole('link', { name: /Stripe Hong Kong standard pricing/ })).toHaveAttribute('href', 'https://stripe.com/en-hk/pricing');
  await expect(page.getByText('HK$61.82', { exact: true })).toBeVisible();
  await expect(page.getByText(/The demo applies no card rebate or points discount/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
