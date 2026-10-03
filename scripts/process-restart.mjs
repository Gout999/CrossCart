import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Exercise actual production app + worker processes, not just a database reopen.
const origin = 'http://127.0.0.1:3117';
const folder = mkdtempSync(join(tmpdir(), 'crosscart-process-'));
const dbPath = join(folder, 'restart.sqlite');
const evidence = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence';
mkdirSync(evidence, { recursive: true });
writeFileSync(join(evidence, 'process-restart.log'), 'Production app + worker restart verification (LOCAL TEST ADAPTER)\n');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let app, cookie;
async function start() {
  app = spawn(process.execPath, ['scripts/serve.mjs', 'start'], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3117', APP_URL: origin, PAYMENT_PROVIDER: 'local', CROSSCART_DB: dbPath, DEMO_PASSWORD: 'crosscart-demo' }
  });
  for (const stream of [app.stdout, app.stderr]) stream.on('data', data => appendFileSync(join(evidence, 'process-restart.log'), data));
  app.on('error', () => {});
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error('Production app exited before readiness.');
    try { if ((await fetch(origin)).ok) return; } catch { /* Wait for task-owned app. */ }
    await pause(100);
  }
  throw new Error('Production app readiness timed out.');
}
async function stop() {
  if (!app) return;
  const child = app; app = undefined;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  for (let i = 0; i < 30 && child.exitCode === null; i++) await pause(100);
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* All task-owned children stopped. */ }
}
async function request(path, body) {
  const response = await fetch(`${origin}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  assert.ok(response.ok, `HTTP ${response.status} on ${path}`);
  if (path === 'login') cookie = response.headers.get('set-cookie').split(';')[0];
  return response.json();
}
async function until(id, predicate) {
  for (let i = 0; i < 300; i++) {
    const run = await request(`runs/${id}`);
    if (predicate(run)) return run;
    await pause(20);
  }
  throw new Error('Expected durable transaction state did not appear.');
}
try {
  await start();
  await request('login', { account: 'demo-buyer', password: 'crosscart-demo' });
  const date = new Date(Date.now() + 2 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' });
  let run = await request('runs', { text: 'HK$1,800 headphones, official warranty', budgetMinor: 180000, officialWarranty: true, deliveryBefore: date });
  run = await request(`runs/${run.id}/quote`, { merchantId: 'merchant_a' });
  run = await request(`runs/${run.id}/approve`, { mandateId: run.mandate.id, hash: run.mandate.hash });
  await request(`runs/${run.id}/scenario`, { scenario: 'capture_timeout' });
  await request(`runs/${run.id}/commit`, {});
  const unknown = await until(run.id, r => r.paymentState === 'UNKNOWN');
  assert.equal(unknown.recoveryState, 'RECONCILING');
  await stop();
  await start();
  const resumed = await until(run.id, r => r.status === 'CONFIRMED');
  assert.equal(resumed.paymentId, unknown.paymentId);
  assert.equal(resumed.paymentState, 'CAPTURED'); assert.equal(resumed.orderState, 'CONFIRMED');
  await stop();
  await start();
  const restored = await request(`runs/${run.id}`);
  assert.equal(restored.paymentId, resumed.paymentId); assert.equal(restored.orderId, resumed.orderId);
  assert.equal(restored.mandate.hash, resumed.mandate.hash); assert.deepEqual(restored.events, resumed.events);
  await request(`runs/${run.id}/commit`, {}); // Retry after a complete server restart.
  const db = new DatabaseSync(dbPath);
  const counts = Object.fromEntries(['local_payment', 'merchant_order', 'local_refund'].map(kind => [kind, db.prepare('SELECT count(*) AS n FROM records WHERE kind=?').get(kind).n]));
  db.close();
  assert.deepEqual(counts, { local_payment: 1, merchant_order: 1, local_refund: 0 });
  const report = { checkedAt: new Date().toISOString(), result: 'PASS', tests: 1, adapter: 'LOCAL TEST ADAPTER', productionProcessStarts: 3, sessionRestored: true, runId: run.id, beforeRestart: { payment: unknown.paymentState, recovery: unknown.recoveryState, paymentId: unknown.paymentId }, afterRestart: { payment: restored.paymentState, order: restored.orderState, paymentId: restored.paymentId, orderId: restored.orderId }, duplicateCommitAfterRestart: 'No additional payment or order', counts };
  writeFileSync(join(evidence, 'process-restart.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await stop(); rmSync(folder, { recursive: true, force: true }); }
