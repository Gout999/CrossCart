import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import Stripe from 'stripe';
import { Store } from '../lib/store';
import { Commerce } from '../lib/service';
import { StripePaymentProvider } from '../lib/payments';
import { OperationUnknown } from '../lib/types';
import { mandateHash } from '../lib/policy';

// Real installed Stripe SDK -> isolated localhost HTTP fixtures.
// These tests do NOT contact Stripe or prove official sandbox acceptance.
async function fixture(t: TestContext) {
  const store = new Store(':memory:');
  const commerce = new Commerce(store, 'stripe');
  let run = commerce.create('contract-buyer', 'HK$1,800 headphones');
  run = commerce.quote(run.id, 'contract-buyer', 'merchant_a', 'acct_ContractA');
  run = commerce.approve(run.id, 'contract-buyer', run.mandate!.id, run.mandate!.hash);
  const metadata = { run_id: run.id, mandate_id: run.mandate!.id, mandate_hash: run.mandate!.hash, payee_id: 'acct_ContractA' };
  const requests: { method: string; url: string; key?: string; body: URLSearchParams }[] = [];
  const operations = { captures: new Set<string>(), refunds: new Set<string>() };
  const state = {
    account: 'acct_ContractA',
    payment: { id: 'pi_contract', object: 'payment_intent', livemode: false, amount: 174900, currency: 'hkd', capture_method: 'manual', amount_capturable: 174900, amount_received: 0, status: 'requires_capture', metadata, latest_charge: { payment_method_details: { card: { capture_before: Math.floor(Date.now() / 1000) + 86400 } } } } as Record<string, unknown>,
    session: { id: 'cs_test_contract', object: 'checkout.session', livemode: false, mode: 'payment', amount_total: 174900, currency: 'hkd', client_reference_id: run.id, metadata, status: 'open', payment_status: 'unpaid', payment_intent: 'pi_contract', url: 'https://checkout.stripe.com/c/pay/cs_test_contract' } as Record<string, unknown>,
    refund: { id: 're_contract', object: 'refund', payment_intent: 'pi_contract', amount: 174900, currency: 'hkd', status: 'pending', metadata: { ...metadata, operation_id: `${run.id}:refund` } } as Record<string, unknown>,
    refundExists: false, hasMore: false, loseCaptureResponse: false, loseRefundResponse: false, expireConfirmed: true
  };
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const url = new URL(request.url!, 'http://127.0.0.1');
    requests.push({ method: request.method!, url: request.url!, key: request.headers['idempotency-key'] as string | undefined, body: new URLSearchParams(raw) });
    let body: unknown;
    if (url.pathname === '/v1/account') body = { id: state.account, object: 'account' };
    else if (url.pathname === '/v1/checkout/sessions' || url.pathname === '/v1/checkout/sessions/cs_test_contract') body = state.session;
    else if (url.pathname === '/v1/checkout/sessions/cs_test_contract/expire') {
      if (state.expireConfirmed) state.session.status = 'expired'; body = state.session;
    } else if (url.pathname === '/v1/payment_intents/pi_contract') body = state.payment;
    else if (url.pathname === '/v1/payment_intents/pi_contract/capture') {
      operations.captures.add(request.headers['idempotency-key'] as string);
      state.payment.status = 'succeeded'; state.payment.amount_received = 174900; state.payment.amount_capturable = 0;
      if (state.loseCaptureResponse) { response.destroy(); return; } body = state.payment;
    } else if (url.pathname === '/v1/payment_intents/pi_contract/cancel') {
      state.payment.status = 'canceled'; state.payment.amount_capturable = 0; body = state.payment;
    } else if (url.pathname === '/v1/refunds' && request.method === 'POST') {
      operations.refunds.add(request.headers['idempotency-key'] as string);
      state.refundExists = true;
      if (state.loseRefundResponse) { response.destroy(); return; } body = state.refund;
    } else if (url.pathname === '/v1/refunds') body = { object: 'list', data: state.refundExists ? [state.refund] : [], has_more: state.hasMore };
    else if (url.pathname === '/v1/refunds/re_contract') body = state.refund;
    else { response.writeHead(404); response.end(JSON.stringify({ error: { message: 'Unknown LOCAL CONTRACT endpoint' } })); return; }
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new Stripe('sk_test_local_contract_fixture_not_a_real_key', { host: '127.0.0.1', port: (server.address() as AddressInfo).port, protocol: 'http', httpClient: Stripe.createNodeHttpClient(), timeout: 500, maxNetworkRetries: 0 });
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); });
  return { store, commerce, run, state, requests, operations, client, provider: new StripePaymentProvider(client) };
}
test('LOCAL SDK contract: Stripe quote binds the retrieved account, not a synthetic payee label', async t => {
  const { store, commerce, run, provider } = await fixture(t);
  assert.equal(await provider.accountId(), 'acct_ContractA');
  assert.equal(run.mandate!.offer.payee, 'acct_ContractA'); assert.equal(run.mandate!.hash, mandateHash(run.mandate!));
  const fresh = commerce.create('contract-buyer', 'HK$1,800 headphones');
  assert.throws(() => commerce.quote(fresh.id, 'contract-buyer', 'merchant_a'), /actual Stripe test payee/);
  assert.equal(store.list('mandate').length, 1);
});
test('LOCAL SDK contract: exact HKD total, manual capture, metadata and stable keys go on the wire', async t => {
  const { run, provider, requests } = await fixture(t);
  const key = `${run.id}:authorize`;
  assert.equal((await provider.authorize(run, key)).sessionId, 'cs_test_contract');
  await provider.authorize(run, key);
  const posts = requests.filter(r => r.method === 'POST'); assert.equal(posts.length, 2);
  for (const post of posts) {
    assert.equal(post.key, key); assert.equal(post.body.get('payment_intent_data[capture_method]'), 'manual');
    assert.equal(post.body.get('allowed_payment_method_types[0]'), 'card');
    assert.equal(post.body.has('payment_method_types[0]'), false);
    assert.equal(post.body.get('line_items[0][price_data][unit_amount]'), '174900');
    assert.equal(post.body.get('line_items[0][price_data][currency]'), 'hkd');
    assert.equal(post.body.get('metadata[payee_id]'), run.mandate!.offer.payee);
    assert.equal(post.body.get('payment_intent_data[metadata][mandate_hash]'), run.mandate!.hash);
  }
});
test('LOCAL SDK contract: Checkout redirect status never substitutes for PaymentIntent retrieval', async t => {
  const { run, provider, state, requests } = await fixture(t);
  state.session.status = 'complete'; state.session.payment_status = 'paid';
  const result = await provider.retrieve({ ...run, sessionId: 'cs_test_contract' });
  assert.equal(result.status, 'requires_capture');
  assert.ok(requests.some(r => [...new URL(r.url, 'http://127.0.0.1').searchParams].some(([key, value]) => key.startsWith('expand') && value === 'latest_charge')));
});
test('LOCAL SDK contract: closed-connection retry and capture reconciliation use the same operation', async t => {
  const { run, provider, state, requests, operations } = await fixture(t);
  const known = { ...run, paymentId: 'pi_contract' }; state.loseCaptureResponse = true;
  await assert.rejects(() => provider.capture(known, `${run.id}:capture`));
  const result = await provider.retrieve(known); assert.equal(result.status, 'succeeded'); assert.equal(result.id, 'pi_contract');
  const posts = requests.filter(r => r.method === 'POST'); assert.ok(posts.length >= 1);
  for (const post of posts) { assert.equal(post.key, `${run.id}:capture`); assert.equal(post.body.get('amount_to_capture'), '174900'); }
  assert.equal(operations.captures.size, 1); assert.equal(operations.refunds.size, 0);
});
test('LOCAL SDK contract: cancellation returns actual canceled authorization', async t => {
  const { run, provider, requests } = await fixture(t);
  assert.equal((await provider.cancel({ ...run, paymentId: 'pi_contract' }, `${run.id}:cancel`)).status, 'canceled');
  assert.equal(requests.find(r => r.method === 'POST')!.key, `${run.id}:cancel`);
});
test('LOCAL SDK contract: Checkout expiration must actually be confirmed', async t => {
  const { run, provider, state } = await fixture(t); state.expireConfirmed = false;
  await assert.rejects(() => provider.cancel({ ...run, sessionId: 'cs_test_contract' }, `${run.id}:cancel`), OperationUnknown);
  state.expireConfirmed = true;
  assert.equal((await provider.cancel({ ...run, sessionId: 'cs_test_contract' }, `${run.id}:cancel`)).status, 'canceled');
});
test('LOCAL SDK contract: refund pending stays pending; retrieved succeeded is separate truth', async t => {
  const { run, provider, state, requests } = await fixture(t); const known = { ...run, paymentId: 'pi_contract' };
  const created = await provider.refund(known, `${run.id}:refund`); assert.equal(created.status, 'pending');
  const withRefund = { ...known, refundId: created.id };
  assert.equal((await provider.retrieveRefund(withRefund))!.status, 'pending');
  state.refund.status = 'succeeded'; assert.equal((await provider.retrieveRefund(withRefund))!.status, 'succeeded');
  const post = requests.find(r => r.method === 'POST')!;
  assert.equal(post.key, `${run.id}:refund`); assert.equal(post.body.get('amount'), '174900');
  assert.equal(post.body.get('payment_intent'), 'pi_contract'); assert.equal(post.body.get('metadata[operation_id]'), `${run.id}:refund`);
});
test('LOCAL SDK contract: lost refund response is recovered by operation metadata, no replacement refund', async t => {
  const { run, provider, state, requests, operations } = await fixture(t); state.loseRefundResponse = true;
  const known = { ...run, paymentId: 'pi_contract' };
  await assert.rejects(() => provider.refund(known, `${run.id}:refund`));
  assert.equal((await provider.retrieveRefund(known))!.id, 're_contract');
  assert.equal(operations.refunds.size, 1);
  assert.ok(requests.filter(r => r.method === 'POST').every(r => r.key === `${run.id}:refund`));
});
test('LOCAL SDK contract: incomplete refund lookup never claims absence', async t => {
  const { run, provider, state, requests } = await fixture(t); state.hasMore = true;
  await assert.rejects(() => provider.retrieveRefund({ ...run, paymentId: 'pi_contract' }), OperationUnknown);
  assert.equal(requests.some(r => r.method === 'POST'), false);
});
test('LOCAL SDK contract: a different configured account blocks before creating Checkout', async t => {
  const { run, provider, state, requests } = await fixture(t); state.account = 'acct_ContractB';
  await assert.rejects(() => provider.authorize(run, `${run.id}:authorize`), /approved test payee/);
  assert.equal(requests.some(r => r.method === 'POST'), false);
});
test('LOCAL SDK contract: completed Checkout with missing PaymentIntent remains UNKNOWN', async t => {
  const { run, provider, state } = await fixture(t); state.session.status = 'complete'; state.session.payment_intent = null;
  await assert.rejects(() => provider.retrieve({ ...run, sessionId: 'cs_test_contract' }), OperationUnknown);
});
test('LOCAL SDK contract: provider processing cannot be declared captured by a paid redirect', async t => {
  const { run, provider, state } = await fixture(t); state.session.payment_status = 'paid'; state.payment.status = 'processing';
  assert.equal((await provider.retrieve({ ...run, sessionId: 'cs_test_contract' })).status, 'requires_action');
});
for (const [name, field, value] of [['run', 'run_id', 'another-run'], ['mandate', 'mandate_id', 'another-mandate'], ['hash', 'mandate_hash', 'changed-hash'], ['payee', 'payee_id', 'acct_Other']] as const) {
  test(`LOCAL SDK contract: mismatched ${name} metadata rejects PaymentIntent truth`, async t => {
    const { run, provider, state } = await fixture(t); state.payment.metadata = { ...(state.payment.metadata as object), [field]: value };
    await assert.rejects(() => provider.retrieve({ ...run, paymentId: 'pi_contract' }), /exact purchase mandate/);
  });
}
for (const [name, patch] of Object.entries({ live: { livemode: true }, reference: { id: 'pi_wrong' }, amount: { amount: 184900 }, currency: { currency: 'usd' }, automatic_capture: { capture_method: 'automatic' }, partial_authorization: { amount_capturable: 100000 }, partial_capture: { status: 'succeeded', amount_received: 100000 }, unexpected_routing: { transfer_data: { destination: 'acct_Other' } } })) {
  test(`LOCAL SDK contract: ${name} cannot become approved payment success`, async t => {
    const { run, provider, state, requests } = await fixture(t); Object.assign(state.payment, patch);
    await assert.rejects(() => provider.retrieve({ ...run, paymentId: 'pi_contract' }));
    assert.equal(requests.some(r => r.method === 'POST'), false);
  });
}
for (const [name, patch] of Object.entries({ reference: { id: 'cs_test_wrong' }, amount: { amount_total: 184900 }, buyer_run: { client_reference_id: 'other' }, unsafe_url: { url: 'https://attacker.invalid/checkout' }, live: { livemode: true } })) {
  test(`LOCAL SDK contract: Checkout ${name} mismatch is rejected`, async t => {
    const { run, provider, state } = await fixture(t); Object.assign(state.session, patch);
    await assert.rejects(() => provider.retrieve({ ...run, sessionId: 'cs_test_contract' }));
  });
}
for (const [name, patch] of Object.entries({ reference: { id: 're_other' }, charge: { payment_intent: 'pi_other' }, amount: { amount: 1 }, currency: { currency: 'usd' }, operation: { metadata: { operation_id: 'other' } } })) {
  test(`LOCAL SDK contract: refund ${name} mismatch cannot become recovered`, async t => {
    const { run, provider, state } = await fixture(t); Object.assign(state.refund, patch);
    await assert.rejects(() => provider.retrieveRefund({ ...run, paymentId: 'pi_contract', refundId: 're_contract' }));
  });
}
