import Link from 'next/link';
import { catalogue } from '../../lib/merchants';
import { deliveryDefault, reasons } from '../../lib/policy';
import { Benchmark } from './walkthrough';
export const dynamic = 'force-dynamic';
export default function Page() {
  const deadline = deliveryDefault();
  const intent = { text: '', budgetMinor: 180000, officialWarranty: true, deliveryBefore: deadline, parser: 'deterministic' as const, explanation: '' };
  const offers = catalogue().map(offer => ({ ...offer, failures: reasons(offer, intent) }));
  return <main className="guide-page"><Link className="guide-back" href="/">← CrossCart</Link><p className="eyebrow">HKT / REPRODUCIBLE WORKFLOW COMPARISON</p><h1>Same task.<br/><em>Less switching.</em></h1><p className="guide-lead">Compare three offers under HK$1,800, with official warranty and delivery by {deadline}. Try both layouts with the same synthetic catalogue.</p><Benchmark offers={offers}/><section className="guide-section"><h2>What this measures</h2><p>One navigation action is one button press after Start. Manual mode presents one merchant at a time: next merchant, next merchant, open selection, choose Merchant A (4 actions). CrossCart presents one normalized comparison: choose Merchant A (1 action). Both modes have the same three offers and constraints.</p><p>The timed boundary is offer comparison only. Intent confirmation, exact purchase approval and Stripe Checkout remain required in the working transaction flow. Browser elapsed time includes reading and pauses; no human-study time saving is claimed.</p><p>Merchant A costs HK$1,749 in both modes. This is a comparison-layout benchmark, not a claim of better prices, real retailer access or guaranteed time savings. This benchmark uses the same deterministic rules as the payment flow; it does not call a model.</p></section><Link href="/evidence">View transaction proof and financial sources →</Link></main>;
}
