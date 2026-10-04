export type ExampleLanguage = 'en' | 'zh';
export type RankingPreference = 'lowest_total' | 'fastest_delivery';

export const requestExamples = [
  {
    id: 'official-value',
    title: { en: 'Official warranty', zh: '官方保養' },
    detail: { en: 'HK$1,800 · best total · within 2 days', zh: 'HK$1,800 · 最平總價 · 兩日內' },
    request: { en: 'Find headphones under HKD 1,800 including delivery, with official warranty. Choose the cheapest eligible offer, arriving within 2 days.', zh: '幫我搵 HK$1,800 以下嘅耳機，連運費，要官方保養，兩日內收到，揀最平總價。' },
  },
  {
    id: 'lowest-price',
    title: { en: 'Spend less', zh: '慳啲買' },
    detail: { en: 'HK$1,750 · third-party warranty okay', zh: 'HK$1,750 · 接受第三方保養' },
    request: { en: 'Find the cheapest headphones under HKD 1,750 including delivery. Third-party warranty is acceptable. Arrive within 2 days.', zh: '耳機預算 HK$1,750，包運費，第三方保養都得，兩日內收到，揀最平嗰個。' },
  },
  {
    id: 'fastest-arrival',
    title: { en: 'Speed comes first', zh: '最快收到' },
    detail: { en: 'HK$1,900 · official · fastest arrival', zh: 'HK$1,900 · 官方 · 速度優先' },
    request: { en: 'Headphones, budget HKD 1,900 including delivery, official warranty, within 3 days. Prefer the fastest delivery, then the lowest total.', zh: '耳機預算 HK$1,900，包運費，要官方保養，三日內收到。先揀最快送到，再比較最平總價。' },
  },
  {
    id: 'gift-tomorrow',
    title: { en: 'A gift for tomorrow', zh: '聽日要送禮' },
    detail: { en: 'HK$1,900 · official · arrive tomorrow', zh: 'HK$1,900 · 官方 · 聽日收到' },
    request: { en: 'I need headphones as a gift by tomorrow. No more than HKD 1,900 including delivery, with official warranty. Choose the cheapest offer that meets the deadline.', zh: '聽日要送禮，想買耳機，HK$1,900 以下連運費，要官方保養，最遲聽日收到。符合期限之中揀最平。' },
  },
  {
    id: 'strict-budget',
    title: { en: 'A firm budget', zh: '預算唔可以加' },
    detail: { en: 'HK$1,600 · official · never raise the cap', zh: 'HK$1,600 · 官方 · 唔放寬條件' },
    request: { en: 'Find headphones under HKD 1,600 including delivery, official warranty, arriving within 2 days. Cheapest first. Do not increase my budget if nothing qualifies.', zh: '耳機一定要 HK$1,600 以下連運費，官方保養，兩日內收到，揀最平。冇合適嘅就停，唔好自動加預算。' },
  },
  {
    id: 'exact-approval',
    title: { en: 'Room in the budget', zh: '預算有餘額' },
    detail: { en: 'HK$1,900 · cheapest · approve the exact deal', zh: 'HK$1,900 · 最平 · 只批准指定交易' },
    request: { en: 'Find the cheapest headphones under HKD 1,900 including delivery, official warranty, within 2 days. I will approve one exact deal; a remaining budget is not permission to change its price.', zh: '幫我搵最平嘅耳機，HK$1,900 以下連運費，要官方保養，兩日內收到。我只批准指定交易，預算有餘額都唔代表可以改價。' },
  },
] as const;

export const revisionExamples = [
  { id: 'relax-warranty', title: { en: 'Accept third-party', zh: '接受第三方保養' }, request: { en: 'Third-party warranty is acceptable instead. Choose the cheapest. Keep my other requirements.', zh: '改做第三方保養都得，揀最平。其他要求不變。' } },
  { id: 'raise-budget', title: { en: 'Raise budget, choose fastest', zh: '加預算，揀最快' }, request: { en: 'Increase my budget to HKD 1,900 including delivery and prefer the fastest arrival. Keep my other requirements.', zh: '預算加到 HK$1,900 連運費，優先揀最快收到。其他要求不變。' } },
  { id: 'tomorrow', title: { en: 'Arrive tomorrow', zh: '改為聽日收到' }, request: { en: 'Change the delivery deadline to tomorrow. Keep my budget and warranty requirements.', zh: '改為最遲聽日收到。預算同保養要求不變。' } },
] as const;
