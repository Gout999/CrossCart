import { demoOrigin } from './network.mjs';
import { deliveryDefault } from '../lib/policy';
const { url } = demoOrigin(); let cookie = '';
async function post(path: string, data: unknown) {
  const response = await fetch(`${url.origin}/api/${path}`, { method: 'POST', headers: { Origin: url.origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(`Fresh demo request failed: ${path} HTTP ${response.status}. No payment success is implied.`);
  if (path === 'login') cookie = response.headers.get('set-cookie')!.split(';')[0];
  return response.json();
}
await post('login', { account: 'demo-buyer', password: process.env.DEMO_PASSWORD || 'crosscart-demo' });
const text = '幫我搵 HK$1800 以下嘅耳機，要官方保養，兩日內收到。';
const draft = await post('shopping', { text });
const fields = { category: 'headphones', currency: 'hkd', budgetMinor: 180000, officialWarranty: true, deliveryBefore: deliveryDefault() };
await post(`shopping/${draft.id}/confirm`, fields);
const run = await post('runs', { shoppingId: draft.id, text, budgetMinor: fields.budgetMinor, officialWarranty: fields.officialWarranty, deliveryBefore: fields.deliveryBefore });
if (run.status !== 'COMPARING' || run.approval || run.sessionId || run.paymentId) throw new Error('Fresh demo must be an unapproved comparison only.');
console.log(`Fresh unapproved comparison: ${url.origin}/?run=${run.id}`);
console.log('Three built-in synthetic offers seeded. Previous purchases, jobs and audit records preserved.');
