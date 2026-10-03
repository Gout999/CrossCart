import { test, expect } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { Store } from '../../lib/store';
import { stripeClient } from '../../lib/payments';
import type { Run } from '../../lib/types';

// Explicit task-owned PIDs are mandatory; never discover and kill a broad set.
const output = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence/2026-10-03-completion-audit';
const origin = new URL(process.env.APP_URL || 'http://127.0.0.1:3107').origin;
function live(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
function command(pid: number) { return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim(); }
function parent(pid: number) { return Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim()); }
function validateOwnedProcess() {
  const main = Number(process.env.CROSSCART_RESTART_MAIN_PID), worker = Number(process.env.CROSSCART_RESTART_WORKER_PID);
  expect(Number.isSafeInteger(main) && main > 1).toBe(true); expect(Number.isSafeInteger(worker) && worker > 1).toBe(true);
  expect(origin).toBe('http://127.0.0.1:3107'); expect(command(main)).toContain('scripts/serve.mjs start');
  expect(command(worker)).toContain('scripts/worker.ts'); expect(parent(worker)).toBe(main);
  const cwd = execFileSync('lsof', ['-p', String(main), '-a', '-d', 'cwd', '-Fn'], { encoding: 'utf8' }); expect(cwd).toContain(`n${process.cwd()}\n`);
  const app = Number(execFileSync('lsof', ['-t', '-nP', '-iTCP:3107', '-sTCP:LISTEN'], { encoding: 'utf8' }).trim()); expect(parent(app)).toBe(main);
  return { main, worker };
}

