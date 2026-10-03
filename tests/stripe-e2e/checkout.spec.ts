import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { stripeClient } from '../../lib/payments';
import type { Run } from '../../lib/types';
import { closeCloudLedger, withLedger } from '../../lib/cloud-ledger';
import { Commerce } from '../../lib/service';

const output = process.env.CROSSCART_EVIDENCE_DIR ? `${process.env.CROSSCART_EVIDENCE_DIR}/playwright/stripe` : 'output/playwright/stripe';
const publicCloud = process.env.CROSSCART_PUBLIC_DEMO === 'true';
test.afterAll(async () => { if (publicCloud) await closeCloudLedger(); });
mkdirSync(output, { recursive: true });

async function confirmDeliveryDate(page: Page) {
  const field = page.getByLabel('Arrive by');
  await expect(field).toBeVisible();
  // Live AI may request an exact date for “within 2 days”. Exercise the visible
  // confirmation form as a buyer would, rather than bypassing that requirement.
  if (!await field.inputValue()) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 2 * 86400000));
    await field.fill(date);
  }
}

async function approved(page: Page) {
  if (!/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || '')) {
    throw new Error('An official Stripe TEST key is required; no local fallback is allowed.');
  }
  await page.goto('/');
  await page.getByLabel('Demo password').fill(process.env.DEMO_PASSWORD || 'crosscart-demo');
  await page.getByRole('button', { name: 'Enter demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Understand request' })).toBeVisible();
  const session = await (await page.request.get('/api/session')).json();
  expect(session.provider).toBe('stripe');
  await page.getByRole('button', { name: 'Understand request' }).click();
  await confirmDeliveryDate(page);
  await page.getByRole('button', { name: 'Compare demo merchants' }).click();
  await expect(page.getByRole('button', { name: 'Choose Merchant B' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Choose Merchant C' })).toBeDisabled();
  await page.getByRole('button', { name: 'Choose Merchant A' }).click();
  await page.getByRole('button', { name: 'Approve exact' }).click();
  await expect(page.getByRole('heading', { name: 'This exact purchase is approved.' })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('run');
  expect(id).toBeTruthy();
  const run = await (await page.request.get(`/api/runs/${id}`)).json() as Run;
  expect(run.providerMode).toBe('stripe');
  expect(run.mandate?.offer.totalMinor).toBe(174900);
  expect(run.mandate?.offer.payee).toMatch(/^acct_/);
  for (const scenario of ['capture_timeout', 'refund_pending', 'refund_failed']) {
    await expect(page.locator(`option[value="${scenario}"]`)).toHaveCount(0);
    const denied = await page.request.post(`/api/runs/${id}/scenario`, { headers: { Origin: new URL(page.url()).origin }, data: { scenario } });
    expect(denied.status()).toBe(400);
  }
  return run;
}

async function hostedAuthorization(page: Page) {
  await page.getByRole('button', { name: 'Continue to Stripe test authorization' }).click();
  await page.getByRole('link', { name: 'Open Stripe hosted test checkout' }).click();
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);
  await expect(page.locator('#cardNumber')).toBeVisible();
  // Selectors were inspected on the actual Hosted Checkout page. These are
  // Stripe's official interactive test card and synthetic billing details.
  await page.locator('#email').fill('crosscart-demo@example.com');
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('1234');
  await page.locator('#cardCvc').fill('123');
  await page.locator('#billingName').fill('CrossCart Demo Buyer');
  await page.locator('#billingCountry').selectOption('HK');
  await page.locator('#enableStripePass').uncheck();
  await page.locator('button[type="submit"]').click();
  const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:3107').origin;
  await page.waitForURL(url => url.origin === origin, { timeout: 90000 });
}

async function evidence(page: Page, name: string, approvedRun: Run) {
  const run = await (await page.request.get(`/api/runs/${approvedRun.id}`)).json() as Run;
  expect(run.mandate).toEqual(approvedRun.mandate);
  expect(run.approval).toEqual(approvedRun.approval);
  await page.getByText('Judge evidence', { exact: true }).click();
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  const { checkoutUrl: _temporaryCheckoutAddress, ...safeRun } = run;
  void _temporaryCheckoutAddress;
  writeFileSync(`${output}/${name}.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Official Stripe Hosted Checkout through the CrossCart app; synthetic merchant adapter.', run: safeRun }, null, 2));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  return run;
}

async function providerEvidence(run: Run, name: string) {
  const stripe = stripeClient();
  const account = await stripe.accounts.retrieveCurrent();
  const session = await stripe.checkout.sessions.retrieve(run.sessionId!);
  const payment = await stripe.paymentIntents.retrieve(run.paymentId!, { expand: ['latest_charge'] });
  expect(account.id).toBe(run.mandate?.offer.payee);
  expect(session.id).toBe(run.sessionId);
  expect(session.livemode).toBe(false);
  expect(session.status).toBe('complete');
  expect(session.amount_total).toBe(run.mandate!.offer.totalMinor);
  expect(session.currency).toBe('hkd');
  expect(session.payment_intent).toBe(run.paymentId);
  expect(payment.livemode).toBe(false);
  expect(payment.status).toBe('succeeded');
  expect(payment.amount_received).toBe(run.mandate!.offer.totalMinor);
  expect(payment.capture_method).toBe('manual');
  expect(payment.metadata).toMatchObject({ run_id: run.id, mandate_id: run.mandate!.id, mandate_hash: run.mandate!.hash, payee_id: account.id });
  const charge = typeof payment.latest_charge === 'object' ? payment.latest_charge : undefined;
  const captureBefore = charge?.payment_method_details?.card?.capture_before;
  expect(captureBefore).toBeGreaterThan(Date.now() / 1000);
  const refund = run.refundId ? await stripe.refunds.retrieve(run.refundId) : undefined;
  if (refund) {
    expect(refund.status).toBe('succeeded');
    expect(refund.amount).toBe(run.mandate!.offer.totalMinor);
    expect(refund.currency).toBe('hkd');
    expect(refund.payment_intent).toBe(run.paymentId);
    expect(refund.metadata).toMatchObject({ run_id: run.id, mandate_hash: run.mandate!.hash, operation_id: `${run.id}:refund` });
  }
  const report = {
    checkedAt: new Date().toISOString(), officialStripeSandboxVerified: true,
    testAccountId: account.id, runId: run.id,
    checkout: { id: session.id, status: session.status, paymentIntent: session.payment_intent, totalMinor: session.amount_total, currency: session.currency, livemode: session.livemode },
    payment: { id: payment.id, status: payment.status, authorizedMinor: payment.amount, receivedMinor: payment.amount_received, currency: payment.currency, captureMethod: payment.capture_method, captureBefore, livemode: payment.livemode, metadata: payment.metadata },
    ...(refund ? { refund: { id: refund.id, status: refund.status, paymentIntent: refund.payment_intent, amountMinor: refund.amount, currency: refund.currency, metadata: refund.metadata } } : {}),
  };
  writeFileSync(`${output}/${name}-provider.json`, JSON.stringify(report, null, 2));
}

test('official Hosted Checkout captures exact total, confirms one demo order, and survives refresh/retry', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const approvedRun = await approved(page);
  await hostedAuthorization(page);
  await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible();
  await expect(page.getByTestId('payment-state')).toHaveText('CAPTURED');
  await expect(page.getByTestId('order-state')).toHaveText('CONFIRMED');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible();
  const run = await evidence(page, 'happy', approvedRun);
  await providerEvidence(run, 'happy');
  const duplicate = await page.request.post(`/api/runs/${run.id}/commit`, { headers: { Origin: new URL(page.url()).origin }, data: {} });
  expect(duplicate.status()).toBe(200);
  const unchanged = await duplicate.json() as Run;
  expect(unchanged.paymentId).toBe(run.paymentId);
  expect(unchanged.orderId).toBe(run.orderId);
  expect(unchanged.status).toBe('CONFIRMED');
  expect(errors).toEqual([]);
});

test('approved HK$1749 -> HK$1849 is blocked before any official Checkout/payment is created', async ({ page }) => {
  const approvedRun = await approved(page);
  await page.getByLabel('Demo scenario').selectOption('price_drift');
  await page.getByRole('button', { name: 'Continue to Stripe test authorization' }).click();
  await expect(page.getByRole('heading', { name: 'Purchase blocked.' })).toBeVisible();
  await expect(page.getByText('Payment: NOT EXECUTED', { exact: true })).toBeVisible();
  await expect(page.getByText('+HK$100', { exact: true })).toBeVisible();
  const run = await evidence(page, 'price-drift', approvedRun);
  expect(run.paymentState).toBe('NOT_STARTED');
  expect(run.paymentId).toBeUndefined();
  expect(run.sessionId).toBeUndefined();
  expect(run.currentOffer?.totalMinor).toBe(184900);
  expect(run.status).toBe('BLOCKED');
});

test('official captured payment + known demo order failure is refunded and retrieved as succeeded', async ({ page }) => {
  const approvedRun = await approved(page);
  await page.getByLabel('Demo scenario').selectOption('order_failure');
  await hostedAuthorization(page);
  await expect(page.getByRole('heading', { name: 'Order failed. Refund confirmed.' })).toBeVisible();
  await expect(page.getByTestId('payment-state')).toHaveText('CAPTURED');
  await expect(page.getByTestId('order-state')).toHaveText('FAILED');
  await expect(page.getByTestId('recovery-state')).toHaveText('REFUNDED');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Order failed. Refund confirmed.' })).toBeVisible();
  const run = await evidence(page, 'refund', approvedRun);
  expect(run.refundId).toMatch(/^re_/);
  expect(run.refundState).toBe('succeeded');
  await providerEvidence(run, 'refund');
});

test('withdrawn quote after official authorization cancels the same hold before capture', async ({ page }) => {
  const approvedRun = await approved(page);
  const control = async (action: string) => {
    const response = await page.request.post(`/api/runs/${approvedRun.id}/demo-control`, { headers: { Origin: new URL(process.env.APP_URL || 'http://127.0.0.1:3107').origin }, data: { action } });
    expect(response.status()).toBe(200);
  };
  await control('hold_capture'); await hostedAuthorization(page);
  await expect.poll(async () => (await (await page.request.get(`/api/runs/${approvedRun.id}`)).json()).paymentState).toBe('AUTHORIZED');
  const authorized = await (await page.request.get(`/api/runs/${approvedRun.id}`)).json() as Run;
  const stripe = stripeClient(); const hold = await stripe.paymentIntents.retrieve(authorized.paymentId!);
  expect(hold.status).toBe('requires_capture'); expect(hold.amount_capturable).toBe(174900); expect(hold.amount_received).toBe(0);
  await control('revoke_quote');
  await expect(page.getByRole('heading', { name: 'Purchase blocked.' })).toBeVisible();
  await expect(page.getByTestId('payment-state')).toHaveText('CANCELED');
  const run = await evidence(page, 'quote-withdrawn-after-authorization', approvedRun);
  const canceled = await stripe.paymentIntents.retrieve(run.paymentId!);
  expect(canceled.id).toBe(hold.id); expect(canceled.status).toBe('canceled'); expect(canceled.amount_received).toBe(0);
  expect(run.refundId).toBeUndefined(); expect(run.orderState).toBe('NOT_CREATED'); expect(run.recoveryState).toBe('NONE');
  const retry = await page.request.post(`/api/runs/${run.id}/commit`, { headers: { Origin: new URL(page.url()).origin }, data: {} });
  expect((await retry.json()).status).toBe('BLOCKED');
  writeFileSync(`${output}/quote-withdrawn-provider.json`, JSON.stringify({ checkedAt: new Date().toISOString(), runId: run.id, id: hold.id, before: { status: hold.status, capturableMinor: hold.amount_capturable, receivedMinor: hold.amount_received }, after: { status: canceled.status, receivedMinor: canceled.amount_received, livemode: canceled.livemode }, refundCreated: false, originalMandateUnchanged: true }, null, 2));
});

test('catalogue update after authorization keeps the original accepted quote and captures its exact total', async ({ page }) => {
  const approvedRun = await approved(page);
  const control = async (action: string) => {
    const response = await page.request.post(`/api/runs/${approvedRun.id}/demo-control`, { headers: { Origin: new URL(process.env.APP_URL || 'http://127.0.0.1:3107').origin }, data: { action } });
    expect(response.status()).toBe(200);
  };
  await control('hold_capture'); await hostedAuthorization(page);
  await expect.poll(async () => (await (await page.request.get(`/api/runs/${approvedRun.id}`)).json()).paymentState).toBe('AUTHORIZED');
  await control('catalogue_update'); await control('resume_capture');
  await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible();
  const run = await evidence(page, 'catalogue-update-locked-quote', approvedRun);
  expect(run.catalogueUpdate?.totalMinor).toBe(184900); expect(run.merchantQuote?.state).toBe('ACTIVE'); expect(run.merchantQuote?.offer.totalMinor).toBe(174900);
  await providerEvidence(run, 'catalogue-update-locked-quote');
});

test('live AI purchase completes on mobile viewport without browser return; official webhooks and local replays are correlated', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const runBefore = await approved(page);
  expect(runBefore.shoppingId).toBeTruthy();
  const shopping = await (await page.request.get(`/api/shopping/${runBefore.shoppingId}`)).json();
  expect(shopping.parseMode).toBe('live-ai'); expect(shopping.comparisonMode).toBe('live-ai');
  const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:3107').origin;
  let blockedReturn = false;
  await page.route(`${origin}/?run=**`, async route => { blockedReturn = true; await route.abort('blockedbyclient'); });
  await page.getByRole('button', { name: 'Continue to Stripe test authorization' }).click();
  await page.getByRole('link', { name: 'Open Stripe hosted test checkout' }).click();
  await expect(page.locator('#cardNumber')).toBeVisible();
  await page.locator('#email').fill('crosscart-demo@example.com'); await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('1234'); await page.locator('#cardCvc').fill('123'); await page.locator('#billingName').fill('CrossCart Demo Buyer');
  await page.locator('#billingCountry').selectOption('HK'); if (await page.locator('#enableStripePass').isVisible()) await page.locator('#enableStripePass').uncheck();
  await page.locator('button[type="submit"]').click();
  // APIRequestContext shares the original authenticated cookie. The success
  // document is never allowed to reach Next, so the browser cannot advance it.
  // Public API polling can itself trigger continuation. Observe PostgreSQL
  // directly without processing jobs to prove the signed webhook finishes it.
  const get = async () => publicCloud
    ? await withLedger(store => new Commerce(store).get(runBefore.id, runBefore.ownerId))
    : await (await page.request.get(`/api/runs/${runBefore.id}`)).json() as Run;
  await expect.poll(async () => (await get()).status).toBe('CONFIRMED');
  await expect.poll(() => blockedReturn).toBe(true);
  await expect.poll(async () => (await get()).webhookReceipts?.filter(r => r.status === 'HANDLED').length || 0).toBeGreaterThanOrEqual(2);
  const completedWithoutReturn = await get(); const stripe = stripeClient();
  const received = completedWithoutReturn.webhookReceipts!.filter(r => r.id.startsWith('evt_'));
  const authoritativeEvents = [];
  for (const receipt of received) {
    const e = await stripe.events.retrieve(receipt.id); const o = e.data.object as unknown as { id: string; metadata: Record<string, string>; payment_intent?: string };
    expect(e.livemode).toBe(false); expect(o.metadata.run_id).toBe(runBefore.id); expect(o.metadata.mandate_hash).toBe(runBefore.mandate!.hash);
    expect([completedWithoutReturn.sessionId, completedWithoutReturn.paymentId]).toContain(o.id);
    authoritativeEvents.push({ id: e.id, type: e.type, objectId: o.id, paymentIntent: o.payment_intent || completedWithoutReturn.paymentId, livemode: e.livemode, receipt });
  }
  const original = await stripe.events.retrieve(received.find(r => r.eventType === 'payment_intent.amount_capturable_updated')!.id);
  const raw = JSON.stringify(original);
  const invalid = await page.request.post('/api/webhooks/stripe', { headers: { 'stripe-signature': 't=1,v1=invalid' }, data: raw }); expect(invalid.status()).toBe(400);
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET!; expect(signingSecret).toBeTruthy();
  const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: signingSecret });
  const duplicate = await page.request.post('/api/webhooks/stripe', { headers: { 'stripe-signature': signature, 'Content-Type': 'application/json' }, data: raw });
  expect(duplicate.status()).toBe(200); expect((await duplicate.json()).duplicate).toBe(true);
  const reordered = { ...original, id: `local_replay_${original.id}` }; const reorderedRaw = JSON.stringify(reordered);
  const localSignature = stripe.webhooks.generateTestHeaderString({ payload: reorderedRaw, secret: signingSecret });
  const late = await page.request.post('/api/webhooks/stripe', { headers: { 'stripe-signature': localSignature, 'Content-Type': 'application/json' }, data: reorderedRaw }); expect(late.status()).toBe(200);
  await expect.poll(async () => (await get()).webhookReceipts?.find(r => r.id === reordered.id)?.status).toBe('HANDLED');
  const settled = await get(); expect(settled.status).toBe('CONFIRMED'); expect(settled.paymentId).toBe(completedWithoutReturn.paymentId); expect(settled.orderId).toBe(completedWithoutReturn.orderId);
  expect(settled.webhookReceipts?.find(r => r.id === reordered.id)?.retrievedState).toBe('succeeded');
  expect(settled.refundId).toBeUndefined();
  await page.unroute(`${origin}/?run=**`); await page.goto(`/?run=${runBefore.id}`);
  await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible();
  await evidence(page, 'mobile-no-return', runBefore); await providerEvidence(settled, 'mobile-no-return');
  writeFileSync(`${output}/webhook-official.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: publicCloud ? 'Actual Stripe delivery to registered HTTPS endpoint; no browser return or CrossCart API polling before settlement' : 'Actual Stripe CLI deliveries of official events tied to this new Checkout; concurrent durable worker polling', runId: settled.id, paymentId: settled.paymentId, sessionId: settled.sessionId, successReturnBlocked: blockedReturn, settledBeforeManualReload: true, shopping, events: authoritativeEvents, invalidSignatureStatus: invalid.status(), localReplay: { scope: 'LOCAL SDK-SIGNED REPLAY; not official redelivery', sourceEvent: original.id, duplicateAcknowledged: true, alteredReorderingFixtureId: reordered.id, retrievedState: 'succeeded', samePaymentAndOrder: true }, officialRedelivery: publicCloud ? 'Not exercised in this run; registered public endpoint exists' : 'Not exercised: local listener has no registered endpoint' }, null, 2));
});

