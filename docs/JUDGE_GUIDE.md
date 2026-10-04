# Judge walkthrough

**Track selection:** FinTech: Agentic Commerce (Sponsored by The Club by HKT).

CrossCart's contribution is a verifiable execution boundary for an AI shopper: exact consent, changed-deal rejection and payment/order/refund reconciliation. It extends search into a controlled purchase, without allowing a model to decide payment truth.

## Required demonstrations

1. **Complete transaction:** default HK$1,800 headphones request; confirm interpretation and date; choose Merchant A; approve exact HK$1,749; execute; complete official Stripe test Checkout. Look for **CAPTURED / CONFIRMED / NONE**.
2. **Blocked transaction:** fresh request and approval; select **Price changes +HK$100** before execution. Look for original HK$1,749 approval, current HK$1,849, **BLOCKED / NOT EXECUTED** and no Checkout.
3. **Authorization and rules:** expand **Judge evidence** on both runs. Inspect mandate hash/version, approval actor/time, exact payee/total, policy checks, state transitions and provider references. No free-form AI output is payment authority.
4. **Manual comparison:** open `/benchmark`. Complete the same-task manual layout and CrossCart layout. The correct comparison sequence has 4 versus 1 navigation actions. It excludes shared intent/approval/Checkout and uses synthetic merchants; browser timings are individual walkthrough observations, not user-study findings.
5. **Sources and observations:** open `/evidence` or [Financial sources](FINANCIAL_SOURCES.md). The demo applies no rewards. Processing fees are a sourced merchant-side illustration, not buyer savings or a test-mode invoice.

## Request variations

On the intent screen, choose **EN** or **中文** and click a starter. **Spend less** chooses the cheaper third-party-warranty Merchant B; **Speed comes first** chooses the faster Merchant C; **A firm budget** has no eligible result. Review the fields and change the ranking priority to show that speed and price are separate preferences, applied after hard constraints.

For the strongest consent example, use **Room in the budget**: approve Merchant A at HK$1,749 with a HK$1,900 search budget, then select **Price changes +HK$100**. HK$1,849 is still within the budget, but the changed exact deal is blocked. No automatic payment permission comes from the budget.

Click **Revise request** to try a short follow-up. Only explicitly changed requirements change, and a new version needs its own approval. The six starters are variations on the synthetic headphone catalogue, not additional real products or retailers.

## Recovery extension

Choose **Captured → order fails** on a fresh approved purchase. After test Checkout, verify payment CAPTURED, order FAILED and retrieved refund REFUNDED. A failed order never becomes a successful purchase just because the payment succeeded.

## Mobile

Use the public HTTPS link in Safari or Chrome. Keep the same browser for the payment return; closing or switching browsers does not share its HTTP-only session. Return-page text is not payment proof: the result and signed webhook reconcile actual provider objects. Synthetic billing details only.

## Evidence limits

Official Stripe sandbox is real provider interaction; no real money moves. Products, sellers and orders are simulated adapters. No real retailer comparisons, HKT merchant integration, Clubpoints payout or government identity verification is claimed. Public-cloud acceptance is recorded in [Validation](VALIDATION.md), separately from the earlier local sandbox evidence.
