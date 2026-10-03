# Validation record

## Public deployment: 4 October 2026, Hong Kong time

**Live URL:** [crosscart.vercel.app](https://crosscart.vercel.app/)
**Public repository:** [Gout999/CrossCart](https://github.com/Gout999/CrossCart)
**Transaction-test source:** `3bf8846` (subsequent submission-asset changes do not rebuild the transaction coordinator).

The canonical production URL and repository both returned anonymous HTTP 200. Vercel uses Node 24 in Singapore (`sin1`) with a dedicated Neon Free PostgreSQL ledger. Preview deployment SSO remains enabled. The canonical production alias is public.

- **8/8 public HTTPS official Stripe sandbox browser cases passed.** Verified exact HK$1,749 capture and confirmed synthetic order, HK$1,849 price rejection before Checkout, same-charge HK$1,749 refund, quote withdrawal/cancellation, preserved accepted quote after catalogue update, mobile viewport, English Merchant B and revised Merchant C.
- **1 additional focused webhook case passed.** It blocked the browser success return and observed state through read-only PostgreSQL, without calling CrossCart APIs to advance the purchase. The registered public HTTPS endpoint's signed receipts completed the same order. Official Stripe event/provider retrieval confirmed correlation. Invalid signatures returned HTTP 400.
- SDK-signed duplicate/reordering fixtures remain **local replays**. Official endpoint redelivery was **not exercised**. A report from the preceding cloud suite retained its earlier CLI wording; the focused test and this acceptance summary state the actual registered HTTPS scope.
- Actual public HTTP probes confirmed separate visitor owners, HTTP-only Secure SameSite=Lax cookies, HTTP 403 for another visitor's run, hidden foreign runs in lists, HTTP 403 for a forged Origin, and HTTP 401 for anonymous maintenance access.
- **Physical public HTTPS phone result: user-reported “Purchase confirmed.”** This is separate from independent provider verification. Phone model, OS and browser were not supplied. Same Wi-Fi/LAN is unnecessary.

See [sanitized cloud acceptance](cloud-acceptance.json) for actual provider IDs, minor-unit totals, mandate hashes, signed receipts, HTTP results and scope. No browser session tokens, billing details, API keys or database credentials are published.

## Local and storage validation

- **114 offline checks passed:** 22 unit, 20 integration, 34 installed Stripe SDK contracts, 6 quote-gate, 18 shopping, 9 webhook, 2 network and 3 cloud-boundary checks. The final submission export repeated these successfully.
- **18 local browser checks passed:** desktop/mobile transaction scenarios, revision, eligibility, ownership/tampering, benchmark and financial-source guide. These use simulated payments and are not official Stripe provider proof.
- Actual Neon checks passed for concurrent workers/duplicate commits, rollback, ownership and separate-process reopen. These checks use explicitly simulated local payment objects: [record](cloud-ledger-validation.json).
- Exported source passed TypeScript, ESLint and production build. Dependencies remain pinned. Production dependency audit reported zero known production advisories at the observed date.
- Earlier 320–1920px interface checks found no horizontal page overflow. Public mobile purchase is reported separately above.

The 34 SDK contracts use localhost fixtures. They are not official Stripe evidence. Return-page wording, a screenshot or a hash alone does not verify payment or identity. Provider refund success does not prove bank posting.

## Submission assets and remaining boundary

The supplied ten-slide ImageGen pitch deck replaces the initial deck. Its image-based design is preserved; native text overlays update measured evidence, observation dates and public links. Most slide content remains raster imagery. Sources and implementation limits appear in slide notes and on relevant slides. PPTX package/import checks passed; the native LibreOffice PDF was reviewed on every page. PowerPoint itself was not opened for this review.

The recording uses actual public HTTPS purchase, blocked-transaction, benchmark and guide interactions, with Andrew Multilingual Neural English narration, voice-timed on-screen captions, focused zooms and frame-driven paper transitions. Its audit excerpt and refund screenshot come from independently verified public Stripe test cases. Browser benchmark times include scripted pauses and are not human-study findings. See [recording transcript](VIDEO.md).

Creating and publishing deliverables does **not** submit the HacKU final form. A form receipt has not been obtained. HKT/Club merchant APIs, loyalty accounts, legal identity and real settlement remain outside the prototype.
