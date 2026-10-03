import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../lib/store';
import { Commerce } from '../lib/service';
import type { Run, Scenario } from '../lib/types';
const folder = mkdtempSync(join(tmpdir(), 'crosscart-evidence-')); const store = new Store(join(folder, 'evidence.sqlite')); const service = new Commerce(store, 'local');
const cases: Record<string, Run> = {};
for (const scenario of ['happy', 'price_drift', 'order_failure'] as Scenario[]) {
  let run = service.create('evidence-buyer', 'HK$1,800 以下耳機，要官方保養');
  run = service.quote(run.id, 'evidence-buyer', 'merchant_a');
  run = service.approve(run.id, 'evidence-buyer', run.mandate!.id, run.mandate!.hash);
  service.scenario(run.id, 'evidence-buyer', scenario); service.commit(run.id, 'evidence-buyer');
  for (let i = 0; i < 20 && service.get(run.id).stage !== 'DONE'; i++) await service.processOne();
  cases[scenario] = service.get(run.id);
}
const report = { generatedAt: new Date().toISOString(), adapter: 'LOCAL TEST ADAPTER', officialStripeSandboxVerified: false, cases, counts: { paymentObjects: store.list('local_payment').length, merchantOrders: store.list('merchant_order').length, refunds: store.list('local_refund').length } };
const output = process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence';
mkdirSync(output, { recursive: true }); writeFileSync(`${output}/local-demo.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ adapter: report.adapter, officialStripeSandboxVerified: false, cases: Object.fromEntries(Object.entries(cases).map(([k, r]) => [k, { runId: r.id, status: r.status, payment: r.paymentState, order: r.orderState, recovery: r.recoveryState, paymentId: r.paymentId, refundId: r.refundId }])) }, null, 2));
store.close(); rmSync(folder, { recursive: true });
