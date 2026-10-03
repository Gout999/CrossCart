export type ProviderMode = 'local' | 'stripe';
export type PaymentState = 'NOT_STARTED' | 'AUTHORIZING' | 'AUTHORIZED' | 'CAPTURING' | 'CAPTURED' | 'CANCELED' | 'UNKNOWN' | 'FAILED';
export type OrderState = 'NOT_CREATED' | 'CREATING' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN';
export type RecoveryState = 'NONE' | 'RECONCILING' | 'REFUND_REQUESTED' | 'PENDING' | 'REFUNDED' | 'FAILED' | 'NEEDS_OPERATOR';
export type Scenario = 'happy' | 'price_drift' | 'order_failure' | 'capture_timeout' | 'order_timeout' | 'refund_pending' | 'refund_failed';
export type Stage = 'VALIDATE' | 'AUTHORIZE' | 'WAIT_AUTH' | 'CAPTURE' | 'ORDER' | 'REFUND' | 'DONE';
export interface Intent { text: string; budgetMinor: number; officialWarranty: boolean; deliveryBefore: string; parser: 'deterministic' | 'live-ai'; explanation: string; softPreferences?: string[]; rankedMerchantIds?: string[]; }
export interface Offer {
  offerId: string; merchantId: string; merchantName: string; sellerId: string;
  productId: string; productName: string; variant: string; quantity: number;
  subtotalMinor: number; shippingMinor: number; totalMinor: number; currency: string;
  warranty: 'official' | 'third-party'; termsVersion: string; deliveryDate: string;
  payee: string; version: number; source: string;
}
export interface Mandate { id: string; version: number; offer: Offer; expiresAt: string; ownerId: string; agentId: string; hash: string; }
export interface MerchantQuote { mandateId: string; offer: Offer; validUntil: string; state: 'ACTIVE' | 'REVOKED'; reason?: string; }
export type DemoControl = 'hold_capture' | 'resume_capture' | 'revoke_quote' | 'catalogue_update';
export interface WebhookReceipt { id: string; runId: string; eventType: string; objectType: 'checkout.session' | 'payment_intent' | 'refund'; objectId: string; eventCreated: number; receivedAt: string; verifiedSignature: true; status: 'PENDING' | 'HANDLED' | 'REJECTED'; attempts: number; processedAt?: string; reason?: string; retrievedState?: string; }
export interface Approval { mandateId: string; hash: string; actor: string; approvedAt: string; revokedAt?: string; }
export interface PaymentObject { id: string; status: 'requires_action' | 'requires_capture' | 'succeeded' | 'canceled' | 'failed'; amountMinor: number; currency: string; mode: ProviderMode; captureBefore?: string; sessionId?: string; checkoutUrl?: string; }
export interface RefundObject { id: string; paymentId: string; status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'; amountMinor: number; mode: ProviderMode; }
export interface OrderObject { id: string; runId: string; state: 'CONFIRMED' | 'FAILED'; amountMinor: number; reason?: string; }
export interface AuditEvent { id: string; runId: string; timestamp: string; source: string; previousState: string; newState: string; reason: string; providerReference?: string; }
export interface Run {
  id: string; ownerId: string; createdAt: string; updatedAt: string; providerMode: ProviderMode;
  intent: Intent; scenario: Scenario; status: 'COMPARING' | 'QUOTED' | 'APPROVED' | 'PROCESSING' | 'WAITING_PAYMENT' | 'BLOCKED' | 'CONFIRMED' | 'RECOVERING' | 'RECOVERED' | 'NEEDS_OPERATOR';
  stage: Stage; mandate?: Mandate; approval?: Approval; currentOffer?: Offer;
  paymentState: PaymentState; orderState: OrderState; recoveryState: RecoveryState;
  paymentId?: string; sessionId?: string; checkoutUrl?: string; providerState?: string;
  orderId?: string; refundId?: string; refundState?: string; reason?: string;
  operationStartedAt?: string; reconcileAttempts: number; events?: AuditEvent[];
  merchantQuote?: MerchantQuote; catalogueUpdate?: Offer; demoCaptureHold?: boolean;
  webhookReceipts?: WebhookReceipt[];
  shoppingId?: string; shoppingVersion?: number; previousRunId?: string;
}
export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export class OperationUnknown extends Error { constructor(message = 'Operation result is unknown; retrieve the same operation.') { super(message); } }
