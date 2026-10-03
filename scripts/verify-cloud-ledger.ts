import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeCloudLedger, withLedger } from '../lib/cloud-ledger';
import { Commerce } from '../lib/service';
import type { Run, Scenario } from '../lib/types';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required privately.');
process.env.CROSSCART_PUBLIC_DEMO = 'true';
try {
  if (process.argv[2] === '--reopen') {
    const run = await withLedger(store => new Commerce(store).get(process.argv[3]));
    process.stdout.write(JSON.stringify({ id: run.id, state: run.status, paymentId: run.paymentId, orderId: run.orderId, approvalHash: run.approval!.hash }));
  } else {
    const owner = `cloud-validation:${randomUUID()}`;
    const runs: Run[] = [];
    for (const scenario of ['happy', 'price_drift', 'order_failure'] as Scenario[]) {
      const run = await withLedger(store => {
        const c = new Commerce(store, 'local'); let r = c.create(owner, 'HK$1,800 headphones'); r = c.quote(r.id, owner, 'merchant_a'); r = c.approve(r.id, owner, r.mandate!.id, r.mandate!.hash); c.scenario(r.id, owner, scenario); return c.commit(r.id, owner);
      }); runs.push(run);
    }
    await Promise.all([withLedger(s => new Commerce(s).commit(runs[0].id, owner)), withLedger(s => new Commerce(s).commit(runs[0].id, owner))]);
    for (let i = 0; i < 8; i++) await Promise.all([withLedger(s => new Commerce(s).processOne()), withLedger(s => new Commerce(s).processOne())]);
    const settled = await withLedger(store => runs.map(run => new Commerce(store).get(run.id, owner)));
    assert.equal(settled[0].status, 'CONFIRMED'); assert.equal(settled[1].status, 'BLOCKED'); assert.equal(settled[1].paymentId, undefined); assert.equal(settled[2].recoveryState, 'REFUNDED');
    await withLedger(store => { assert.equal(store.list<{ runId: string }>('merchant_order').filter(order => order.runId === runs[0].id).length, 1); assert.throws(() => new Commerce(store).get(runs[0].id, 'other'), /another demo account/); });
    const marker = randomUUID();
    await assert.rejects(withLedger(store => { store.put('rollback-probe', marker, true); throw new Error('Intentional rollback'); }), /Intentional rollback/);
    assert.equal(await withLedger(store => store.get('rollback-probe', marker)), undefined);
    const reopened = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/verify-cloud-ledger.ts', '--reopen', settled[0].id], { env: process.env, encoding: 'utf8' }));
    assert.equal(reopened.paymentId, settled[0].paymentId); assert.equal(reopened.approvalHash, settled[0].approval!.hash);
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Actual PostgreSQL persistence/concurrency with explicitly LOCAL simulated payments; not Stripe', concurrentWorkerAndDuplicateCommit: 'PASS', transactionRollback: 'PASS', ownership: 'PASS', separateProcessReopen: 'PASS', cases: settled.map(r => ({ id: r.id, status: r.status, payment: r.paymentState, order: r.orderState, recovery: r.recoveryState })) }, null, 2));
  }
} finally { await closeCloudLedger(); }
