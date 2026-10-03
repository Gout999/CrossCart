import Link from 'next/link';

export const metadata = { title: 'CrossCart · Recorded demo and pitch deck' };

export default function DemoPage() {
  return <main className="guide-page materials-page">
    <Link className="guide-back" href="/">← CrossCart</Link>
    <p className="eyebrow">HacKU / FINTECH: AGENTIC COMMERCE</p>
    <h1>The demo.<br/><em>The details.</em></h1>
    <p className="guide-lead">A three-minute walkthrough of exact purchase approval, official Stripe test Checkout, a blocked transaction, audit evidence and the same-task comparison.</p>
    <video className="demo-film" controls playsInline preload="metadata" poster="/crosscart-demo-poster.jpg" aria-label="CrossCart three-minute recorded demonstration">
      <source src="/CrossCart-Demo-3min.mp4" type="video/mp4" />
      <track kind="captions" src="/CrossCart-Demo-English.vtt" srcLang="en" label="English" />
      Your browser does not support this video. <a href="/CrossCart-Demo-3min.mp4">Download the recorded demo</a>.
    </video>
    <p className="fine-print">Edited recording of the public HTTPS demo, with generated English narration. Stripe test mode only. Products, merchant offers and orders are synthetic. The recovery screenshot comes from an independently verified public Stripe test case.</p>
    <section className="guide-section">
      <h2>Pitch deck</h2>
      <p>The eleven-slide deck covers the problem, agent workflow, exact consent, transaction results, comparison benchmark, dated financial sources and proposed HKT pilot.</p>
      <div className="materials-links"><a href="/CrossCart-Pitch-Deck.pdf" target="_blank" rel="noopener noreferrer">View pitch deck PDF ↗</a><a href="/CrossCart-Pitch-Deck.pptx" download>Download editable PowerPoint ↓</a></div>
    </section>
    <section className="guide-section">
      <h2>Try the working transactions</h2>
      <p>Open the live demo, sign in as Demo buyer with <strong>crosscart-demo</strong>, and use Stripe test card <strong>4242 4242 4242 4242</strong>, a future expiry and any CVC. Use synthetic billing details.</p>
      <div className="materials-links"><Link href="/">Open live demo →</Link><Link href="/evidence">Read judge guide →</Link><Link href="/benchmark">Try manual comparison →</Link><a href="https://github.com/Gout999/CrossCart" target="_blank" rel="noopener noreferrer">Public source repository ↗</a></div>
    </section>
  </main>;
}
