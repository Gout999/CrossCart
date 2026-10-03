import type Stripe from 'stripe';
import type { Store } from './store';
import { AppError, type Run, type WebhookReceipt } from './types';

export const STRIPE_EVENTS = ['checkout.session.completed', 'checkout.session.expired', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'payment_intent.amount_capturable_updated', 'payment_intent.succeeded', 'payment_intent.canceled', 'payment_intent.payment_failed', 'refund.created', 'refund.updated', 'refund.failed'];

// The caller must first verify Stripe's signature over the original raw body.
// Persist only correlation data, never billing details or the full event object.
export function queueVerifiedStripeEvent(store: Store, event: Stripe.Event) {
  if (event.livemode) throw new AppError(400, 'Live events are rejected.');
  if (!STRIPE_EVENTS.includes(event.type)) return { handled: false, reason: 'Event type is not used by this demo.' };
  const object = event.data.object as unknown as { id: string; object: WebhookReceipt['objectType']; livemode?: boolean; metadata?: Record<string, string>; amount?: number; amount_total?: number; currency?: string; payment_intent?: string };
  if (object.livemode) throw new AppError(400, 'Live provider objects are rejected.');
  const runId = object.metadata?.run_id;
  if (!runId) return { handled: false, reason: 'Event is unrelated to a CrossCart run.' };
  return store.atomic(() => {
    const run = store.get<Run>('run', runId);
    if (!run || run.providerMode !== 'stripe' || !run.mandate || !run.approval || !run.operationStartedAt || !(run.sessionId || run.paymentId)) throw new AppError(400, 'Event has no authorized local Stripe operation.');
    const m = run.mandate;
    if (object.metadata?.mandate_id !== m.id || object.metadata?.mandate_hash !== m.hash || object.metadata?.payee_id !== m.offer.payee || event.account && event.account !== m.offer.payee) throw new AppError(400, 'Event does not bind the same mandate and approved test payee.');
    const expectedType = event.type.startsWith('checkout.') ? 'checkout.session' : event.type.startsWith('refund.') ? 'refund' : 'payment_intent';
    if (object.object !== expectedType || !object.id || object.currency !== m.offer.currency || (object.object === 'checkout.session' ? object.amount_total : object.amount) !== m.offer.totalMinor) throw new AppError(400, 'Event object or exact approved amount differs.');
    if (object.object === 'checkout.session' && object.id !== run.sessionId || object.object === 'payment_intent' && run.paymentId && object.id !== run.paymentId || object.object === 'refund' && (object.payment_intent !== run.paymentId || object.metadata?.operation_id !== `${run.id}:refund` || run.refundId && object.id !== run.refundId)) throw new AppError(400, 'Event references a different local provider operation.');
    if (object.object === 'refund' && run.orderState !== 'FAILED') throw new AppError(400, 'No local failed-order recovery operation exists.');
    if (store.get<WebhookReceipt>('stripe_webhook', event.id)) return { handled: false, duplicate: true, eventId: event.id };
    const receipt: WebhookReceipt = { id: event.id, runId, eventType: event.type, objectType: object.object, objectId: object.id, eventCreated: event.created, receivedAt: new Date().toISOString(), verifiedSignature: true, status: 'PENDING', attempts: 0 };
    store.insert('stripe_webhook', event.id, receipt); store.webhookOnce(event.id);
    store.event(run, run.status, 'Verified Stripe notification durably saved. Worker retrieves the same operation; payload state is not applied.', 'stripe-webhook', event.id);
    store.enqueue(runId);
    return { handled: true, queued: true, eventId: event.id };
  });
}
