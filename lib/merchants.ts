import type { Intent, Mandate, MerchantQuote, Offer, OrderObject, Run } from './types';
import { OperationUnknown } from './types';
import type { Store } from './store';
import { canonical, deliveryDefault, reasons } from './policy';

export interface MerchantAdapter {
  search(intent: Intent): Offer[];
  getOffer(run: Run): Offer;
  validateOffer(run: Run): { offer: Offer; reasons: string[] };
  createOrder(run: Run, operationId: string): Promise<OrderObject>;
  getOrderStatus(operationId: string): Promise<OrderObject | undefined>;
}
export function catalogue(): Offer[] {
  return [['a', 171900, 3000, 'official'], ['b', 166900, 3000, 'third-party'], ['c', 177900, 5000, 'official']].map(([id, price, shipping, warranty]) => ({
    offerId: `demo_offer_${id}_v1`, merchantId: `merchant_${id}`, merchantName: `Merchant ${String(id).toUpperCase()}`,
    sellerId: `demo_seller_${id}`, productId: 'DEMO_HEADPHONES_01', productName: 'Demo Wireless Headphones', variant: 'graphite', quantity: 1,
    subtotalMinor: Number(price), shippingMinor: Number(shipping), totalMinor: Number(price) + Number(shipping), currency: 'hkd',
    warranty: warranty as Offer['warranty'], termsVersion: 'demo-terms-1', deliveryDate: deliveryDefault(new Date(Date.now() - (id === 'c' ? 86400000 : 0))),
    payee: 'CrossCart controlled test merchant', version: 1, source: 'DEMO MERCHANT ADAPTER · Synthetic catalogue'
  }));
}
export class DemoMerchant implements MerchantAdapter {
  constructor(private store: Store) {}
  search(intent?: Intent) { void intent; return catalogue(); }
  acceptQuote(mandate: Mandate) {
    this.store.insert('merchant_quote', mandate.id, { mandateId: mandate.id, offer: mandate.offer, validUntil: mandate.expiresAt, state: 'ACTIVE' } satisfies MerchantQuote);
  }
  quote(run: Run) { return run.mandate ? this.store.get<MerchantQuote>('merchant_quote', run.mandate.id) : undefined; }
  quoteFailure(run: Run) {
    const q = this.quote(run);
    if (!q) return 'Merchant quote validity is unknown. Fresh approval required.';
    if (q.mandateId !== run.mandate?.id || canonical(q.offer) !== canonical(run.mandate.offer)) return 'Accepted merchant quote differs from the approved mandate. Fresh approval required.';
    if (q.state !== 'ACTIVE') return 'Merchant revoked the original quote. Fresh approval required.';
    if (Date.parse(q.validUntil) <= Date.now()) return 'Merchant quote expired. Fresh approval required.';
  }
  getOffer(run: Run) {
    if (!run.mandate) throw new Error('No mandate');
    // A stable, per-run fixture models merchant state. It never overwrites the approved quote.
    const offer = structuredClone(run.mandate.offer);
    if (run.scenario === 'price_drift') { offer.subtotalMinor += 10000; offer.totalMinor += 10000; offer.version += 1; offer.offerId += '_changed'; }
    return this.store.get<Offer>('offer_override', run.id) || offer;
  }
  validateOffer(run: Run) { const offer = this.getOffer(run); return { offer, reasons: reasons(offer, run.intent) }; }
  async createOrder(run: Run, operationId: string): Promise<OrderObject> {
    const existing = this.store.get<OrderObject>('merchant_order', operationId);
    if (existing) return existing;
    const failed = ['order_failure', 'refund_pending', 'refund_failed'].includes(run.scenario);
    const order: OrderObject = { id: `demo_order_${run.id}`, runId: run.id, state: failed ? 'FAILED' : 'CONFIRMED', amountMinor: run.mandate!.offer.totalMinor, ...(failed ? { reason: 'Injected known merchant order failure (DEMO)' } : {}) };
    this.store.insert('merchant_order', operationId, order);
    if (run.scenario === 'order_timeout') throw new OperationUnknown('Merchant replied after the response was lost.');
    return order;
  }
  async getOrderStatus(operationId: string) { return this.store.get<OrderObject>('merchant_order', operationId); }
}
