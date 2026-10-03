import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store';
import { Commerce } from '../lib/service';
import { LocalPaymentProvider } from '../lib/payments';
import { OperationUnknown, type Run } from '../lib/types';

function setup() {
  const store = new Store(':memory:'); const service = new Commerce(store, 'local');
  let r = service.create('buyer', 'HK$1,800 headphones, official warranty');
  r = service.quote(r.id, 'buyer', 'merchant_a'); service.approve(r.id, 'buyer', r.mandate!.id, r.mandate!.hash);
  return { store, service, id: r.id, mandate: r.mandate! };
}
async function next(service: Commerce) { await service.processOne(); }
test('withdrawn quote before Checkout/authorization blocks without payment creation', async () => {
  const { store, service, id, mandate } = setup(); service.demoControl(id, 'buyer', 'revoke_quote'); service.commit(id, 'buyer'); await next(service);
  const r = service.get(id); assert.equal(r.status, 'BLOCKED'); assert.equal(r.paymentState, 'NOT_STARTED'); assert.equal(store.list('local_payment').length, 0); assert.deepEqual(r.mandate, mandate); store.close();
});
test('merchant withdrawal after authorization cancels same hold, never captures or calls it a refund', async () => {
  const { store, service, id, mandate } = setup(); service.commit(id, 'buyer'); await next(service); await next(service);
  const paymentId = service.get(id).paymentId; service.demoControl(id, 'buyer', 'revoke_quote'); await next(service);
  const r = service.get(id); assert.equal(r.status, 'BLOCKED'); assert.equal(r.paymentState, 'CANCELED'); assert.equal(r.paymentId, paymentId); assert.equal(r.recoveryState, 'NONE'); assert.equal(store.list('local_refund').length, 0); assert.equal(store.list('merchant_order').length, 0); assert.deepEqual(r.mandate, mandate); store.close();
});
test('catalogue update preserves a verifiable accepted original quote and exact amount', async () => {
  const { store, service, id } = setup(); service.commit(id, 'buyer'); await next(service); await next(service);
  service.demoControl(id, 'buyer', 'catalogue_update'); await next(service);
  const r = service.get(id); assert.equal(r.paymentState, 'CAPTURED'); assert.equal(r.catalogueUpdate?.totalMinor, 184900); assert.equal(r.merchantQuote?.offer.totalMinor, 174900); assert.equal(r.merchantQuote?.state, 'ACTIVE'); assert.equal((await new LocalPaymentProvider(store).retrieve(r)).amountMinor, 174900); store.close();
});
test('expiry between authorization and capture cancels instead of capturing', async t => {
  const { store, service, id } = setup(); service.commit(id, 'buyer'); await next(service); await next(service);
  const r = store.get<Run>('run', id)!; t.mock.timers.enable({ apis: ['Date'], now: Date.parse(r.mandate!.expiresAt) + 1 }); await next(service);
  assert.equal(service.get(id).paymentState, 'CANCELED'); assert.equal(store.list('merchant_order').length, 0); store.close();
});
test('unknown provider state after authorization reconciles same payment before honoring quote withdrawal', async t => {
  const { store, service, id } = setup(); service.commit(id, 'buyer'); await next(service); await next(service); const originalId = service.get(id).paymentId;
  const retrieve = LocalPaymentProvider.prototype.retrieve; let lost = false;
  t.mock.method(LocalPaymentProvider.prototype, 'retrieve', async function (this: LocalPaymentProvider, run: Run) { if (!lost) { lost = true; throw new OperationUnknown(); } return retrieve.call(this, run); });
  service.demoControl(id, 'buyer', 'revoke_quote'); await next(service); assert.equal(service.get(id).paymentState, 'UNKNOWN'); assert.equal(service.get(id).recoveryState, 'RECONCILING');
  store.enqueue(id); await next(service); assert.equal(service.get(id).paymentState, 'CANCELED'); assert.equal(service.get(id).paymentId, originalId); assert.equal(store.list('local_payment').length, 1); assert.equal(store.list('local_refund').length, 0); store.close();
});
test('capture pause is a test control; resumed capture revalidates quote, and other owner is denied', async () => {
  const { store, service, id } = setup(); assert.throws(() => service.demoControl(id, 'other', 'hold_capture'), /another demo account/);
  service.demoControl(id, 'buyer', 'hold_capture'); service.commit(id, 'buyer'); await next(service); await next(service); await next(service); assert.equal(service.get(id).paymentState, 'AUTHORIZED');
  service.demoControl(id, 'buyer', 'revoke_quote'); service.demoControl(id, 'buyer', 'resume_capture'); await next(service); assert.equal(service.get(id).paymentState, 'CANCELED');
  service.commit(id, 'buyer'); await next(service); assert.equal(store.list('local_payment').length, 1); assert.equal(store.list('merchant_order').length, 0); store.close();
});