test('English live AI recommends third-party Merchant B and exact HK$1699 survives mobile Checkout return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.getByRole('button', { name: 'Enter demo', exact: true }).click();
  await page.getByLabel('Your request').fill('Find headphones under HKD 1800 total including delivery, third-party warranty is okay, within 2 days. Choose the cheapest.');
  await page.getByRole('button', { name: 'Understand request' }).click(); await expect(page.getByLabel('Warranty requirement')).toHaveValue('false');
  await confirmDeliveryDate(page);
  await page.getByRole('button', { name: 'Compare demo merchants' }).click();
  await expect(page.getByRole('button', { name: 'Choose Merchant B' })).toBeEnabled();
  await page.getByRole('button', { name: 'Choose Merchant B' }).click(); await page.getByRole('button', { name: 'Approve exact' }).click();
  await expect(page.getByRole('heading', { name: 'This exact purchase is approved.' })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('run')!; const approvedRun = await (await page.request.get(`/api/runs/${id}`)).json() as Run;
  expect(approvedRun.mandate!.offer.totalMinor).toBe(169900); const shopping = await (await page.request.get(`/api/shopping/${approvedRun.shoppingId}`)).json();
  expect(shopping.parseMode).toBe('live-ai'); expect(shopping.comparisonMode).toBe('live-ai'); expect(shopping.comparison.recommendation.rankedOfferIds[0]).toBe('demo_offer_b_v1');
  await hostedAuthorization(page); await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible();
  const run = await evidence(page, 'english-merchant-b', approvedRun); expect(run.paymentState).toBe('CAPTURED'); await providerEvidence(run, 'english-merchant-b');
  writeFileSync(`${output}/english-merchant-b-ai.json`, JSON.stringify(shopping, null, 2));
});

