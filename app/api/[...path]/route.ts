import { after, NextResponse } from 'next/server';
import type { Store } from '../../../lib/store';
import { cloudMode, drainCloudJobs, withLedger } from '../../../lib/cloud-ledger';
import { publicQuota } from '../../../lib/demo-limits';
import { Commerce } from '../../../lib/service';
import { COOKIE, login, ownerFrom, sameOrigin } from '../../../lib/auth';
import { configuredProvider, stripeClient, StripePaymentProvider } from '../../../lib/payments';
import { AppError } from '../../../lib/types';
import type { DemoControl, Scenario } from '../../../lib/types';
import { understand } from '../../../lib/intent';
import { queueVerifiedStripeEvent } from '../../../lib/webhooks';
import { Shopping, type ShoppingConfirmation } from '../../../lib/shopping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
function json(value: unknown, status = 200) { return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
function keys(body: Record<string, unknown>, allowed: string[]) { if (Object.keys(body).some(k => !allowed.includes(k))) throw new AppError(400, 'Unexpected client field. Amounts and payment state are server-owned.'); }
async function handleWithStore(request: Request, store: Store) {
  try {
    const service = new Commerce(store);
    const parts = new URL(request.url).pathname.slice(5).split('/');
    if (parts.join('/') === 'webhooks/stripe' && request.method === 'POST') {
      if (!process.env.STRIPE_WEBHOOK_SECRET) throw new AppError(503, 'Webhook secret not configured. Authoritative retrieval is available.');
      let event;
      const raw = await request.text(); if (raw.length > 262144) throw new AppError(413, 'Webhook body too large.');
      try { event = stripeClient().webhooks.constructEvent(raw, request.headers.get('stripe-signature') || '', process.env.STRIPE_WEBHOOK_SECRET); }
      catch { throw new AppError(400, 'Invalid Stripe webhook signature.'); }
      if (event.livemode) throw new AppError(400, 'Live webhooks are rejected.');
      return json({ received: true, ...queueVerifiedStripeEvent(store, event) });
    }
    let body: Record<string, unknown> = {};
    if (request.method === 'POST') {
      sameOrigin(request);
      const raw = await request.text(); if (raw.length > 10000) throw new AppError(413, 'Request too large.');
      try { body = JSON.parse(raw || '{}'); } catch { throw new AppError(400, 'Invalid JSON.'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new AppError(400, 'JSON object required.');
    }
    if (parts[0] === 'login' && request.method === 'POST') {
      keys(body, ['account', 'password']);
      publicQuota(store, request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown', 'login');
      const token = login(store, String(body.account || 'demo-buyer'), String(body.password || ''));
      const response = json({ account: body.account || 'demo-buyer', auth: 'DEMO AUTH' });
      response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cloudMode() || new URL(request.url).protocol === 'https:', path: '/', maxAge: 12 * 3600 }); return response;
    }
    const owner = ownerFrom(store, request.headers.get('cookie'));
    if (parts[0] === 'session') return json({ owner, auth: 'DEMO AUTH', publicDemo: cloudMode(), provider: configuredProvider(), ai: process.env.AI_API_KEY && process.env.AI_MODEL ? 'configured' : 'deterministic' });
    if (parts[0] === 'shopping') {
      const shopping = new Shopping(store);
      if (request.method === 'GET' && parts[1]) return json(shopping.get(parts[1], owner));
      if (request.method !== 'POST') throw new AppError(405, 'POST is required.');
      publicQuota(store, owner, 'ai');
      if (!parts[1]) { keys(body, ['text', 'parentShoppingId', 'parentRunId']); return json(await shopping.draft(owner, String(body.text || ''), typeof body.parentShoppingId === 'string' ? body.parentShoppingId : undefined, typeof body.parentRunId === 'string' ? body.parentRunId : undefined), 201); }
      if (parts[2] === 'confirm') { keys(body, ['category', 'currency', 'budgetMinor', 'officialWarranty', 'deliveryBefore', 'rankingPreference']); return json(await shopping.confirm(parts[1], owner, body as unknown as ShoppingConfirmation)); }
      throw new AppError(404, 'Shopping endpoint not found.');
    }
    if (parts[0] !== 'runs') throw new AppError(404, 'Endpoint not found.');
    const id = parts[1], action = parts[2];
    if (request.method === 'GET') {
      if (!id) return json(service.list(owner));
      if (action === 'offers') return json(service.offers(id, owner));
      return json(service.get(id, owner));
    }
    if (!id) {
      keys(body, ['text', 'budgetMinor', 'officialWarranty', 'deliveryBefore', 'shoppingId']);
      if (typeof body.text !== 'string' || typeof body.budgetMinor !== 'number' || typeof body.officialWarranty !== 'boolean' || typeof body.deliveryBefore !== 'string') throw new AppError(400, 'Confirm text, integer budget, warranty and delivery date.');
      const fields = { budgetMinor: body.budgetMinor, officialWarranty: body.officialWarranty, deliveryBefore: body.deliveryBefore };
      if (typeof body.shoppingId === 'string') {
        const shopping = new Shopping(store).get(body.shoppingId, owner);
        if (!shopping.confirmed || fields.budgetMinor !== shopping.confirmed.budgetMinor || fields.officialWarranty !== shopping.confirmed.officialWarranty || fields.deliveryBefore !== shopping.confirmed.deliveryBefore) throw new AppError(409, 'Use the confirmed shopping constraints; revise in a new version.');
        return json(service.create(owner, shopping.input, fields, shopping.confirmed, shopping), 201);
      }
      publicQuota(store, owner, 'ai');
      return json(service.create(owner, body.text, fields, await understand(body.text, fields)), 201);
    }
    if (action === 'quote') {
      keys(body, ['merchantId']);
      const run = service.get(id, owner);
      // Account comes from the authenticated provider, never the browser or model.
      const accountId = run.providerMode === 'stripe' ? await new StripePaymentProvider().accountId() : undefined;
      return json(service.quote(id, owner, String(body.merchantId), accountId));
    }
    if (action === 'approve') { keys(body, ['mandateId', 'hash']); return json(service.approve(id, owner, String(body.mandateId), String(body.hash))); }
    if (action === 'commit') { keys(body, []); return json(service.commit(id, owner)); }
    if (action === 'scenario') { keys(body, ['scenario']); return json(service.scenario(id, owner, body.scenario as Scenario)); }
    if (action === 'demo-control') { keys(body, ['action']); return json(service.demoControl(id, owner, body.action as DemoControl)); }
    if (action === 'revoke') { keys(body, []); return json(service.revoke(id, owner)); }
    if (action === 'local-webhook') {
      keys(body, ['eventId']); const run = service.get(id, owner);
      if (run.providerMode !== 'local' || typeof body.eventId !== 'string' || body.eventId.length > 100) throw new AppError(400, 'Local webhook simulator only.');
      return json({ handled: service.webhook(`local_event_${body.eventId}`, id) });
    }
    throw new AppError(404, 'Endpoint not found.');
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    // Provider exceptions can contain request details. Do not return or log them.
    return json({ error: 'Request could not be completed. No payment success is implied. Check persisted transaction state.' }, 500);
  }
}
async function handle(request: Request) {
  try {
    const response = await withLedger(store => handleWithStore(request, store));
    if (cloudMode() && response.ok && (new URL(request.url).pathname.startsWith('/api/runs') || new URL(request.url).pathname === '/api/webhooks/stripe')) {
      after(async () => { try { await drainCloudJobs(); } catch { console.error('Cloud job continuation deferred; durable ledger retained.'); } });
    }
    return response;
  } catch (error) {
    return json({ error: error instanceof AppError ? error.message : 'Durable ledger unavailable. No payment success is implied; retry the same purchase.' }, error instanceof AppError ? error.status : 503);
  }
}
export const GET = handle;
export const POST = handle;
