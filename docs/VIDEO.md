# CrossCart recorded demonstration

Recorded from the public HTTPS demo on 4 October 2026 Hong Kong time. Edited with Remotion to 180 seconds at 1920×1080 / 30 fps.

## Voice, captions and editing

The revised narration uses **en-US-AndrewMultilingualNeural** via [edge-tts](https://github.com/rany2/edge-tts), which accesses Microsoft Edge online text-to-speech without an API key. No paid voice subscription was used. The script uses shorter spoken clauses and questions to introduce the blocked and recovery scenarios.

English captions are burned into the video and are available separately as WebVTT. They use the voice stream's word-boundary timestamps, grouped into 67 phrases at meaningful clause boundaries, with punctuation and at most two lines. Captions occupy a dedicated lower band, clear of the transaction evidence. The native player caption track is optional because captions already appear in the film.

Frame-driven Remotion animations add focused zooms on approval and blocked-payment details, amount and rule callouts, entrance motion, nine paper transitions and a gently rotating closing card. Original browser footage supplies the transaction actions; these animations do not fabricate app behavior. The introduction uses the supplied pitch-deck cover as an illustrative visual.

The purchase and blocked-transaction clips are actual public app interactions. Stripe billing details and the card are synthetic test data. The audit excerpt and refund screenshot are from independently verified public Stripe test cases, identified in [cloud acceptance](cloud-acceptance.json). No live merchant, goods, points payout or real money is represented.

## Narration

### 1. Intro (12 seconds)

This is CrossCart. Let AI compare. You keep the final say. A shopping agent that asks you to approve one exact deal, before any payment.

### 2. Compare (20 seconds)

First, the buyer asks in Cantonese for headphones under eighteen hundred Hong Kong dollars, with official warranty and delivery within two days. CrossCart interprets the request, and the buyer confirms it. The cheapest offer has a third-party warranty. So it fails the requirement.

### 3. Approval (17 seconds)

Merchant A meets the requirements at seventeen forty-nine, including delivery. Now the buyer approves this exact deal. Product, seller, payee, amount and terms are recorded together. The agent compares. Server rules control the payment.

### 4. Checkout (20 seconds)

Next, the buyer opens official Stripe test Checkout and enters synthetic test details. Stripe authorizes the approved amount. Before capture, CrossCart checks the mandate and merchant quote again. This is the actual Stripe sandbox. No real money or goods move.

### 5. Result (16 seconds)

Payment is captured. The demo order is confirmed. These are separate states, with a traceable record. You can inspect the buyer's approval and the rules checked before payment and capture. The browser message alone isn't payment proof.

### 6. Blocked (22 seconds)

What if the price changes? The buyer approved seventeen forty-nine. The current offer is eighteen forty-nine. CrossCart stops before Checkout. Payment is not executed. The original approval stays unchanged. A different deal needs a fresh decision.

### 7. Recovery (13 seconds)

And if the merchant fails after capture? The order stays failed. CrossCart tracks recovery separately, and retrieves the same-charge refund from Stripe. Only then does it show refund confirmed.

### 8. Benchmark (22 seconds)

Now compare the same task. Three offers. The same choice. The manual layout takes four navigation actions. CrossCart takes one selection. This measures the comparison stage, with shared approval and Checkout excluded. Browser time is visible, but it isn't a human study.

### 9. Sources (20 seconds)

The judge guide links dated primary sources for processing fees, card rewards and Clubpoints. The fee estimate belongs to the merchant. Reward eligibility is unverified, so no rebate or points discount is subtracted from the buyer's approved total.

### 10. Close (18 seconds)

The public demo runs on Vercel HTTPS, with a persistent Neon ledger. A signed webhook completed an order even without the browser return. Products and orders are synthetic. HKT integration is the next proposed step.

Browser timings in the comparison recording include scripted pauses. They are individual walkthrough observations, not human-study outcomes. The comparison action count excludes shared intent, approval and Checkout.
