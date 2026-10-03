# HacKU final submission

## Required public links

| Form field | Public link |
| --- | --- |
| Repository | https://github.com/Gout999/CrossCart |
| Live demo | https://crosscart.vercel.app/ |
| Recorded demonstration | https://crosscart.vercel.app/demo |
| Pitch Deck PDF | https://crosscart.vercel.app/CrossCart-Pitch-Deck.pdf |
| Editable PowerPoint | https://crosscart.vercel.app/CrossCart-Pitch-Deck.pptx |

Select **FinTech: Agentic Commerce (Sponsored by The Club by HKT)** as the problem statement for The Club by HKT Innovation Award.

**Demo access:** Demo buyer / `crosscart-demo`. Official Stripe test card `4242 4242 4242 4242`, future expiry, any CVC. Synthetic billing details only.

The supplied official form states a deadline of **4 October 2026 at 13:00 Hong Kong time**. This document prepares the fields; it is not a submission receipt. No declaration of Raccoon usage is included because usage has not been evidenced.

## Project title

CrossCart — Exact Consent for Agentic Commerce

## Short description

CrossCart turns an AI shopping request into a verifiable purchase. The agent interprets Cantonese or English, compares three merchant offers, and asks the buyer to approve one exact deal. Server rules bind approval to the seller, payee, product, delivered total, warranty, delivery and terms. A changed price stops payment and requires fresh consent.

The public demo completes official Stripe test Checkout with manual authorization/capture, blocks a changed HK$1,849 offer after HK$1,749 approval, and recovers a captured payment when a synthetic merchant order fails. Its audit trail records buyer approval, mandate integrity, policy decisions, provider references and signed webhook receipts. A same-task comparison shows four versus one comparison actions, with shared approval and Checkout excluded. Dated primary sources explain processing fees and conditional rewards, with no invented discount applied.

The demo runs on Vercel HTTPS with a dedicated Neon ledger and separate visitor sessions. Merchants, products and orders are synthetic. No real money, HKT merchant integration or Clubpoints account connection is represented.

## Judge shortcuts

- [Transaction walkthrough and dated financial sources](https://crosscart.vercel.app/evidence)
- [Manual comparison benchmark](https://crosscart.vercel.app/benchmark)
- [Dated validation and evidence boundaries](VALIDATION.md)