test('live AI revision to HK$2000 recommends C; exact HK$1829 capture and refund leave old approval intact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const original = await approved(page);
  await page.getByRole('button', { name: 'Revise in a new version' }).click();
  await page.getByLabel('Your request').fill('預算加到二千蚊，仍然要官方保養，兩日內收到，揀最快送到嘅。');
  await page.getByRole('button', { name: 'Understand request' }).click(); await expect(page.getByLabel('Total budget · HKD')).toHaveValue('2000');
  await confirmDeliveryDate(page);
  await page.getByRole('button', { name: 'Compare demo merchants' }).click();
  await expect(page.getByRole('button', { name: 'Choose Merchant C' })).toBeEnabled(); await page.getByRole('button', { name: 'Choose Merchant C' }).click();
  await page.getByRole('button', { name: 'Approve exact' }).click(); await expect(page.getByRole('heading', { name: 'This exact purchase is approved.' })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('run')!; const approvedRun = await (await page.request.get(`/api/runs/${id}`)).json() as Run;
  expect(approvedRun.mandate!.offer.totalMinor).toBe(182900); expect(approvedRun.previousRunId).toBe(original.id); expect(approvedRun.shoppingVersion).toBe(2);
  const shopping = await (await page.request.get(`/api/shopping/${approvedRun.shoppingId}`)).json(); expect(shopping.parseMode).toBe('live-ai'); expect(shopping.comparisonMode).toBe('live-ai'); expect(shopping.comparison.recommendation.rankedOfferIds[0]).toBe('demo_offer_c_v1');
  await page.getByLabel('Demo scenario').selectOption('order_failure'); await hostedAuthorization(page);
  await expect(page.getByRole('heading', { name: 'Order failed. Refund confirmed.' })).toBeVisible();
  const run = await evidence(page, 'revision-merchant-c-refund', approvedRun); expect(run.refundState).toBe('succeeded'); await providerEvidence(run, 'revision-merchant-c-refund');
  const retained = await (await page.request.get(`/api/runs/${original.id}`)).json() as Run; expect(retained.mandate).toEqual(original.mandate); expect(retained.approval).toEqual(original.approval); expect(retained.paymentId).toBeUndefined(); expect(retained.sessionId).toBeUndefined();
  writeFileSync(`${output}/revision-merchant-c-ai.json`, JSON.stringify({ shopping, retainedOriginal: { runId: retained.id, mandate: retained.mandate, approval: retained.approval, paymentState: retained.paymentState } }, null, 2));
});
