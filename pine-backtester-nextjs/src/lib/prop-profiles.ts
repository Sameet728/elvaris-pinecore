export interface PropFirmProfile {
  id: string;
  name: string;
  accountSize: number;
  profitTargetCash: number;
  profitTargetPct: number;
  maxTrailingDrawdownCash: number;
  maxTrailingDrawdownPct: number;
  trailingType: 'end-of-day' | 'intraday' | 'static';
  consistencyPct: number; // e.g. 40%
  minTradingDays: number; // e.g. 3
  dailyLossLimitCash?: number;
  maxLossStreak?: number;
  rulesSourceDate: string;
}

export const PROP_FIRM_PROFILES: Record<string, PropFirmProfile> = {
  tradeify_select_100k: {
    id: 'tradeify_select_100k',
    name: 'Tradeify Select ($100K Account)',
    accountSize: 100000,
    profitTargetCash: 6000,
    profitTargetPct: 6.0,
    maxTrailingDrawdownCash: 3000,
    maxTrailingDrawdownPct: 3.0,
    trailingType: 'end-of-day',
    consistencyPct: 40.0,
    minTradingDays: 3,
    rulesSourceDate: 'Official Tradeify Evaluation Guidelines (Verified Nov 2026)',
  },
  tradeify_select_50k: {
    id: 'tradeify_select_50k',
    name: 'Tradeify Select ($50K Account)',
    accountSize: 50000,
    profitTargetCash: 3000,
    profitTargetPct: 6.0,
    maxTrailingDrawdownCash: 2000,
    maxTrailingDrawdownPct: 4.0,
    trailingType: 'end-of-day',
    consistencyPct: 40.0,
    minTradingDays: 3,
    rulesSourceDate: 'Official Tradeify Evaluation Guidelines (Verified Nov 2026)',
  },
  custom_conservative: {
    id: 'custom_conservative',
    name: 'Custom Institutional Guard',
    accountSize: 100000,
    profitTargetCash: 8000,
    profitTargetPct: 8.0,
    maxTrailingDrawdownCash: 5000,
    maxTrailingDrawdownPct: 5.0,
    trailingType: 'end-of-day',
    consistencyPct: 35.0,
    minTradingDays: 5,
    maxLossStreak: 3,
    rulesSourceDate: 'Institutional Quantitative Standard',
  },
};

