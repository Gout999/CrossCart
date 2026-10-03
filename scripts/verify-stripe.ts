import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { stripeClient } from '../lib/payments';
const output = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence';
mkdirSync(output, { recursive: true });
if (!process.env.STRIPE_SECRET_KEY) {
  const report = { status: 'BLOCKED', officialStripeSandboxVerified: false, message: 'OFFICIAL SANDBOX NOT YET VERIFIED', required: ['STRIPE_SECRET_KEY (sk_test_... or restricted test key with payment/refund permissions)'], webhookOptional: 'STRIPE_WEBHOOK_SECRET — not needed for authoritative retrieval verification', checkedAt: new Date().toISOString() };
  writeFileSync(`${output}/stripe.json`, JSON.stringify(report, null, 2)); console.log(report.message); console.log('Minimum action: add a Stripe TEST secret key to .env.local, then npm run verify:stripe.'); process.exit(2);
}
const stripe = stripeClient(); const operation = `crosscart-verify-${randomUUID()}`;
const report: Record<string, unknown> = { status: 'PARTIAL', officialStripeSandboxVerified: false, operation, checkedAt: new Date().toISOString(), checks: [] };
function save() { writeFileSync(`${output}/stripe.json`, JSON.stringify(report, null, 2)); }
save();
try {
  const account = await stripe.accounts.retrieveCurrent(); report.testPayeeAccountId = account.id; save();
  const create = (suffix: string) => stripe.paymentIntents.create({ amount: 174900, currency: 'hkd', allowed_payment_method_types: ['card'], payment_method: 'pm_card_visa', confirm: true, capture_method: 'manual', metadata: { source: 'CrossCart sandbox verification', operation } }, { idempotencyKey: `${operation}:${suffix}` });
  const authorized = await create('authorize'); report.authorization = { id: authorized.id, status: authorized.status, amount: authorized.amount, livemode: authorized.livemode }; save();
  if (authorized.livemode || authorized.status !== 'requires_capture') throw new Error('Authorization was not verified.');
  await stripe.paymentIntents.capture(authorized.id, { amount_to_capture: 174900 }, { idempotencyKey: `${operation}:capture` });
  const captured = await stripe.paymentIntents.retrieve(authorized.id); report.capture = { id: captured.id, status: captured.status, amountReceived: captured.amount_received }; save();
  if (captured.status !== 'succeeded') throw new Error('Capture was not verified.');
  const createdRefund = await stripe.refunds.create({ payment_intent: captured.id, amount: 174900 }, { idempotencyKey: `${operation}:refund` });
  const refund = await stripe.refunds.retrieve(createdRefund.id); report.refund = { id: refund.id, paymentIntent: captured.id, status: refund.status, amount: refund.amount }; save();
  const cancelAuth = await create('cancel-authorize'); await stripe.paymentIntents.cancel(cancelAuth.id, {}, { idempotencyKey: `${operation}:cancel` });
  const canceled = await stripe.paymentIntents.retrieve(cancelAuth.id); report.cancel = { id: canceled.id, status: canceled.status }; save();
  if (canceled.status !== 'canceled' || refund.status !== 'succeeded') throw new Error('Cancellation or completed refund not yet verified.');
  report.status = 'DONE'; report.officialStripeSandboxVerified = true; report.scope = 'Direct PaymentIntent sandbox checks only; Hosted Checkout, app recovery and Stripe webhook delivery require separate browser/provider validation.'; save();
  console.log(JSON.stringify(report, null, 2));
} catch {
  report.status = 'PARTIAL'; report.message = 'Official provider verification incomplete. Inspect safe object IDs in output/evidence/stripe.json and Stripe test dashboard. No credentials or raw provider errors are logged.'; save(); console.error(report.message); process.exitCode = 1;
}
