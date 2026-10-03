import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Store } from '../lib/store';
import { Shopping } from '../lib/shopping';
import { deliveryDefault } from '../lib/policy';
const folder = `${process.env.CROSSCART_EVIDENCE_DIR || 'output/evidence/2026-10-03-round2'}/live-ai`;
mkdirSync(folder, { recursive: true });
if (!process.env.AI_API_KEY || !process.env.AI_MODEL) throw new Error('Configure the model privately before live verification.');
const store = new Store(':memory:'), shopping = new Shopping(store);
const cases = [
  { name: 'cantonese-official', text: '幫我搵千八蚊以下嘅耳機，要官方保養，兩日內收到，最平嗰個。', expected: 'demo_offer_a_v1', warranty: true, budget: 180000 },
  { name: 'english-third-party', text: 'Find headphones under HKD 1800 total including delivery, third-party warranty is okay, within 2 days. Choose the cheapest.', expected: 'demo_offer_b_v1', warranty: false, budget: 180000 },
  { name: 'revision-fastest', text: '預算加到二千蚊，仍然要官方保養，揀最快送到嘅。', expected: 'demo_offer_c_v1', warranty: true, budget: 200000 }
];
let parent: string | undefined; const reports = [];
for (const c of cases) {
  const draft = await shopping.draft('demo-buyer', c.text, c.name === 'revision-fastest' ? parent : undefined);
  writeFileSync(`${folder}/${c.name}-draft.json`, JSON.stringify(draft, null, 2));
  assert.equal(draft.parseMode, 'live-ai', `live parse failed: ${draft.fallbackReason}`);
  assert.equal(draft.proposal.budgetMinor, c.budget); assert.equal(draft.proposal.officialWarranty, c.warranty);
  const result = await shopping.confirm(draft.id, 'demo-buyer', { category: 'headphones', currency: 'hkd', budgetMinor: c.budget, officialWarranty: c.warranty, deliveryBefore: draft.proposal.deliveryBefore || deliveryDefault() });
  writeFileSync(`${folder}/${c.name}.json`, JSON.stringify(result, null, 2));
  assert.equal(result.comparisonMode, 'live-ai', `live ranking failed: ${result.fallbackReason}`);
  assert.equal(result.comparison!.recommendation.rankedOfferIds[0], c.expected);
  if (c.name === 'cantonese-official') parent = result.id;
  reports.push({ case: c.name, input: c.text, shoppingId: result.id, version: result.version, parse: result.proposal, chosen: c.expected, comparisonMode: result.comparisonMode, latencyMs: result.latencyMs, tokens: result.tokenUsage, tools: result.tools });
  console.log(`${c.name}: live parse + read-only model tools passed; ${c.expected}; ${result.latencyMs}ms`);
}
writeFileSync(`${folder}/verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), model: process.env.AI_MODEL, scope: 'Actual model requests; synthetic merchant adapters; no payment authority', passed: reports.length, cases: reports }, null, 2));
store.close();
