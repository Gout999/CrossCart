export const OBSERVED_AT = '2026-10-04';
export const RATE_SOURCES = [
  { id: 'stripe-hk', title: 'Stripe Hong Kong standard pricing', url: 'https://stripe.com/en-hk/pricing', observation: 'Domestic card processing: 3.4% + HK$2.35 per successful transaction. International-card and FX additions excluded.', applied: 'Merchant-side illustration only. Test-mode fees are not billed; this estimate is not added to the buyer mandate.' },
  { id: 'club-value', title: 'The Club redemption campaign', url: 'https://www.theclub.com.hk/en/explore/campaigns.html', observation: 'Current advertised redemption reference: 5 Clubpoints offset HK$1 on the specified Club Shopping redemption route.', applied: 'Reference value only; no Clubpoints account, redemption or earning integration in this demo.' },
  { id: 'citi-club', title: 'Citi The Club dated terms (December 2025)', url: 'https://www.citibank.com.hk/english/credit-cards/pdf/citi-the-club/terms-and-conditions.pdf', observation: 'Eligible cardholders: basic 1 point per HK$20; designated-merchant bonus 3 points per HK$20, capped at 1,500 bonus points per statement cycle. Promotion ends 31 December 2026. Refunded/cancelled transactions lose associated points.', applied: 'Conditional example only. Demo merchants and Stripe test cards are not verified eligible merchants/cardholders.' },
] as const;
export function estimatedDomesticFee(amountMinor: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Integer non-negative HKD minor units required.');
  return Number((BigInt(amountMinor) * 340n + 5000n) / 10000n + 235n);
}
