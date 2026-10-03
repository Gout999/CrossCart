import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import type { Run } from '../../lib/types';
async function approved(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter demo', exact: true }).click();
  await page.getByRole('button', { name: 'Understand request' }).click();
  await page.getByRole('button', { name: 'Compare demo merchants' }).click();
  await expect(page.getByRole('heading', { name: 'One product. All the details.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Merchant B' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Choose Merchant C' })).toBeDisabled();
  await page.getByRole('button', { name: 'Choose Merchant A' }).click();
  await page.getByRole('button', { name: 'Approve exact' }).click();
  await expect(page.getByRole('heading', { name: 'This exact purchase is approved.' })).toBeVisible();
}
async function evidence(page: Page, name: string, project: string) {
  const id = new URL(page.url()).searchParams.get('run');
  const response = await page.request.get(`/api/runs/${id}`);
  const run = await response.json() as Run;
  const output = process.env.CROSSCART_EVIDENCE_DIR ? `${process.env.CROSSCART_EVIDENCE_DIR}/playwright/local` : 'output/playwright';
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/${project}-${name}.png`, fullPage: true });
  expect(run.providerMode).toBe('local'); expect(run.mandate?.offer.totalMinor).toBe(174900);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${output}/${project}-${name}.json`, JSON.stringify(run, null, 2));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  return run;
}
test('happy path, evidence, and page refresh retain confirmed purchase', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await approved(page);
  await page.getByRole('button', { name: 'Execute approved local test purchase' }).click();
  await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible();
  await expect(page.getByTestId('payment-state')).toHaveText('CAPTURED');
  await expect(page.getByTestId('order-state')).toHaveText('CONFIRMED');
  await page.reload(); await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible();
  await page.getByText('Judge evidence', { exact: true }).click();
  const run = await evidence(page, 'happy', info.project.name); expect(run.paymentId).toMatch(/^local_pi_/); expect(errors).toEqual([]);
});
test('approved HK$1749 drifts to HK$1849, blocked with no payment execution', async ({ page }, info) => {
  await approved(page); await page.getByLabel('Demo scenario').selectOption('price_drift');
  await page.getByRole('button', { name: 'Execute approved local test purchase' }).click();
  await expect(page.getByRole('heading', { name: 'Purchase blocked.' })).toBeVisible();
  await expect(page.getByText('Payment: NOT EXECUTED', { exact: true })).toBeVisible();
  await expect(page.getByText('+HK$100', { exact: true })).toBeVisible();
  const run = await evidence(page, 'price-drift', info.project.name); expect(run.paymentId).toBeUndefined(); expect(run.currentOffer?.totalMinor).toBe(184900);
});
test('captured payment + known failed order retrieves refund and shows recovery', async ({ page }, info) => {
  await approved(page); await page.getByLabel('Demo scenario').selectOption('order_failure');
  await page.getByRole('button', { name: 'Execute approved local test purchase' }).click();
  await expect(page.getByRole('heading', { name: 'Order failed. Refund confirmed.' })).toBeVisible();
  await expect(page.getByTestId('payment-state')).toHaveText('CAPTURED'); await expect(page.getByTestId('order-state')).toHaveText('FAILED'); await expect(page.getByTestId('recovery-state')).toHaveText('REFUNDED');
  await page.getByText('Judge evidence', { exact: true }).click();
  const run = await evidence(page, 'refund', info.project.name); expect(run.refundId).toMatch(/^local_refund_/); expect(run.refundState).toBe('succeeded');
});
test('HTTP tampering, missing approval and cross-account access are rejected', async ({ page }) => {
  await approved(page); const id = new URL(page.url()).searchParams.get('run'); const headers = { Origin: new URL(page.url()).origin };
  expect((await page.request.post(`/api/runs/${id}/commit`, { headers, data: { amount: 1 } })).status()).toBe(400);
  expect((await page.request.post(`/api/runs/${id}/approve`, { headers, data: { mandateId: 'forged', hash: 'forged' } })).status()).toBe(409);
  expect((await page.request.post(`/api/runs/${id}/commit`, { headers: { Origin: 'https://attacker.invalid' }, data: {} })).status()).toBe(403);
  const before = await (await page.request.get(`/api/runs/${id}`)).json(); expect(before.paymentState).toBe('NOT_STARTED');
  await page.request.post('/api/login', { headers, data: { account: 'demo-other', password: 'crosscart-demo' } });
  expect((await page.request.get(`/api/runs/${id}`)).status()).toBe(403);
});

test('interpretation requires visible confirmation; ambiguous Sunday and no eligible offer remain truthful', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Enter demo', exact: true }).click();
  await page.getByLabel('Your request').fill('千六蚊耳機，要官方保養，星期日前收到。');
  await page.getByRole('button', { name: 'Understand request' }).click();
  await expect(page.getByText('Does the delivery deadline include Sunday? Confirm the exact date.')).toBeVisible();
  await expect(page.getByLabel('Total budget · HKD')).toHaveValue('1600');
  expect(new URL(page.url()).searchParams.get('run')).toBeNull();
  await page.getByRole('button', { name: 'Compare demo merchants' }).click();
  await expect(page.getByText('No offer meets all constraints. Start a new search and adjust your requirements.')).toBeVisible();
  for (const name of ['A', 'B', 'C']) await expect(page.getByRole('button', { name: `Choose Merchant ${name}` })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dir = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence/2026-10-03-round2'; mkdirSync(`${dir}/responsive`, { recursive: true }); await page.screenshot({ path: `${dir}/responsive/${info.project.name}-no-eligible.png`, fullPage: true });
});
test('follow-up revision starts a new version and leaves approved mandate untouched', async ({ page }, info) => {
  await approved(page); const id = new URL(page.url()).searchParams.get('run')!;
  const original = await (await page.request.get(`/api/runs/${id}`)).json() as Run;
  await page.getByRole('button', { name: 'Revise in a new version' }).click();
  await page.getByLabel('Your request').fill('預算加到二千蚊，揀最快送到嘅。'); await page.getByRole('button', { name: 'Understand request' }).click();
  await expect(page.getByLabel('Total budget · HKD')).toHaveValue('2000'); await expect(page.getByLabel('Warranty requirement')).toHaveValue('true');
  await page.getByRole('button', { name: 'Compare demo merchants' }).click();
  await expect(page.getByRole('button', { name: 'Choose Merchant C' })).toBeEnabled();
  const revisedId = new URL(page.url()).searchParams.get('run')!; expect(revisedId).not.toBe(id);
  const revised = await (await page.request.get(`/api/runs/${revisedId}`)).json() as Run;
  expect(revised.shoppingVersion).toBe(2); expect(revised.previousRunId).toBe(id); expect(revised.approval).toBeUndefined();
  const retained = await (await page.request.get(`/api/runs/${id}`)).json() as Run; expect(retained.mandate).toEqual(original.mandate); expect(retained.approval).toEqual(original.approval);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dir = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence/2026-10-03-round2'; mkdirSync(`${dir}/responsive`, { recursive: true }); await page.screenshot({ path: `${dir}/responsive/${info.project.name}-revision.png`, fullPage: true });
});
test('quote withdrawal controls show authorization canceled before capture', async ({ page }, info) => {
  await approved(page); await page.getByRole('button', { name: 'Pause capture', exact: true }).click();
  await page.getByRole('button', { name: 'Execute approved local test purchase' }).click();
  await expect(page.getByTestId('payment-state')).toHaveText('AUTHORIZED');
  await page.getByRole('button', { name: 'Withdraw quote', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Purchase blocked.' })).toBeVisible();
  await expect(page.getByTestId('payment-state')).toHaveText('CANCELED');
  const run = await evidence(page, 'quote-withdrawn', info.project.name); expect(run.merchantQuote?.state).toBe('REVOKED'); expect(run.refundId).toBeUndefined();
});
