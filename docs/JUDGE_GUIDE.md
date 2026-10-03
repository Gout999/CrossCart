# Judge walkthrough

**Track selection:** FinTech: Agentic Commerce (Sponsored by The Club by HKT).

CrossCart's contribution is a verifiable execution boundary for an AI shopper: exact consent, changed-deal rejection and payment/order/refund reconciliation. It extends search into a controlled purchase, without allowing a model to decide payment truth.

## Required demonstrations

1. **Complete transaction:** default HK$1,800 headphones request; confirm interpretation and date; choose Merchant A; approve exact HK$1,749; execute; complete official Stripe test Checkout. Look for **CAPTURED / CONFIRMED / NONE**.
2. **Blocked transaction:** fresh request and approval; select **Price changes +HK$100** before execution. Look for original HK$1,749 approval, current HK$1,849, **BLOCKED / NOT EXECUTED** and no Checkout.
3. **Authorization and rules:** expand **Judge evidence** on both runs. Inspect mandate hash/version, approval actor/time, exact payee/total, policy checks, state transitions and provider references. No free-form AI output is payment authority.
4. **Manual comparison:** open `/benchmark`. Complete the same-task manual layout and CrossCart layout. The correct comparison sequence has 4 versus 1 navigation actions. It excludes shared intent/approval/Checkout and uses synthetic merchants; browser timings are individual walkthrough observations, not user-study findings.
5. **Sources and observations:** open `/evidence` or [Financial sources](FINANCIAL_SOURCES.md). The demo applies no rewards. Processing fees are a sourced merchant-side illustration, not buyer savings or a test-mode invoice.

## Recovery extension

Choose **Captured → order fails** on a fresh approved purchase. After test Checkout, verify payment CAPTURED, order FAILED and retrieved refund REFUNDED. A failed order never becomes a successful purchase just because the payment succeeded.

## Mobile

Use the public HTTPS link in Safari or Chrome. Keep the same browser for the payment return; closing or switching browsers does not share its HTTP-only session. Return-page text is not payment proof: the result and signed webhook reconcile actual provider objects. Synthetic billing details only.

## Evidence limits

Official Stripe sandbox is real provider interaction; no real money moves. Products, sellers and orders are simulated adapters. No real retailer comparisons, HKT merchant integration, Clubpoints payout or government identity verification is claimed. Live cloud acceptance must be recorded separately from the earlier local sandbox evidence.
