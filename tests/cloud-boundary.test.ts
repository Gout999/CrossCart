import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store';
import { Commerce } from '../lib/service';
import { hydrate, snapshot } from '../lib/cloud-ledger';
import { login, ownerFrom, COOKIE } from '../lib/auth';
import { estimatedDomesticFee } from '../lib/rate-sources';

test('cloud snapshot preserves approval/hash, audit order, durable job and deduplication across isolated working copies', () => {
  const store = new Store(':memory:'); const service = new Commerce(store, 'local');
  let run = service.create('buyer', 'HK$1,800 headphones'); run = service.quote(run.id, 'buyer', 'merchant_a'); run = service.approve(run.id, 'buyer', run.mandate!.id, run.mandate!.hash); service.commit(run.id, 'buyer'); store.webhookOnce('local-dedup');
  const original = snapshot(store), restored = hydrate(original);
  try { assert.deepEqual(snapshot(restored), original); assert.equal(new Commerce(restored).get(run.id).approval!.hash, run.mandate!.hash); assert.equal(restored.webhookOnce('local-dedup'), false); assert.ok(restored.claim()); assert.notDeepEqual(snapshot(restored), original); assert.deepEqual(snapshot(store), original); } finally { restored.close(); store.close(); }
});
test('public logins share a demo password but cannot read or authorize each others purchases', () => {
  const old = process.env.CROSSCART_PUBLIC_DEMO; process.env.CROSSCART_PUBLIC_DEMO = 'true';
  const store = new Store(':memory:');
  try {
    const a = ownerFrom(store, `${COOKIE}=${login(store, 'demo-buyer', process.env.DEMO_PASSWORD || 'crosscart-demo')}`);
    const b = ownerFrom(store, `${COOKIE}=${login(store, 'demo-buyer', process.env.DEMO_PASSWORD || 'crosscart-demo')}`);
    assert.notEqual(a, b); const service = new Commerce(store, 'local'); const run = service.create(a, 'HK$1,800 headphones'); assert.throws(() => service.get(run.id, b), /another demo account/); assert.deepEqual(service.list(b), []); assert.throws(() => service.quote(run.id, b, 'merchant_a'), /another demo account/);
  } finally { store.close(); if (old === undefined) delete process.env.CROSSCART_PUBLIC_DEMO; else process.env.CROSSCART_PUBLIC_DEMO = old; }
});
test('merchant fee illustration is integer HKD and cannot silently accept fractional amounts', () => {
  assert.equal(estimatedDomesticFee(174900), 6182); assert.throws(() => estimatedDomesticFee(174900.1)); assert.throws(() => estimatedDomesticFee(-1));
});
