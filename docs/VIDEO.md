# CrossCart recorded demonstration

Recorded from the public HTTPS demo on 4 October 2026 Hong Kong time. Edited to 180 seconds at 1920×1080 / 30 fps, with generated English narration. Chapter captions and an English WebVTT track accompany the footage.

The purchase and blocked-transaction clips are actual public app interactions. Stripe billing details and the card are synthetic test data. The audit excerpt and refund screenshot are from independently verified public Stripe test cases, identified in [cloud acceptance](cloud-acceptance.json). No live merchant, goods, points payout or real money is represented.

## 1. Intro (12 seconds)

CrossCart is a shopping agent built for HacKU agentic commerce. It compares offers, asks you to approve one exact deal, and keeps payment and recovery traceable.

## 2. Compare (20 seconds)

The buyer asks in Cantonese for headphones below eighteen hundred Hong Kong dollars, with official warranty and delivery within two days. The agent interprets the request, and the buyer confirms it. Merchant B costs less, but its third-party warranty fails the requirement.

## 3. Approval (17 seconds)

Merchant A meets the confirmed requirements at seventeen forty-nine, including delivery. The approval records the exact product, seller, payee, amount and terms. The AI uses read-only shopping tools. Server rules control payment authority.

## 4. Checkout (20 seconds)

The buyer opens official Stripe test Checkout and enters synthetic test details. Stripe authorizes the exact approved amount. CrossCart then rechecks the mandate and merchant quote before capture. This is the real Stripe sandbox, with no real money or goods.

## 5. Result (16 seconds)

The result shows captured payment and a confirmed demo order as separate states. Judge evidence records the mandate, approval, rules and verified webhook receipts. A browser return message alone never establishes payment success.

## 6. Blocked (22 seconds)

Now the approved price changes from seventeen forty-nine to eighteen forty-nine. CrossCart blocks the purchase before opening Checkout. Payment remains not executed. The original approval stays unchanged, and the buyer can inspect the rejected amount and rule decision.

## 7. Recovery (13 seconds)

A third verified scenario captures payment, then simulates merchant order failure. The order stays failed. CrossCart retrieves the same-charge refund from Stripe before showing refund confirmed.

## 8. Benchmark (22 seconds)

The comparison benchmark uses the same three synthetic offers and the same final choice. The manual layout requires four navigation actions. The CrossCart table requires one selection. It records browser time, but this is a comparison-stage walkthrough, with shared approval and Checkout excluded.

## 9. Sources (20 seconds)

The judge guide links dated primary sources for processing fees, card rewards and Clubpoints. The domestic-card fee estimate belongs to the merchant. Reward eligibility is unverified, so no rebate or points discount reduces the approved buyer total.

## 10. Close (18 seconds)

The demo uses Vercel HTTPS, a persistent Neon ledger and separate visitor sessions. A signed webhook completed an order with no browser return. Products and orders remain synthetic. HKT integration is the next proposed step.

Browser timings in the comparison recording include scripted pauses. They are individual walkthrough observations, not human-study outcomes. The comparison action count excludes shared intent, approval and Checkout.