test('official pending Checkout events survive forced app/worker restart and finish one approved purchase', async ({ page }) => {
  const old = validateOwnedProcess(); mkdirSync(output, { recursive: true }); const store = new Store();
  expect(store.db.prepare('SELECT COUNT(*) n FROM jobs').get()!.n).toBe(0);
  const existing = store.list<Run>('run').filter(r => ['CONFIRMED', 'RECOVERED', 'BLOCKED'].includes(r.status)).map(r => ({ id: r.id, status: r.status, paymentId: r.paymentId, orderId: r.orderId, refundId: r.refundId, mandate: r.mandate, approval: r.approval }));
  let frozen = false, oldTerminated = false, replacement: ChildProcess | undefined;
  const startReplacement = () => {
    const fd = openSync(`${output}/pending-restart-server.log`, 'a', 0o600);
    const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'scripts/serve.mjs', 'start'], { detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, NODE_ENV: 'production' } }); closeSync(fd); child.unref();
    writeFileSync(`${output}/runtime-after-restart.json`, JSON.stringify({ mainPid: child.pid, origin, startedAt: new Date().toISOString() }, null, 2)); return child;
  };
  try {
    await page.goto('/'); await page.getByRole('button', { name: 'Enter demo', exact: true }).click();
    await page.getByRole('button', { name: 'Understand request' }).click(); await page.getByRole('button', { name: 'Compare demo merchants' }).click();
    await page.getByRole('button', { name: 'Choose Merchant A' }).click(); await page.getByRole('button', { name: 'Approve exact' }).click();
    await expect(page.getByRole('heading', { name: 'This exact purchase is approved.' })).toBeVisible();
    const id = new URL(page.url()).searchParams.get('run')!;
    const get = async () => await (await page.request.get(`/api/runs/${id}`)).json() as Run;
    const approval = await get(); expect(approval.providerMode).toBe('stripe'); expect(approval.mandate!.offer.totalMinor).toBe(174900);
    const shopping = await (await page.request.get(`/api/shopping/${approval.shoppingId}`)).json(); expect(shopping.parseMode).toBe('live-ai'); expect(shopping.comparisonMode).toBe('live-ai');
    await page.getByRole('button', { name: 'Continue to Stripe test authorization' }).click(); await page.getByRole('link', { name: 'Open Stripe hosted test checkout' }).click(); await expect(page.locator('#cardNumber')).toBeVisible();
    await expect.poll(async () => (await get()).stage).toBe('WAIT_AUTH');
    await expect.poll(() => store.db.prepare('SELECT lease_until FROM jobs WHERE run_id=?').get(id)?.lease_until).toBe(0);
    process.kill(old.worker, 'SIGSTOP'); frozen = true;
    expect(store.db.prepare('SELECT lease_until FROM jobs WHERE run_id=?').get(id)!.lease_until).toBe(0);
    let successReturnBlocked = false;
    await page.route(`${origin}/?run=**`, async route => { successReturnBlocked = true; await route.abort('blockedbyclient'); });
    await page.locator('#email').fill('crosscart-demo@example.com'); await page.locator('#cardNumber').fill('4242424242424242'); await page.locator('#cardExpiry').fill('1234'); await page.locator('#cardCvc').fill('123'); await page.locator('#billingName').fill('CrossCart Demo Buyer'); await page.locator('#billingCountry').selectOption('HK'); if (await page.locator('#enableStripePass').isVisible()) await page.locator('#enableStripePass').uncheck(); await page.locator('button[type="submit"]').click();
    await expect.poll(async () => (await get()).webhookReceipts?.filter(r => r.id.startsWith('evt_') && r.status === 'PENDING').length || 0).toBeGreaterThanOrEqual(2);
    await expect.poll(() => successReturnBlocked).toBe(true);
    const pending = await get(); const stripe = stripeClient(); const session = await stripe.checkout.sessions.retrieve(pending.sessionId!);
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent!.id;
    const before = await stripe.paymentIntents.retrieve(pi); expect(before.status).toBe('requires_capture'); expect(before.amount_received).toBe(0); expect(before.capture_method).toBe('manual'); expect(before.livemode).toBe(false);
    expect(pending.orderState).toBe('NOT_CREATED'); expect(pending.webhookReceipts!.every(r => r.status === 'PENDING')).toBe(true);
    const { checkoutUrl: _ephemeralUrl, ...safePending } = pending; void _ephemeralUrl;
    writeFileSync(`${output}/official-pending-before-restart.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Actual CLI-delivered official events before actual process restart; worker intentionally paused after its WAIT_AUTH read-only stage', process: old, run: safePending, provider: { id: pi, status: before.status, receivedMinor: before.amount_received }, successReturnBlocked, liveShopping: shopping }, null, 2));
    // No capture request is in flight: worker is stopped in WAIT_AUTH, and the
    // authoritatively retrieved PI is still requires_capture with received=0.
    process.kill(old.main, 'SIGTERM'); process.kill(old.worker, 'SIGKILL'); frozen = false; oldTerminated = true;
    await expect.poll(() => live(old.main)).toBe(false); await expect.poll(() => live(old.worker)).toBe(false);
    replacement = startReplacement();
    await expect.poll(async () => { try { return (await page.request.get('/')).status(); } catch { return 0; } }).toBe(200);
    await expect.poll(async () => (await get()).status).toBe('CONFIRMED');
    await expect.poll(async () => (await get()).webhookReceipts?.filter(r => r.status === 'PENDING').length).toBe(0);
    const final = await get(); expect(final.paymentId).toBe(pi); expect(final.mandate).toEqual(approval.mandate); expect(final.approval).toEqual(approval.approval); expect(final.paymentState).toBe('CAPTURED'); expect(final.orderState).toBe('CONFIRMED'); expect(final.refundId).toBeUndefined();
    expect(store.list<{runId: string}>('merchant_order').filter(o => o.runId === id)).toHaveLength(1); expect(store.events(id).filter(e => e.reason.startsWith('Capture claimed'))).toHaveLength(1);
    for (const r of pending.webhookReceipts!) expect(final.webhookReceipts!.find(e => e.id === r.id)?.status).toBe('HANDLED');
    const payment = await stripe.paymentIntents.retrieve(pi); expect(payment.status).toBe('succeeded'); expect(payment.amount_received).toBe(174900);
    const events = [];
    for (const receipt of final.webhookReceipts!) { const e = await stripe.events.retrieve(receipt.id); const o = e.data.object as unknown as { id: string; metadata: Record<string,string> }; expect(e.livemode).toBe(false); expect(o.metadata.run_id).toBe(id); expect(o.metadata.mandate_hash).toBe(final.mandate!.hash); events.push({ eventId: e.id, type: e.type, objectId: o.id, receipt }); }
    for (const saved of existing) { const r = store.get<Run>('run', saved.id)!; expect({ id: r.id, status: r.status, paymentId: r.paymentId, orderId: r.orderId, refundId: r.refundId, mandate: r.mandate, approval: r.approval }).toEqual(saved); }
    const duplicate = await page.request.post(`/api/runs/${id}/commit`, { headers: { Origin: origin }, data: {} }); expect(duplicate.status()).toBe(200); expect((await duplicate.json()).paymentId).toBe(pi);
    const { checkoutUrl: _url, ...safeFinal } = final; void _url;
    writeFileSync(`${output}/official-pending-after-restart.json`, JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Official pending receipts survive forced process replacement and resume via the existing worker; no SDK-generated webhook signature used', replacementMainPid: replacement.pid, run: safeFinal, provider: { id: pi, status: payment.status, receivedMinor: payment.amount_received, livemode: payment.livemode }, events, existingSettledPurchasesPreserved: existing.length, captureClaims: 1, merchantOrders: 1, successReturnBlocked, duplicateCommitSamePayment: true }, null, 2));
    await page.unroute(`${origin}/?run=**`); await page.goto(`/?run=${id}`); await expect(page.getByRole('heading', { name: 'Purchase confirmed.', exact: true })).toBeVisible(); await page.screenshot({ path: `${output}/pending-restart-result.png`, fullPage: true });
  } finally {
    if (frozen && live(old.worker)) process.kill(old.worker, 'SIGCONT');
    if (oldTerminated && (!replacement || !live(replacement.pid!))) startReplacement();
    store.close();
  }
});
