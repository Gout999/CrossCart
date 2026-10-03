import Stripe from 'stripe';
import type { Store } from './store';
import type { PaymentObject, ProviderMode, RefundObject, Run } from './types';
import { AppError, OperationUnknown } from './types';

export interface PaymentProvider {
  mode: ProviderMode;
  authorize(run: Run, key: string): Promise<PaymentObject>;
  retrieve(run: Run): Promise<PaymentObject>;
  capture(run: Run, key: string): Promise<PaymentObject>;
  cancel(run: Run, key: string): Promise<PaymentObject>;
  refund(run: Run, key: string): Promise<RefundObject>;
  retrieveRefund(run: Run): Promise<RefundObject | undefined>;
}
export class LocalPaymentProvider implements PaymentProvider {
  mode = 'local' as const;
  constructor(private store: Store) {}
  async authorize(run: Run): Promise<PaymentObject> {
    const id = `local_pi_${run.id}`;
    const existing = this.store.get<PaymentObject>('local_payment', id);
    if (existing) return existing;
    const p: PaymentObject = { id, mode: 'local', status: 'requires_capture', amountMinor: run.mandate!.offer.totalMinor, currency: 'hkd', captureBefore: new Date(Date.now() + 86400000).toISOString() };
    this.store.insert('local_payment', id, p);
    return p;
  }
  async retrieve(run: Run) {
    const p = this.store.get<PaymentObject>('local_payment', run.paymentId || `local_pi_${run.id}`);
    if (!p) throw new OperationUnknown('Local operation is not known.');
    return p;
  }
  async capture(run: Run) {
    const p = await this.retrieve(run);
    if (p.status === 'succeeded') return p;
    if (p.status !== 'requires_capture' || p.amountMinor !== run.mandate!.offer.totalMinor) throw new AppError(409, 'Payment cannot be captured.');
    p.status = 'succeeded'; this.store.put('local_payment', p.id, p);
    if (run.scenario === 'capture_timeout') throw new OperationUnknown('Capture succeeded but its response was lost (LOCAL TEST).');
    return p;
  }
  async cancel(run: Run) {
    const p = await this.retrieve(run);
    if (p.status === 'succeeded') throw new AppError(409, 'Captured payment cannot be canceled.');
    p.status = 'canceled'; this.store.put('local_payment', p.id, p); return p;
  }
  async refund(run: Run) {
    const id = `local_refund_${run.id}`;
    const existing = this.store.get<RefundObject>('local_refund', id);
    if (existing) return existing;
    const p = await this.retrieve(run);
    if (p.status !== 'succeeded') throw new AppError(409, 'Cannot refund an unconfirmed capture.');
    const r: RefundObject = { id, paymentId: p.id, amountMinor: p.amountMinor, mode: 'local', status: run.scenario === 'refund_pending' ? 'pending' : run.scenario === 'refund_failed' ? 'failed' : 'succeeded' };
    this.store.insert('local_refund', id, r); return r;
  }
  async retrieveRefund(run: Run) { return this.store.get<RefundObject>('local_refund', run.refundId || `local_refund_${run.id}`); }
}
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_test_/.test(key)) throw new AppError(503, 'Stripe TEST secret key required. Live keys are rejected.');
  // SDK 23 can retry a closed connection once even with retries disabled.
  // Up to seven calls with webhook/refund retrieval fit within the 90s job lease.
  return new Stripe(key, { timeout: 4000, maxNetworkRetries: 0 });
}
function binding(run: Run) {
  if (run.providerMode !== 'stripe' || !run.mandate) throw new AppError(409, 'Stripe operation requires a Stripe purchase mandate.');
  return { run_id: run.id, mandate_id: run.mandate.id, mandate_hash: run.mandate.hash, payee_id: run.mandate.offer.payee };
}
function checkBinding(metadata: Stripe.Metadata | null | undefined, run: Run) {
  if (Object.entries(binding(run)).some(([key, value]) => metadata?.[key] !== value)) throw new AppError(409, 'Provider object does not match this exact purchase mandate.');
}
function mapPayment(p: Stripe.PaymentIntent, run: Run, expectedId: string): PaymentObject {
  if (p.livemode) throw new AppError(409, 'Live provider objects are not allowed.');
  checkBinding(p.metadata, run);
  const offer = run.mandate!.offer;
  if (p.id !== expectedId || p.amount !== offer.totalMinor || p.currency !== offer.currency || p.capture_method !== 'manual') throw new AppError(409, 'Provider payment reference, amount, currency or capture method mismatch.');
  if (p.transfer_data || p.on_behalf_of || p.application_fee_amount) throw new AppError(409, 'Unexpected payment routing. This demo uses the exact approved test account.');
  if (p.status === 'requires_capture' && p.amount_capturable !== offer.totalMinor || p.status === 'succeeded' && p.amount_received !== offer.totalMinor) throw new AppError(409, 'Provider did not authorize or capture the exact approved total.');
  const charge = typeof p.latest_charge === 'object' ? p.latest_charge : undefined;
  const captureBefore = charge?.payment_method_details?.card?.capture_before;
  return { id: p.id, mode: 'stripe', amountMinor: p.amount, currency: p.currency,
    status: p.status === 'requires_capture' ? 'requires_capture' : p.status === 'succeeded' ? 'succeeded' : p.status === 'canceled' ? 'canceled' : 'requires_action',
    ...(captureBefore ? { captureBefore: new Date(captureBefore * 1000).toISOString() } : {}) };
}
function mapRefund(r: Stripe.Refund, run: Run): RefundObject {
  checkBinding(r.metadata, run);
  const paymentId = typeof r.payment_intent === 'string' ? r.payment_intent : r.payment_intent?.id || '';
  if (paymentId !== run.paymentId || r.amount !== run.mandate!.offer.totalMinor || r.currency !== run.mandate!.offer.currency || r.metadata?.operation_id !== `${run.id}:refund`) throw new AppError(409, 'Provider refund does not match the same approved payment and recovery operation.');
  const known = ['pending', 'requires_action', 'succeeded', 'failed', 'canceled'];
  const status = known.includes(r.status || '') ? r.status as RefundObject['status'] : 'requires_action';
  return { id: r.id, paymentId, amountMinor: r.amount, mode: 'stripe', status };
}
export class StripePaymentProvider implements PaymentProvider {
  mode = 'stripe' as const;
  private account?: Promise<string>;
  constructor(private client: Stripe = stripeClient()) {}
  accountId(): Promise<string> {
    return this.account ??= this.client.accounts.retrieveCurrent().then(account => {
      if (!/^acct_[A-Za-z0-9]+$/.test(account.id)) throw new AppError(409, 'Stripe test account reference could not be verified.');
      return account.id;
    });
  }
  private async checkAccount(run: Run) {
    binding(run);
    if (await this.accountId() !== run.mandate!.offer.payee) throw new AppError(409, 'Configured Stripe account differs from the approved test payee. Fresh consent required.');
  }
  private checkSession(session: Stripe.Checkout.Session, run: Run, expectedId?: string) {
    if (session.livemode) throw new AppError(409, 'Live Checkout is rejected.');
    checkBinding(session.metadata, run);
    if (expectedId && session.id !== expectedId || session.client_reference_id !== run.id || session.amount_total !== run.mandate!.offer.totalMinor || session.currency !== run.mandate!.offer.currency || session.mode !== 'payment') throw new AppError(409, 'Checkout reference or exact offer mismatch.');
    if (session.url) {
      const url = new URL(session.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new AppError(409, 'Unexpected hosted checkout address.');
    }
  }
  async authorize(run: Run, key: string) {
    await this.checkAccount(run);
    const offer = run.mandate!.offer;
    const base = process.env.APP_URL || 'http://127.0.0.1:3107';
    const session = await this.client.checkout.sessions.create({
      mode: 'payment', allowed_payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'hkd', unit_amount: offer.totalMinor, product_data: { name: `${offer.productName} · DEMO MERCHANT ${offer.merchantName}`, description: 'Synthetic product. TEST MODE. Total includes delivery.' } }, quantity: 1 }],
      client_reference_id: run.id, metadata: binding(run),
      payment_intent_data: { capture_method: 'manual', metadata: binding(run) },
      success_url: `${base}/?run=${run.id}`, cancel_url: `${base}/?run=${run.id}`
    }, { idempotencyKey: key });
    this.checkSession(session, run);
    return { id: '', sessionId: session.id, checkoutUrl: session.url || undefined, mode: 'stripe' as const, status: 'requires_action' as const, amountMinor: offer.totalMinor, currency: 'hkd' };
  }
  async retrieve(run: Run) {
    await this.checkAccount(run);
    let id = run.paymentId;
    if (!id && run.sessionId) {
      const session = await this.client.checkout.sessions.retrieve(run.sessionId);
      this.checkSession(session, run, run.sessionId);
      id = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!id && session.status === 'complete') throw new OperationUnknown('Completed Checkout has no recoverable payment reference yet.');
      if (!id) return { id: '', sessionId: session.id, checkoutUrl: session.url || undefined, mode: 'stripe' as const, status: session.status === 'expired' ? 'canceled' as const : 'requires_action' as const, amountMinor: run.mandate!.offer.totalMinor, currency: 'hkd' };
    }
    if (!id) throw new OperationUnknown('Provider reference has not yet been recovered.');
    return { ...mapPayment(await this.client.paymentIntents.retrieve(id, { expand: ['latest_charge'] }), run, id), sessionId: run.sessionId, checkoutUrl: run.checkoutUrl };
  }
  async capture(run: Run, key: string) {
    await this.checkAccount(run);
    if (!run.paymentId) throw new OperationUnknown('Same payment reference required before capture.');
    return mapPayment(await this.client.paymentIntents.capture(run.paymentId, { amount_to_capture: run.mandate!.offer.totalMinor }, { idempotencyKey: key }), run, run.paymentId);
  }
  async cancel(run: Run, key: string) {
    await this.checkAccount(run);
    if (!run.paymentId && run.sessionId) {
      const session = await this.client.checkout.sessions.expire(run.sessionId, {}, { idempotencyKey: key });
      this.checkSession(session, run, run.sessionId);
      if (session.status !== 'expired') throw new OperationUnknown('Checkout cancellation is not yet confirmed.');
      return { id: '', mode: 'stripe' as const, status: 'canceled' as const, currency: 'hkd', amountMinor: run.mandate!.offer.totalMinor };
    }
    if (!run.paymentId) throw new OperationUnknown('Same payment reference required before cancel.');
    const payment = mapPayment(await this.client.paymentIntents.cancel(run.paymentId, {}, { idempotencyKey: key }), run, run.paymentId);
    if (payment.status !== 'canceled') throw new OperationUnknown('Payment cancellation is not yet confirmed.');
    return payment;
  }
  async refund(run: Run, key: string) {
    await this.checkAccount(run);
    if (!run.paymentId) throw new OperationUnknown('Same confirmed payment reference required before refund.');
    return mapRefund(await this.client.refunds.create({ payment_intent: run.paymentId, amount: run.mandate!.offer.totalMinor, metadata: { ...binding(run), operation_id: `${run.id}:refund` } }, { idempotencyKey: key }), run);
  }
  async retrieveRefund(run: Run) {
    await this.checkAccount(run);
    if (run.refundId) {
      const refund = await this.client.refunds.retrieve(run.refundId);
      if (refund.id !== run.refundId) throw new AppError(409, 'Provider returned a different refund reference.');
      return mapRefund(refund, run);
    }
    if (!run.paymentId) return;
    const list = await this.client.refunds.list({ payment_intent: run.paymentId, limit: 100 });
    const r = list.data.find(r => r.metadata?.operation_id === `${run.id}:refund`);
    if (!r && list.has_more) throw new OperationUnknown('Refund lookup is incomplete. Do not create a replacement refund.');
    return r ? mapRefund(r, run) : undefined;
  }
}
export function providerFor(store: Store, mode: ProviderMode): PaymentProvider { return mode === 'stripe' ? new StripePaymentProvider() : new LocalPaymentProvider(store); }
export function configuredProvider(): ProviderMode {
  const mode = process.env.PAYMENT_PROVIDER || 'local';
  if (!['local', 'stripe'].includes(mode)) throw new AppError(503, 'PAYMENT_PROVIDER must be local or stripe.');
  if (mode === 'stripe') stripeClient();
  return mode as ProviderMode;
}
