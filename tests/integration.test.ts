import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../lib/store';
import { Commerce } from '../lib/service';
import type { PaymentObject, Run, Scenario } from '../lib/types';
import { LocalPaymentProvider } from '../lib/payments';
import { DemoMerchant } from '../lib/merchants';
import { COOKIE, login, ownerFrom, sameOrigin } from '../lib/auth';
function setup(s = new Store(':memory:')) {
  const c = new Commerce(s, 'local'); let r = c.create('buyer', 'HK$1,800 以下耳機，官方保養'); r = c.quote(r.id, 'buyer', 'merchant_a'); r = c.approve(r.id, 'buyer', r.mandate!.id, r.mandate!.hash); return { s, c, id: r.id };
}
export async function drain(c: Commerce, id: string, limit = 200) {
  for (let i = 0; i < limit; i++) { if (c.get(id).stage === 'DONE') return c.get(id); const worked = await c.processOne(); if (!worked) await new Promise(r => setTimeout(r, 15)); }
  throw new Error(`Purchase did not settle: ${JSON.stringify(c.get(id))}`);
}
test('happy path: authorize, exact capture, confirmed merchant order, audit evidence', async () => {
  const { s, c, id } = setup(); c.commit(id, 'buyer'); const r = await drain(c, id);
  assert.equal(r.status, 'CONFIRMED'); assert.equal(r.paymentState, 'CAPTURED'); assert.equal(r.orderState, 'CONFIRMED');
  assert.ok(r.paymentId?.startsWith('local_pi_')); assert.ok(r.events?.some(e => e.reason.includes('requires_capture')));
  assert.equal(s.list<PaymentObject>('local_payment').length, 1); assert.equal(s.list('merchant_order').length, 1); s.close();
});
test('price drift blocks before payment, approved quote unchanged', async () => {
  const { s, c, id } = setup(); const hash = c.get(id).mandate!.hash; c.scenario(id, 'buyer', 'price_drift'); c.commit(id, 'buyer'); const r = await drain(c, id);
  assert.equal(r.status, 'BLOCKED'); assert.equal(r.paymentState, 'NOT_STARTED'); assert.equal(r.currentOffer?.totalMinor, 184900); assert.equal(r.mandate?.offer.totalMinor, 174900); assert.equal(r.mandate?.hash, hash); assert.equal(s.list('local_payment').length, 0); s.close();
});
test('Stripe demo cannot simulate provider capture or refund outcomes with local-only controls', () => {
  const s = new Store(':memory:'); const c = new Commerce(s, 'stripe');
  const r = c.create('buyer', 'HK$1,800 以下耳機，官方保養');
  for (const scenario of ['capture_timeout', 'refund_pending', 'refund_failed'] as Scenario[]) {
    assert.throws(() => c.scenario(r.id, 'buyer', scenario), /LOCAL TEST ADAPTER/);
    assert.equal(c.get(r.id).scenario, 'happy');
  }
  assert.equal(c.scenario(r.id, 'buyer', 'order_timeout').scenario, 'order_timeout');
  assert.equal(c.scenario(r.id, 'buyer', 'order_failure').scenario, 'order_failure');
  assert.equal(c.get(r.id).paymentState, 'NOT_STARTED'); s.close();
});
test('captured + known order failure creates exactly one retrieved refund', async () => {
  const { s, c, id } = setup(); c.scenario(id, 'buyer', 'order_failure'); c.commit(id, 'buyer'); const r = await drain(c, id);
  assert.equal(r.status, 'RECOVERED'); assert.equal(r.paymentState, 'CAPTURED'); assert.equal(r.orderState, 'FAILED'); assert.equal(r.recoveryState, 'REFUNDED'); assert.equal(r.refundState, 'succeeded'); assert.equal(s.list('local_refund').length, 1); s.close();
});
test('refund request success without retrieval stays reconciling and resumes the same refund', async t => {
  const { s, c, id } = setup();
  const original = LocalPaymentProvider.prototype.retrieveRefund;
  let lost = false;
  t.mock.method(LocalPaymentProvider.prototype, 'retrieveRefund', async function (this: LocalPaymentProvider, run: Run) {
    if (run.refundId && !lost) { lost = true; return undefined; }
    return original.call(this, run);
  });
  c.scenario(id, 'buyer', 'order_failure'); c.commit(id, 'buyer');
  for (let i = 0; i < 5; i++) await c.processOne();
  const unknown = c.get(id);
  assert.equal(unknown.recoveryState, 'RECONCILING'); assert.ok(unknown.refundId);
  assert.notEqual(unknown.recoveryState, 'REFUNDED'); assert.equal(unknown.refundState, undefined);
  const done = await drain(c, id);
  assert.equal(done.recoveryState, 'REFUNDED'); assert.equal(done.refundId, unknown.refundId);
  assert.equal(s.list('local_refund').length, 1); s.close();
});
test('double click / concurrent duplicate commits do not create duplicate charges', async () => {
  const { s, c, id } = setup(); await Promise.all(Array.from({ length: 20 }, async () => c.commit(id, 'buyer'))); await drain(c, id); c.commit(id, 'buyer'); await c.processOne(); assert.equal(s.list('local_payment').length, 1); assert.equal(s.list('merchant_order').length, 1); s.close();
});
for (const scenario of ['capture_timeout', 'order_timeout'] as Scenario[]) {
  test(`${scenario}: UNKNOWN -> retrieve same object -> success without extra charge/refund`, async () => {
    const { s, c, id } = setup(); c.scenario(id, 'buyer', scenario); c.commit(id, 'buyer'); const r = await drain(c, id);
    assert.equal(r.status, 'CONFIRMED'); assert.ok(r.events?.some(e => e.newState.includes('UNKNOWN'))); assert.equal(s.list('local_payment').length, 1); assert.equal(s.list('merchant_order').length, 1); assert.equal(s.list('local_refund').length, 0); s.close();
  });
}
test('duplicate and late webhook cannot repeat transitions or regress final payment', async () => {
  const { s, c, id } = setup(); c.commit(id, 'buyer'); await drain(c, id); const before = c.get(id).events!.length;
  assert.equal(c.webhook('evt_one', id), true); assert.equal(c.webhook('evt_one', id), false); c.webhook('evt_old_authorization', id); await c.processOne();
  assert.equal(c.get(id).paymentState, 'CAPTURED'); assert.equal(c.get(id).events!.length, before + 2); assert.equal(s.list('local_payment').length, 1); s.close();
});
test('owner isolation applies to read, quote, approval, scenario, commit', () => {
  const { s, c, id } = setup(); const m = c.get(id).mandate!;
  for (const action of [() => c.get(id, 'other'), () => c.quote(id, 'other', 'merchant_a'), () => c.approve(id, 'other', m.id, m.hash), () => c.scenario(id, 'other', 'price_drift'), () => c.commit(id, 'other')]) assert.throws(action, /another demo account/);
  assert.equal(s.list('local_payment').length, 0); s.close();
});
test('expired approval releases existing authorization before capture', async () => {
  const { s, c, id } = setup(); c.commit(id, 'buyer'); await c.processOne(); await c.processOne();
  const r = s.get<Run>('run', id)!; r.approval!.revokedAt = new Date().toISOString(); s.put('run', id, r); const done = await drain(c, id);
  assert.equal(done.status, 'BLOCKED'); assert.equal(done.paymentState, 'CANCELED'); assert.equal(s.list('merchant_order').length, 0); s.close();
});
test('revoked approval reconciles an already-canceled provider hold as CANCELED', async () => {
  const { s, c, id } = setup(); c.commit(id, 'buyer'); await c.processOne(); await c.processOne();
  const pending = s.get<Run>('run', id)!;
  // Resume a persisted pre-capture WAIT_AUTH checkpoint, as in Hosted Checkout.
  pending.stage = 'WAIT_AUTH'; pending.status = 'WAITING_PAYMENT'; s.put('run', id, pending);
  await new LocalPaymentProvider(s).cancel(pending); c.revoke(id, 'buyer');
  const done = await drain(c, id);
  assert.equal(done.status, 'BLOCKED'); assert.equal(done.paymentState, 'CANCELED');
  assert.equal(s.list('merchant_order').length, 0); s.close();
});
test('capture discovered while blocking preserves CAPTURED and needs operator, never NOT EXECUTED', async () => {
  const { s, c, id } = setup(); c.commit(id, 'buyer'); await c.processOne(); await c.processOne();
  const pending = s.get<Run>('run', id)!; await new LocalPaymentProvider(s).capture(pending);
  pending.stage = 'WAIT_AUTH'; pending.status = 'WAITING_PAYMENT'; s.put('run', id, pending); c.revoke(id, 'buyer');
  const done = await drain(c, id);
  assert.equal(done.status, 'NEEDS_OPERATOR'); assert.equal(done.paymentState, 'CAPTURED');
  assert.equal(done.providerState, 'succeeded'); assert.equal(s.list('local_refund').length, 0);
  assert.equal(s.list('local_payment').length, 1); s.close();
});
test('pending refund stays pending and never becomes fake REFUNDED', async () => {
  const { s, c, id } = setup(); c.scenario(id, 'buyer', 'refund_pending'); c.commit(id, 'buyer'); for (let i = 0; i < 5; i++) await c.processOne();
  const r = c.get(id); assert.equal(r.orderState, 'FAILED'); assert.equal(r.refundState, 'pending'); assert.equal(r.recoveryState, 'PENDING'); assert.equal(s.list('local_refund').length, 1); s.close();
});
test('failed refund needs operator and never shows purchase success', async () => {
  const { s, c, id } = setup(); c.scenario(id, 'buyer', 'refund_failed'); c.commit(id, 'buyer'); const r = await drain(c, id); assert.equal(r.status, 'NEEDS_OPERATOR'); assert.equal(r.refundState, 'failed'); assert.notEqual(r.status, 'CONFIRMED'); s.close();
});
test('database reopen recovers capture response lost before app state persisted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crosscart-restart-')); const path = join(dir, 'test.sqlite');
  let store = new Store(path); const initial = setup(store); let c = initial.c; const id = initial.id; c.commit(id, 'buyer'); await c.processOne(); await c.processOne();
  await new LocalPaymentProvider(store).capture(c.get(id)); store.close();
  store = new Store(path); c = new Commerce(store, 'local'); const done = await drain(c, id); assert.equal(done.status, 'CONFIRMED'); assert.equal(store.list('local_payment').length, 1); assert.equal(store.list('merchant_order').length, 1); store.close(); rmSync(dir, { recursive: true });
});
test('database reopen retrieves an already-created merchant order instead of creating again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'crosscart-order-')); const path = join(dir, 'test.sqlite'); let s = new Store(path); const initial = setup(s); let c = initial.c; const id = initial.id;
  c.commit(id, 'buyer'); await c.processOne(); await c.processOne(); await c.processOne(); await new DemoMerchant(s).createOrder(c.get(id), `${id}:order`); s.close();
  s = new Store(path); c = new Commerce(s, 'local'); assert.equal((await drain(c, id)).status, 'CONFIRMED'); assert.equal(s.list('merchant_order').length, 1); s.close(); rmSync(dir, { recursive: true });
});
test('hash/amount tampering in persisted mandate cannot execute a payment', async () => {
  const { s, c, id } = setup(); const r = s.get<Run>('run', id)!; r.mandate!.offer.totalMinor = 1; s.put('run', id, r); c.commit(id, 'buyer'); assert.equal((await drain(c, id)).status, 'BLOCKED'); assert.equal(s.list('local_payment').length, 0); s.close();
});
test('demo session token is opaque, persists, and forged token is rejected', () => {
  const { s } = setup(); const token = login(s, 'demo-buyer', 'crosscart-demo'); assert.equal(ownerFrom(s, `${COOKIE}=${token}`), 'demo-buyer'); assert.throws(() => ownerFrom(s, `${COOKIE}=${'0'.repeat(64)}`)); s.close();
});
test('configured browser origin works despite internal localhost URL; attacker origin rejected', () => {
  assert.doesNotThrow(() => sameOrigin(new Request('http://localhost:3107/api/login', { method: 'POST', headers: { origin: 'http://127.0.0.1:3107', 'content-type': 'application/json' } })));
  assert.throws(() => sameOrigin(new Request('http://localhost:3107/api/login', { method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' } })), /Same-origin/);
});
