import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Store } from '../lib/store';
import { stripeClient } from '../lib/payments';
import type { Run } from '../lib/types';
const folder = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence/2026-10-03-round2/final';
const base = process.env.APP_URL || 'http://127.0.0.1:3107';
const phase = process.argv[2]; assert.ok(['before', 'after'].includes(phase));
const origin = new URL(base).origin;
const auth = await fetch(`${origin}/api/login`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'demo-buyer', password: process.env.DEMO_PASSWORD || 'crosscart-demo' }) }); assert.ok(auth.ok); const cookie = auth.headers.get('set-cookie')!.split(';')[0];
const names = ['happy', 'price-drift', 'refund', 'quote-withdrawn-after-authorization', 'catalogue-update-locked-quote', 'mobile-no-return', 'english-merchant-b', 'revision-merchant-c-refund'];
const store = new Store(), rows = [];
for (const name of names) {
  const sample = JSON.parse(readFileSync(`${folder}/playwright/stripe/${name}.json`, 'utf8')) as { run: Run };
  const r = await (await fetch(`${origin}/api/runs/${sample.run.id}`, { headers: { Cookie: cookie } })).json() as Run;
  assert.equal(r.id, sample.run.id); assert.equal(r.stage, 'DONE');
  const snapshots = { id: r.id, status: r.status, paymentState: r.paymentState, orderState: r.orderState, recoveryState: r.recoveryState, sessionId: r.sessionId || null, paymentId: r.paymentId || null, refundId: r.refundId || null, orderId: r.orderId || null, mandate: r.mandate, approval: r.approval, shoppingId: r.shoppingId, shoppingVersion: r.shoppingVersion, auditCount: r.events!.length, webhookReceipts: r.webhookReceipts, orderCount: store.list<{runId: string}>('merchant_order').filter(o => o.runId === r.id).length };
  if (phase === 'after') {
    const commit = await fetch(`${origin}/api/runs/${r.id}/commit`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }); assert.ok(commit.ok);
    const retried = await commit.json() as Run; assert.equal(retried.paymentId, r.paymentId); assert.equal(retried.orderId, r.orderId); assert.equal(retried.status, r.status);
    if (r.paymentId) { const p = await stripeClient().paymentIntents.retrieve(r.paymentId); assert.equal(p.livemode, false); assert.equal(p.id, r.paymentId); assert.equal(p.amount, r.mandate!.offer.totalMinor); assert.equal(p.capture_method, 'manual'); assert.equal(p.status, name === 'quote-withdrawn-after-authorization' ? 'canceled' : 'succeeded'); }
    if (r.refundId) { const ref = await stripeClient().refunds.retrieve(r.refundId); assert.equal(ref.status, 'succeeded'); assert.equal(ref.payment_intent, r.paymentId); }
  }
  rows.push({ name, ...snapshots });
}
store.close(); mkdirSync(folder, { recursive: true });
if (phase === 'after') { const before = JSON.parse(readFileSync(`${folder}/settled-before-restart.json`, 'utf8')); assert.deepEqual(rows, before.runs); }
writeFileSync(`${folder}/settled-${phase}-restart.json`, JSON.stringify({ checkedAt: new Date().toISOString(), phase, runs: rows, unchangedAcrossActualRestart: phase === 'after', officialReferencesRetrievedAfterRestart: phase === 'after' }, null, 2));
console.log(`${rows.length} settled runs checked ${phase} actual restart; ${phase === 'after' ? 'IDs, consents, receipts, audit counts retained; duplicate commit unchanged; official references retrieved.' : 'snapshot preserved.'}`);
