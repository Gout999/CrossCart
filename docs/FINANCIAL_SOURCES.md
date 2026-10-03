# Financial assumptions and observations

Primary pages checked on **4 October 2026, Hong Kong time**. Rates can change; qualification must be checked again before any production use.

| Input | Source and observed rule | Use in CrossCart |
| --- | --- | --- |
| Merchant card processing | [Stripe Hong Kong](https://stripe.com/en-hk/pricing): domestic card, 3.4% + HK$2.35 per successful transaction. International-card and FX additions differ. | Illustrative estimate on HK$1,749: **HK$61.82**. Not added to the buyer's total; no actual processing fee is billed in test mode. |
| Clubpoints reference value | [The Club campaign index](https://www.theclub.com.hk/en/explore/campaigns.html): specified Club Shopping redemption reference, 5 points offset HK$1. | Conditional redemption reference, not cash or a demo discount. |
| Credit-card rebate | [Citi The Club dated terms, December 2025](https://www.citibank.com.hk/english/credit-cards/pdf/citi-the-club/terms-and-conditions.pdf): eligible transactions earn 1 point/HK$20; designated merchants add 3 points/HK$20, capped at 1,500 bonus points per statement cycle, until 31 December 2026. Refunded/cancelled transactions lose corresponding points. | A conditional HK$1,000 example yields 200 points, worth HK$40 on the specified route, if qualification and remaining bonus allowance hold. No test merchant/card is verified eligible. |
| Product and delivery | Synthetic `catalogue()` records in `lib/merchants.ts`, not scraped retailer prices. | A: HK$1,719 + 30 = 1,749; B: 1,669 + 30 = 1,699; C: 1,779 + 50 = 1,829. Exact approved gross total controls payment. |
| Model cost | Model usage and latency recorded in shopping records; price accounting not implemented. | **Not calculated**. No free-AI or cost-saving claim. |

Observations: public Club pages can expose differing historical redemption ratios. This demonstration identifies the route and dated source rather than treating all Clubpoints as universally exchangeable. “Up to 4%” is conditional and is not equivalent to an immediately spendable cash discount. A refund can reverse rewards, so projected points never authorize spending above the approved gross amount.

No rewards are applied to the three demo offers. Unknown qualification is shown as not applied, rather than invented savings. No personal financial recommendation is represented.
