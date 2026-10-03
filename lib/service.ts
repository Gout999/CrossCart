import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import { AppError, OperationUnknown } from './types';
import type { DemoControl, Intent, Mandate, Offer, PaymentObject, ProviderMode, Run, Scenario, RefundObject, WebhookReceipt } from './types';
import { catalogue, DemoMerchant } from './merchants';
import { mandateHash, parseIntent, reasons, validateMandate } from './policy';
import { configuredProvider, providerFor } from './payments';
import type { PaymentProvider } from './payments';

export class Commerce {
  constructor(readonly store: Store, private mode?: ProviderMode) {}
  get(id: string, owner?: string): Run {
    const run = this.store.get<Run>('run', id);
    if (!run) throw new AppError(404, 'Purchase not found.');
    if (owner && run.ownerId !== owner) throw new AppError(403, 'This purchase belongs to another demo account.');
    return { ...run, events: this.store.events(id), merchantQuote: new DemoMerchant(this.store).quote(run), catalogueUpdate: this.store.get<Offer>('catalogue_update', id), demoCaptureHold: this.store.get<boolean>('capture_hold', id) || false, webhookReceipts: this.store.list<WebhookReceipt>('stripe_webhook').filter(e => e.runId === id) };
  }
  list(owner: string) { return this.store.list<Run>('run').filter(r => r.ownerId === owner).slice(0, 15); }
  change(id: string, fn: (r: Run) => void, reason: string, source = 'coordinator', ref?: string) {
    return this.store.atomic(() => {
      const r = this.store.get<Run>('run', id)!;
      fn(r); this.store.save(r, reason, source, ref); return r;
    });
  }
  create(owner: string, text: string, fields?: Partial<Intent>, parsed?: Intent, shopping?: { id: string; version: number; parentRunId?: string }) {
    const run: Run = { id: randomUUID(), ownerId: owner, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), providerMode: this.mode || configuredProvider(), intent: parsed || parseIntent(text, fields), scenario: 'happy', status: 'COMPARING', stage: 'VALIDATE', paymentState: 'NOT_STARTED', orderState: 'NOT_CREATED', recoveryState: 'NONE', reconcileAttempts: 0 };
    let id = run.id;
    this.store.atomic(() => {
      if (shopping) {
        const record = this.store.get<{ ownerId: string; confirmed?: Intent; purchaseRunId?: string }>('shopping', shopping.id);
        if (!record || record.ownerId !== owner || !record.confirmed) throw new AppError(409, 'Confirm your shopping interpretation before creating a purchase run.');
        if (record.purchaseRunId) { id = record.purchaseRunId; return; }
        run.shoppingId = shopping.id; run.shoppingVersion = shopping.version; run.previousRunId = shopping.parentRunId;
        record.purchaseRunId = run.id; this.store.put('shopping', shopping.id, record);
      }
      this.store.save(run, 'Shopping intent saved. No payment authority exists.', 'buyer');
    });
    return this.get(id, owner);
  }
  offers(id: string, owner: string) {
    const r = this.get(id, owner), ranking = r.intent.rankedMerchantIds || [];
    return catalogue().map(offer => ({ ...offer, failures: reasons(offer, r.intent) })).sort((a, b) => {
      if (!!a.failures.length !== !!b.failures.length) return a.failures.length ? 1 : -1;
      const ar = ranking.indexOf(a.merchantId), br = ranking.indexOf(b.merchantId);
      return (ar < 0 ? 99 : ar) - (br < 0 ? 99 : br) || a.totalMinor - b.totalMinor;
    });
  }
  quote(id: string, owner: string, merchantId: string, stripeAccountId?: string) {
    this.get(id, owner);
    this.store.atomic(() => {
      const run = this.store.get<Run>('run', id)!;
      if (!['COMPARING', 'QUOTED'].includes(run.status)) throw new AppError(409, 'Start a new purchase to change an approved quote.');
      const offer = catalogue().find(o => o.merchantId === merchantId);
      if (!offer || reasons(offer, run.intent).length) throw new AppError(409, 'Offer does not meet your confirmed constraints.');
      if (run.providerMode === 'stripe') {
        if (!stripeAccountId || !/^acct_[A-Za-z0-9]+$/.test(stripeAccountId)) throw new AppError(503, 'Retrieve the actual Stripe test payee before requesting purchase approval.');
        offer.payee = stripeAccountId;
      }
      const m: Mandate = { id: randomUUID(), version: (run.mandate?.version || 0) + 1, ownerId: owner, agentId: 'crosscart-demo-agent', offer, expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), hash: '' };
      m.hash = mandateHash(m); this.store.insert('mandate', m.id, m);
      new DemoMerchant(this.store).acceptQuote(m);
      run.mandate = m; run.status = 'QUOTED';
      this.store.save(run, 'Immutable exact purchase mandate created. Search budget is not payment authority.', 'policy');
    });
    return this.get(id, owner);
  }
  approve(id: string, owner: string, mandateId: string, hash: string) {
    this.get(id, owner);
    this.store.atomic(() => {
      const run = this.store.get<Run>('run', id)!;
      if (run.status === 'APPROVED' && run.approval?.hash === hash && !run.approval.revokedAt) return;
      if (run.status !== 'QUOTED' || run.mandate?.id !== mandateId || run.mandate.hash !== hash || run.mandate.hash !== mandateHash(run.mandate)) throw new AppError(409, 'Approval must match the current exact mandate.');
      if (Date.parse(run.mandate.expiresAt) <= Date.now()) throw new AppError(409, 'Mandate expired. Create a fresh purchase.');
      run.approval = { mandateId, hash, actor: owner, approvedAt: new Date().toISOString() }; run.status = 'APPROVED';
      this.store.save(run, `Buyer explicitly approved ${run.mandate.offer.totalMinor} HKD minor units.`, 'buyer');
    });
    return this.get(id, owner);
  }
  commit(id: string, owner: string) {
    this.get(id, owner);
    this.store.atomic(() => {
      const run = this.store.get<Run>('run', id)!;
      if (['PROCESSING', 'WAITING_PAYMENT', 'CONFIRMED', 'RECOVERING', 'RECOVERED', 'NEEDS_OPERATOR', 'BLOCKED'].includes(run.status)) return;
      if (run.status !== 'APPROVED' || !run.approval) throw new AppError(409, 'Explicit approval required.');
      run.status = 'PROCESSING'; run.stage = 'VALIDATE'; run.operationStartedAt = new Date().toISOString();
      this.store.save(run, 'One purchase operation queued with stable idempotency keys.', 'buyer'); this.store.enqueue(id);
    });
    return this.get(id, owner);
  }
  scenario(id: string, owner: string, scenario: Scenario) {
    const allowed: Scenario[] = ['happy', 'price_drift', 'order_failure', 'capture_timeout', 'order_timeout', 'refund_pending', 'refund_failed'];
    if (!allowed.includes(scenario)) throw new AppError(400, 'Unknown demo scenario.');
    this.get(id, owner);
    this.change(id, r => {
      if (!['COMPARING', 'QUOTED', 'APPROVED'].includes(r.status)) throw new AppError(409, 'Fault scenario is fixed once execution begins.');
      if (r.providerMode === 'stripe' && ['capture_timeout', 'refund_pending', 'refund_failed'].includes(scenario)) throw new AppError(400, 'This payment fault is available only in the LOCAL TEST ADAPTER. Stripe outcomes come from the provider.');
      r.scenario = scenario;
    }, `Injected controlled demo scenario: ${scenario}.`, 'demo-console');
    return this.get(id, owner);
  }
  revoke(id: string, owner: string) {
    this.get(id, owner);
    this.store.atomic(() => {
      const run = this.store.get<Run>('run', id)!;
      if (!run.approval || ['CAPTURE', 'ORDER', 'REFUND', 'DONE'].includes(run.stage) && run.status !== 'APPROVED') throw new AppError(409, 'Execution already claimed. Cancellation cannot guarantee stopping an in-flight capture.');
      run.approval.revokedAt = new Date().toISOString();
      this.store.save(run, 'Buyer revoked approval before capture was claimed.', 'buyer');
      run.status = 'PROCESSING'; run.stage = 'VALIDATE'; this.store.put('run', id, run); this.store.enqueue(id);
    }); return this.get(id, owner);
  }
  demoControl(id: string, owner: string, action: DemoControl) {
    this.get(id, owner);
    if (process.env.ENABLE_DEMO_FAULTS === 'false') throw new AppError(403, 'Demo fault controls are disabled.');
    if (!['hold_capture', 'resume_capture', 'revoke_quote', 'catalogue_update'].includes(action)) throw new AppError(400, 'Unknown demo control.');
    return this.store.atomic(() => {
      const run = this.get(id, owner);
      if (!run.mandate || !['QUOTED', 'APPROVED', 'PROCESSING', 'WAITING_PAYMENT'].includes(run.status) || ['CAPTURING', 'CAPTURED'].includes(run.paymentState)) throw new AppError(409, 'Demo control must precede the capture claim. No in-flight capture cancellation is promised.');
      if (action === 'hold_capture' || action === 'resume_capture') this.store.put('capture_hold', id, action === 'hold_capture');
      if (action === 'revoke_quote') {
        const q = new DemoMerchant(this.store).quote(run);
        if (!q) throw new AppError(409, 'No accepted merchant quote.');
        this.store.put('merchant_quote', q.mandateId, { ...q, state: 'REVOKED', reason: 'Intentional DEMO merchant withdrawal of the original conditions.' });
      }
      if (action === 'catalogue_update') {
        const offer = structuredClone(run.mandate.offer); offer.subtotalMinor += 10000; offer.totalMinor += 10000; offer.version += 1; offer.offerId += '_catalogue_v2';
        this.store.put('catalogue_update', id, offer); // Original accepted quote remains ACTIVE; a catalogue update alone does not revoke it.
      }
      this.store.event(run, run.status, `Intentional DEMO control: ${action}. Original mandate unchanged.`, 'demo-console');
      if (run.operationStartedAt) this.store.enqueue(id);
      return this.get(id, owner);
    });
  }
  private payment(id: string, p: PaymentObject, stage?: Run['stage']) {
    this.change(id, r => {
      if (p.amountMinor !== r.mandate!.offer.totalMinor || p.currency !== r.mandate!.offer.currency || p.mode !== r.providerMode) throw new AppError(409, 'Provider amount/currency/mode mismatch.');
      if (p.id) r.paymentId = p.id;
      if (p.sessionId) r.sessionId = p.sessionId;
      if (p.checkoutUrl) r.checkoutUrl = p.checkoutUrl;
      r.providerState = p.status;
      r.paymentState = p.status === 'requires_capture' ? 'AUTHORIZED' : p.status === 'succeeded' ? 'CAPTURED' : p.status === 'canceled' ? 'CANCELED' : p.status === 'failed' ? 'FAILED' : 'AUTHORIZING';
      if (stage) r.stage = stage;
      if (p.status === 'requires_action') r.status = 'WAITING_PAYMENT';
      else if (p.status === 'canceled' || p.status === 'failed') { r.status = 'BLOCKED'; r.stage = 'DONE'; r.reason = 'Payment was canceled or declined. Start a fresh purchase.'; }
      else r.status = 'PROCESSING';
      r.recoveryState = 'NONE'; r.reconcileAttempts = 0;
    }, `Authoritative ${p.mode === 'local' ? 'LOCAL TEST ADAPTER' : 'Stripe test'} retrieval: ${p.status}.`, 'payment-provider', p.id || p.sessionId);
  }
  private async block(run: Run, reason: string, offer: Offer, provider: PaymentProvider = providerFor(this.store, run.providerMode), retrieved?: PaymentObject) {
    if (run.paymentId || run.sessionId) {
      const current = retrieved || await provider.retrieve(run);
      if (current.status === 'succeeded') {
        this.payment(run.id, current);
        throw new AppError(409, 'Capture exists; do not pretend this purchase was blocked before payment. Operator reconciliation required.');
      }
      if (current.status !== 'canceled') this.payment(run.id, await provider.cancel({ ...run, paymentId: current.id || undefined }, `${run.id}:cancel`));
      else this.payment(run.id, current);
    }
    this.change(run.id, r => { r.status = 'BLOCKED'; r.stage = 'DONE'; r.currentOffer = offer; r.reason = reason; r.recoveryState = 'NONE'; }, reason, 'policy');
  }
  private refundState(id: string, refund: RefundObject) {
    this.change(id, r => {
      if (refund.paymentId !== r.paymentId || refund.amountMinor !== r.mandate!.offer.totalMinor || refund.mode !== r.providerMode) throw new AppError(409, 'Refund reference or amount mismatch.');
      r.refundId = refund.id; r.refundState = refund.status;
      if (refund.status === 'succeeded') { r.status = 'RECOVERED'; r.recoveryState = 'REFUNDED'; r.stage = 'DONE'; }
      else if (['failed', 'canceled', 'requires_action'].includes(refund.status)) { r.status = 'NEEDS_OPERATOR'; r.recoveryState = 'FAILED'; r.stage = 'DONE'; }
      else { r.status = 'RECOVERING'; r.recoveryState = 'PENDING'; }
    }, `Authoritative refund state: ${refund.status}.`, 'payment-provider', refund.id);
  }
  private finishWebhookReceipts(id: string, paymentState: string, refundState?: string) {
    this.store.atomic(() => {
      const run = this.get(id);
      for (const receipt of this.store.pendingWebhooks(id)) {
        const expected = receipt.objectType === 'checkout.session' ? run.sessionId : receipt.objectType === 'refund' ? run.refundId : run.paymentId;
        if (!expected && run.stage !== 'DONE') continue; // Await the authoritative reference, rather than trust the notification ID.
        const matched = receipt.objectId === expected;
        receipt.status = matched ? 'HANDLED' : 'REJECTED'; receipt.processedAt = new Date().toISOString();
        receipt.retrievedState = receipt.objectType === 'refund' ? refundState : paymentState;
        receipt.reason = matched ? 'Correlated with authoritative provider retrieval through the existing worker/gate.' : 'Notification does not reference the recovered provider object.';
        this.store.put('stripe_webhook', receipt.id, receipt);
        this.store.event(run, run.status, receipt.reason, 'stripe-webhook-worker', receipt.id);
      }
    });
  }
  private async reconcileWebhookReceipts(id: string, provider: PaymentProvider) {
    if (!this.store.pendingWebhooks(id).length) return true;
    try {
      const run = this.get(id); const payment = await provider.retrieve(run);
      const refund = run.refundId ? await provider.retrieveRefund(run) : undefined;
      this.finishWebhookReceipts(id, payment.status, refund?.status); return true;
    } catch {
      this.store.atomic(() => { for (const receipt of this.store.pendingWebhooks(id)) {
        receipt.attempts += 1;
        if (receipt.attempts >= 8) { receipt.status = 'REJECTED'; receipt.processedAt = new Date().toISOString(); receipt.reason = 'Authoritative webhook reconciliation unavailable; operator lookup required. Settled transaction state preserved.'; }
        this.store.put('stripe_webhook', receipt.id, receipt);
      } }); return false;
    }
  }
  async processOne(): Promise<boolean> {
    const job = this.store.claim(); if (!job) return false;
    const { id, token } = job;
    let delay = 0;
    try {
      const run = this.get(id);
      const provider = providerFor(this.store, run.providerMode);
      if (run.stage === 'DONE') { if (!await this.reconcileWebhookReceipts(id, provider)) delay = 2000; return true; }
      const merchant = new DemoMerchant(this.store);
      if (run.stage === 'VALIDATE') {
        const offer = merchant.getOffer(run); const failure = validateMandate(run, offer) || merchant.quoteFailure(run);
        if (failure) await this.block(run, failure, offer, provider);
        else this.change(id, r => { r.stage = 'AUTHORIZE'; r.paymentState = 'AUTHORIZING'; }, 'Exact mandate checked before any payment operation.', 'policy');
      } else if (run.stage === 'AUTHORIZE') {
        const offer = merchant.getOffer(run); const failure = validateMandate(run, offer) || merchant.quoteFailure(run);
        if (failure) { await this.block(run, failure, offer, provider); return true; }
        if (run.operationStartedAt && Date.now() - Date.parse(run.operationStartedAt) > 23 * 3600000) throw new AppError(409, 'Authorization retry window exceeded; manual provider lookup required.');
        const p = await provider.authorize(run, `${id}:authorize`);
        this.payment(id, p, p.status === 'requires_capture' ? 'CAPTURE' : 'WAIT_AUTH');
      } else if (run.stage === 'WAIT_AUTH') {
        const p = await provider.retrieve(run);
        const offer = merchant.getOffer(run); const failure = validateMandate(run, offer) || merchant.quoteFailure(run);
        if (failure) await this.block({ ...run, paymentId: p.id || undefined }, failure, offer, provider, p);
        else { this.payment(id, p, p.status === 'requires_capture' ? 'CAPTURE' : p.status === 'succeeded' ? 'ORDER' : 'WAIT_AUTH'); delay = p.status === 'requires_action' ? 2000 : 0; }
      } else if (run.stage === 'CAPTURE') {
        const p = await provider.retrieve(run);
        if (p.status === 'succeeded') this.payment(id, p, 'ORDER'); // Recover response lost after capture, before attempting any new capture.
        else if (p.status === 'canceled' || p.status === 'failed') this.payment(id, p, 'DONE');
        else if (p.status !== 'requires_capture') { this.payment(id, p, 'WAIT_AUTH'); delay = 2000; }
        else {
          const offer = merchant.getOffer(run); const failure = validateMandate(run, offer) || merchant.quoteFailure(run);
          if (failure) await this.block(run, failure, offer, provider, p);
          else if (!p.captureBefore || Date.parse(p.captureBefore) <= Date.now() + 5000) await this.block(run, 'Authorization expiry unavailable or too close. Fresh authorization required.', offer, provider, p);
          else {
            let finalFailure: string | undefined;
            const claimed = this.store.atomic(() => {
              const fresh = this.store.get<Run>('run', id)!; const currentOffer = merchant.getOffer(fresh);
              finalFailure = validateMandate(fresh, currentOffer) || merchant.quoteFailure(fresh);
              if (finalFailure || this.store.get<boolean>('capture_hold', id)) return false;
              fresh.paymentState = 'CAPTURING'; this.store.save(fresh, 'Capture claimed after final exact-offer AND active merchant-quote validation.', 'policy'); return true;
            });
            if (finalFailure) await this.block(this.get(id), finalFailure, merchant.getOffer(this.get(id)), provider, p);
            else if (!claimed) delay = 500; // Owner-controlled demo pause; never an alternate payment authority.
            else this.payment(id, await provider.capture(this.get(id), `${id}:capture`), 'ORDER');
          }
        }
      } else if (run.stage === 'ORDER') {
        const p = await provider.retrieve(run);
        if (p.status !== 'succeeded') throw new AppError(409, 'Order creation requires confirmed capture.');
        const operation = `${id}:order`;
        this.change(id, r => { r.orderState = 'CREATING'; }, 'Retrieve same merchant operation before creating an order.', 'merchant');
        const order = await merchant.getOrderStatus(operation) || await merchant.createOrder(run, operation);
        this.change(id, r => {
          r.orderId = order.id; r.orderState = order.state; r.recoveryState = 'NONE'; r.reconcileAttempts = 0;
          if (order.state === 'CONFIRMED') { r.status = 'CONFIRMED'; r.stage = 'DONE'; r.reason = 'Payment capture and demo merchant order are both confirmed.'; }
          else { r.status = 'RECOVERING'; r.stage = 'REFUND'; r.reason = order.reason; r.recoveryState = 'REFUND_REQUESTED'; }
        }, order.state === 'CONFIRMED' ? 'Demo merchant confirmed the order.' : 'Known merchant failure. Recovery required; purchase is not successful.', 'merchant', order.id);
      } else if (run.stage === 'REFUND') {
        const p = await provider.retrieve(run);
        if (p.status !== 'succeeded' || run.orderState !== 'FAILED') throw new AppError(409, 'Refund requires confirmed capture AND known failed order.');
        let refund = await provider.retrieveRefund(run);
        if (!refund) {
          if (run.operationStartedAt && Date.now() - Date.parse(run.operationStartedAt) > 23 * 3600000) throw new AppError(409, 'Recovery retry window exceeded; manual lookup required.');
          this.change(id, r => { r.recoveryState = 'REFUND_REQUESTED'; }, 'Requesting refund for the same confirmed charge, with a stable operation key.', 'recovery');
          refund = await provider.refund(run, `${id}:refund`);
          this.change(id, r => { r.refundId = refund!.id; }, 'Refund reference saved. Awaiting authoritative retrieval before declaring recovery.', 'recovery', refund.id);
        }
        // Request acceptance is not final refund truth. Retrieve the provider object.
        const retrieved = await provider.retrieveRefund({ ...run, refundId: refund.id });
        if (!retrieved) throw new OperationUnknown('Refund reference exists but retrieval is not yet available.');
        this.refundState(id, retrieved);
        delay = retrieved.status === 'pending' ? 5000 : 0;
      }
      if (!await this.reconcileWebhookReceipts(id, provider)) delay = 2000;
    } catch (error) {
      if (error instanceof AppError) this.change(id, r => { r.status = 'NEEDS_OPERATOR'; r.recoveryState = 'NEEDS_OPERATOR'; r.reason = error.message; r.stage = 'DONE'; }, error.message, 'policy');
      else {
        this.change(id, r => {
          r.reconcileAttempts += 1;
          if (r.stage === 'ORDER') r.orderState = 'UNKNOWN';
          else if (r.stage !== 'REFUND') r.paymentState = 'UNKNOWN';
          r.recoveryState = 'RECONCILING'; r.status = 'PROCESSING';
          r.reason = 'Response unavailable. Retrieving the same operation; no new charge or blind refund.';
          if (r.reconcileAttempts >= 8) { r.status = 'NEEDS_OPERATOR'; r.recoveryState = 'NEEDS_OPERATOR'; r.stage = 'DONE'; }
        }, 'Network/provider result unknown. Reconciliation queued with the SAME operation references.', 'recovery');
        delay = 1000;
      }
    } finally {
      this.store.finish(id, token, this.get(id).stage === 'DONE', delay);
    }
    return true;
  }
  webhook(eventId: string, runId: string) {
    return this.store.atomic(() => {
      if (!this.store.webhookOnce(eventId)) return false;
      const run = this.store.get<Run>('run', runId);
      if (run) { this.store.event(run, run.status, `${run.providerMode === 'local' ? 'LOCAL TEST webhook notification' : 'Verified Stripe webhook'} received. Retrieve authoritative object; do not apply payload state.`, 'webhook'); if (run.stage !== 'DONE') this.store.enqueue(runId); }
      return true;
    });
  }
}
