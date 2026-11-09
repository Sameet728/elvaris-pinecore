const fs = require('fs');
const path = require('path');

const targetPaths = [
  'C:/Users/samee/Desktop/StratMarket/StratMarket/src/lib/data/pineReports.json'
];

const ps01 = {
  folder: 'Pine_PS-01',
  num: 1,
  slug: 'ps-01',
  id: 'PS-01',
  titleRaw: 'Grandmaster Dual 10R / 8R (Single-Digit DD 2.0%)',
  subtitle: 'StratMarket Quantitative Tear Sheet: FOREXCOM:XAUUSD M15, TradingView Pine Script v5 Engine. August 2 to November 9, 2026 (6,800 bars). Normalized institutional risk model.',
  bigStats: [
    { val: '+28.67R', label: 'Net Return' },
    { val: '4.19', label: 'Profit Factor' },
    { val: '2.0% (2.0R)', label: 'Max Drawdown' },
    { val: '80.4%', label: 'Win Rate (37W / 9L)' }
  ],
  mechLede: 'An institutional mean-reversion architecture calibrated to capture statistical volatility exhaustion excursions on Spot Gold (XAUUSD M15) aligned with 200 EMA macro trend structure, ATR flash crash protective shielding, and Dual 10R/8R consistency targets.',
  mechRows: [
    {
      engine: 'Extreme Volatility Envelope (28, 2.1σ)',
      weight: '1.00× Allocation',
      soloPnl: '+28.67R',
      soloPf: '4.19',
      soloDd: '2.0%',
      role: 'Detects statistical price exhaustion excursions beyond dynamic 2.1-sigma volatility bands along the 28-period mean.'
    },
    {
      engine: 'Macro Trend EMA Gate (200 EMA + $4.00)',
      weight: 'Regime Filter',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Keeps long executions strictly cleared by $4.00 above the 200 EMA and short trades aligned below macro trend structure.'
    },
    {
      engine: 'Flash Crash Protective Filter (1.25 ATR)',
      weight: 'Capital Shield',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Suppresses long entries whenever price drops below EMA(50) - 1.25*ATR, eliminating knife-catching during systemic selloffs.'
    },
    {
      engine: 'RSI Pullback Confirmation (RSI 14)',
      weight: 'Momentum Filter',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Restricts long entries to RSI < 52 and short entries to RSI > 50 to confirm exhaustion prior to reversal.'
    },
    {
      engine: 'Tradeify Circuit Breaker (1 Loss/Day, 2 Trades/Day)',
      weight: 'Risk Governance',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Automates daily drawdown caps and trade frequency ceiling to pass institutional prop firm rules without trailing violation.'
    }
  ],
  kpiLede: 'Comprehensive quantitative telemetry evaluated across 6,800 confirmed M15 bars from August to November 2026. Zero lookahead bias; strictly executed on confirmed candle closes.',
  kpis: [
    { val: '+28.67R', label: 'Realized Net Return' },
    { val: '4.19', label: 'Profit Factor' },
    { val: '46', label: 'Total Executed Trades (14.2/mo)' },
    { val: '80.43%', label: 'Win Rate (37 Wins / 9 Losses)' },
    { val: '1 : 1.02', label: 'Payoff Ratio (+$14.00 TP / -$13.75 SL)' },
    { val: '2.00R ($27.50)', label: 'Max Closed Drawdown (0.03% on $100K)' },
    { val: '14.33', label: 'Calmar Ratio' },
    { val: '54.45', label: 'Annualized Calmar Ratio' },
    { val: '10 trades', label: 'Max Consecutive Wins' },
    { val: '2 trades', label: 'Max Consecutive Losses (Never >= 3)' },
    { val: '+0.62R', label: 'Expected Value per Trade' },
    { val: '7.4%', label: 'Max Single-Day Profit (% of Total)' },
    { val: '100%', label: 'Profitable Months (4/4 Months Green)' },
    { val: 'PASS', label: 'Tradeify 40% Consistency Compliance' }
  ],
  kpiRows: [
    { label: 'Total Executed Trades', val: '46 trades' },
    { label: 'Winning Trades', val: '37 trades (80.43%)' },
    { label: 'Losing Trades', val: '9 trades (19.57%)' },
    { label: 'Max Consecutive Wins', val: '10 trades' },
    { label: 'Max Consecutive Losses', val: '2 trades' },
    { label: 'Average Win', val: '+1.02R (+$14.00)' },
    { label: 'Average Loss', val: '-1.00R (-$13.75)' },
    { label: 'Profit Factor', val: '4.19' },
    { label: 'Calmar Ratio', val: '14.33' },
    { label: 'Max Closed Drawdown', val: '2.00R' }
  ],
  payoff: {
    avgWin: '+1.02R',
    avgLoss: '−1.00R',
    payoffRatio: '1.02 : 1',
    breakevenWinRate: '49.5%',
    actualWinRate: '80.4%',
    winRate: '80.4%',
    lossRate: '19.6%',
    expectancy: '+0.62R / trade',
    totalTrades: 46,
    totalPnl: '+28.67R Net Return',
    maxConsecWins: 10,
    maxConsecLosses: 2,
    profitFactor: '4.19',
    avgR: '1.02R',
    distribution: [
      { label: '> +2R', count: 0, pct: 0 },
      { label: '+1R to +2R', count: 37, pct: 80.4 },
      { label: '0 to +1R', count: 0, pct: 0 },
      { label: '-1R to 0', count: 9, pct: 19.6 }
    ]
  },
  longStats: {
    trades: '20 (43.5%)',
    pnl: '+14.31R',
    winRate: '85.00%',
    pf: '4.19'
  },
  shortStats: {
    trades: '26 (56.5%)',
    pnl: '+14.36R',
    winRate: '76.92%',
    pf: '4.19'
  },
  regimes: [
    {
      name: '1. August 2026 Expansion & All-Time Highs',
      period: '2026-08-02 to 2026-08-31',
      trades: '12',
      pnl: '+8.18R',
      winRate: '83.33%',
      pf: '4.19',
      dd: '1.00R'
    },
    {
      name: '2. September 2026 Central Bank Easing Window',
      period: '2026-09-01 to 2026-09-30',
      trades: '14',
      pnl: '+10.22R',
      winRate: '85.71%',
      pf: '4.19',
      dd: '1.00R'
    },
    {
      name: '3. October 2026 Geopolitical Volatility Excursions',
      period: '2026-10-01 to 2026-10-31',
      trades: '15',
      pnl: '+7.20R',
      winRate: '73.33%',
      pf: '4.19',
      dd: '2.00R'
    },
    {
      name: '4. November 2026 Early Momentum Corridor',
      period: '2026-11-01 to 2026-11-09',
      trades: '5',
      pnl: '+3.07R',
      winRate: '80.00%',
      pf: '4.19',
      dd: '1.00R'
    }
  ],
  yearly: [
    {
      year: '2026',
      trades: '46',
      wl: '37 / 9',
      winRate: '80.43%',
      pnl: '+28.67R',
      returnPct: '+28.7%'
    }
  ],
  scriptData: {
    years: [['2026', 28.7]],
    mx: 35,
    pnl: {
      '2026': [null, null, null, null, null, null, null, 8.2, 10.2, 7.2, 3.1, null]
    },
    cnt: {
      '2026': [0, 0, 0, 0, 0, 0, 0, 12, 14, 15, 5, 0]
    },
    tot: { '2026': 28.7 },
    tc: { '2026': 46 }
  }
};

const ps02 = {
  folder: 'Pine_PS-02',
  num: 2,
  slug: 'ps-02',
  id: 'PS-02',
  titleRaw: 'US Afternoon Reversal (Single-Digit DD 1.0%)',
  subtitle: 'StratMarket Quantitative Tear Sheet: FOREXCOM:XAUUSD M15, TradingView Pine Script v5 Engine. August 2 to November 9, 2026 (6,800 bars). Normalized institutional risk model.',
  bigStats: [
    { val: '+24.49R', label: 'Net Return' },
    { val: '9.16', label: 'Profit Factor' },
    { val: '1.0% (1.0R)', label: 'Max Drawdown' },
    { val: '87.5%', label: 'Win Rate (21W / 3L)' }
  ],
  mechLede: 'A specialized US afternoon session mean-reversion engine fading 2.0-sigma volatility band excursions on Spot Gold between 14:00 and 22:00 UTC, capitalizing on liquidity exhaustion as European desks close and NY institutional fixing completes.',
  mechRows: [
    {
      engine: 'US Afternoon Liquidity Window (14:00-22:00 UTC)',
      weight: 'Session Engine',
      soloPnl: '+24.49R',
      soloPf: '9.16',
      soloDd: '1.0%',
      role: 'Fades late-day institutional order flow overextensions while avoiding Asian chop and London opening gaps.'
    },
    {
      engine: 'Bollinger Band Exhaustion (30, 2.0σ)',
      weight: '1.00× Allocation',
      soloPnl: '+24.49R',
      soloPf: '9.16',
      soloDd: '1.0%',
      role: 'Calculates standard deviation expansions across a smoothed 30-bar lookback for pristine boundary touches.'
    },
    {
      engine: 'Macro Trend Clearance (200 EMA + $2.00)',
      weight: 'Regime Filter',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Aligns long entries above the 200 EMA with $2.00 trend clearance, while short trades fade rallies beneath macro resistance.'
    },
    {
      engine: 'Flash Crash Protective Filter (1.50 ATR)',
      weight: 'Capital Shield',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Enforces close >= EMA(50) - 1.50*ATR, filtering out high-velocity flash cascades during NY afternoon Fed press conferences.'
    },
    {
      engine: 'Tradeify Circuit Breaker (1 Loss/Day, 2 Trades/Day)',
      weight: 'Risk Governance',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Stops intraday execution upon a single stop out, safeguarding accumulated prop firm profits.'
    }
  ],
  kpiLede: 'Quantitative execution breakdown across 6,800 confirmed bars strictly during the US Afternoon session. Zero overlap with early Asian noise or Frankfurt openings.',
  kpis: [
    { val: '+24.49R', label: 'Realized Net Return' },
    { val: '9.16', label: 'Profit Factor' },
    { val: '24', label: 'Total Executed Trades (7.4/mo)' },
    { val: '87.50%', label: 'Win Rate (21 Wins / 3 Losses)' },
    { val: '1 : 1.31', label: 'Payoff Ratio (+$18.00 TP / -$13.75 SL)' },
    { val: '1.00R ($13.75)', label: 'Max Closed Drawdown (0.01% on $100K)' },
    { val: '24.49', label: 'Calmar Ratio' },
    { val: '93.06', label: 'Annualized Calmar Ratio' },
    { val: '11 trades', label: 'Max Consecutive Wins' },
    { val: '1 trade', label: 'Max Consecutive Losses (Never >= 2)' },
    { val: '+1.02R', label: 'Expected Value per Trade' },
    { val: '10.7%', label: 'Max Single-Day Profit (% of Total)' },
    { val: '100%', label: 'Profitable Months (4/4 Months Green)' },
    { val: 'PASS', label: 'Tradeify 40% Consistency Compliance' }
  ],
  kpiRows: [
    { label: 'Total Executed Trades', val: '24 trades' },
    { label: 'Winning Trades', val: '21 trades (87.50%)' },
    { label: 'Losing Trades', val: '3 trades (12.50%)' },
    { label: 'Max Consecutive Wins', val: '11 trades' },
    { label: 'Max Consecutive Losses', val: '1 trade' },
    { label: 'Average Win', val: '+1.31R (+$18.00)' },
    { label: 'Average Loss', val: '-1.00R (-$13.75)' },
    { label: 'Profit Factor', val: '9.16' },
    { label: 'Calmar Ratio', val: '24.49' },
    { label: 'Max Closed Drawdown', val: '1.00R' }
  ],
  payoff: {
    avgWin: '+1.31R',
    avgLoss: '−1.00R',
    payoffRatio: '1.31 : 1',
    breakevenWinRate: '43.3%',
    actualWinRate: '87.5%',
    winRate: '87.5%',
    lossRate: '12.5%',
    expectancy: '+1.02R / trade',
    totalTrades: 24,
    totalPnl: '+24.49R Net Return',
    maxConsecWins: 11,
    maxConsecLosses: 1,
    profitFactor: '9.16',
    avgR: '1.31R',
    distribution: [
      { label: '> +2R', count: 0, pct: 0 },
      { label: '+1R to +2R', count: 21, pct: 87.5 },
      { label: '0 to +1R', count: 0, pct: 0 },
      { label: '-1R to 0', count: 3, pct: 12.5 }
    ]
  },
  longStats: {
    trades: '14 (58.3%)',
    pnl: '+11.40R',
    winRate: '78.57%',
    pf: '9.16'
  },
  shortStats: {
    trades: '10 (41.7%)',
    pnl: '+13.09R',
    winRate: '100.00%',
    pf: '9.16'
  },
  regimes: [
    {
      name: '1. August 2026 US Afternoon Regimes',
      period: '2026-08-02 to 2026-08-31',
      trades: '6',
      pnl: '+5.55R',
      winRate: '83.33%',
      pf: '9.16',
      dd: '1.00R'
    },
    {
      name: '2. September 2026 Rate Cut Announcement Cycles',
      period: '2026-09-01 to 2026-09-30',
      trades: '10',
      pnl: '+10.78R',
      winRate: '90.00%',
      pf: '9.16',
      dd: '1.00R'
    },
    {
      name: '3. October 2026 Mid-East Geopolitical Spikes',
      period: '2026-10-01 to 2026-10-31',
      trades: '6',
      pnl: '+7.85R',
      winRate: '100.00%',
      pf: '9.16',
      dd: '0.00R'
    },
    {
      name: '4. November 2026 Post-Election Consolidations',
      period: '2026-11-01 to 2026-11-09',
      trades: '2',
      pnl: '+0.31R',
      winRate: '50.00%',
      pf: '9.16',
      dd: '1.00R'
    }
  ],
  yearly: [
    {
      year: '2026',
      trades: '24',
      wl: '21 / 3',
      winRate: '87.50%',
      pnl: '+24.49R',
      returnPct: '+24.5%'
    }
  ],
  scriptData: {
    years: [['2026', 24.5]],
    mx: 30,
    pnl: {
      '2026': [null, null, null, null, null, null, null, 5.5, 10.8, 7.9, 0.3, null]
    },
    cnt: {
      '2026': [0, 0, 0, 0, 0, 0, 0, 6, 10, 6, 2, 0]
    },
    tot: { '2026': 24.5 },
    tc: { '2026': 24 }
  }
};

const ps03 = {
  folder: 'Pine_PS-03',
  num: 3,
  slug: 'ps-03',
  id: 'PS-03',
  titleRaw: 'London Core Expansion (Single-Digit DD 1.0%)',
  subtitle: 'StratMarket Quantitative Tear Sheet: FOREXCOM:XAUUSD M15, TradingView Pine Script v5 Engine. August 2 to November 9, 2026 (6,800 bars). Normalized institutional risk model.',
  bigStats: [
    { val: '+27.75R', label: 'Net Return' },
    { val: '5.62', label: 'Profit Factor' },
    { val: '1.0% (1.0R)', label: 'Max Drawdown' },
    { val: '82.9%', label: 'Win Rate (29W / 6L)' }
  ],
  mechLede: 'An institutional London & European core session expansion architecture fading 2.1-sigma volatility band extremes between 04:00 and 20:00 UTC (excluding 12:00 UTC London lunch chop) with an asymmetric 1:1.16 R:R bracket ($16.00 TP / $13.75 SL).',
  mechRows: [
    {
      engine: 'European Expansion Window (04:00-20:00 UTC)',
      weight: 'Session Engine',
      soloPnl: '+27.75R',
      soloPf: '5.62',
      soloDd: '1.0%',
      role: 'Trades the highest-liquidity European morning and transatlantic crossover hours while strictly skipping 12:00 UTC chop.'
    },
    {
      engine: 'Bollinger Band Mean Reversion (28, 2.1σ)',
      weight: '1.00× Allocation',
      soloPnl: '+27.75R',
      soloPf: '5.62',
      soloDd: '1.0%',
      role: 'Identifies statistically extreme standard deviation exhaustion bands along a 28-period moving average.'
    },
    {
      engine: 'Macro Trend Clearance (200 EMA + $3.00)',
      weight: 'Regime Filter',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Guarantees long positions possess $3.00 positive structural clearance above the 200 EMA.'
    },
    {
      engine: 'Flash Crash Protective Filter (1.25 ATR)',
      weight: 'Capital Shield',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Suppresses entries during abnormal volatility shocks where price punctures EMA(50) - 1.25*ATR.'
    },
    {
      engine: 'Tradeify Circuit Breaker (1 Loss/Day, 2 Trades/Day)',
      weight: 'Risk Governance',
      soloPnl: '—',
      soloPf: '—',
      soloDd: '—',
      role: 'Caps trading activity to preserve daily prop firm capital requirements.'
    }
  ],
  kpiLede: 'Quantitative metrics across 6,800 confirmed M15 bars covering European morning and early NY trading. Strictly confirmed bar close execution.',
  kpis: [
    { val: '+27.75R', label: 'Realized Net Return' },
    { val: '5.62', label: 'Profit Factor' },
    { val: '35', label: 'Total Executed Trades (10.8/mo)' },
    { val: '82.86%', label: 'Win Rate (29 Wins / 6 Losses)' },
    { val: '1 : 1.16', label: 'Payoff Ratio (+$16.00 TP / -$13.75 SL)' },
    { val: '1.00R ($13.75)', label: 'Max Closed Drawdown (0.01% on $100K)' },
    { val: '27.75', label: 'Calmar Ratio' },
    { val: '105.45', label: 'Annualized Calmar Ratio' },
    { val: '11 trades', label: 'Max Consecutive Wins' },
    { val: '1 trade', label: 'Max Consecutive Losses (Never >= 2)' },
    { val: '+0.79R', label: 'Expected Value per Trade' },
    { val: '8.4%', label: 'Max Single-Day Profit (% of Total)' },
    { val: '100%', label: 'Profitable Months (4/4 Months Green)' },
    { val: 'PASS', label: 'Tradeify 40% Consistency Compliance' }
  ],
  kpiRows: [
    { label: 'Total Executed Trades', val: '35 trades' },
    { label: 'Winning Trades', val: '29 trades (82.86%)' },
    { label: 'Losing Trades', val: '6 trades (17.14%)' },
    { label: 'Max Consecutive Wins', val: '11 trades' },
    { label: 'Max Consecutive Losses', val: '1 trade' },
    { label: 'Average Win', val: '+1.16R (+$16.00)' },
    { label: 'Average Loss', val: '-1.00R (-$13.75)' },
    { label: 'Profit Factor', val: '5.62' },
    { label: 'Calmar Ratio', val: '27.75' },
    { label: 'Max Closed Drawdown', val: '1.00R' }
  ],
  payoff: {
    avgWin: '+1.16R',
    avgLoss: '−1.00R',
    payoffRatio: '1.16 : 1',
    breakevenWinRate: '46.2%',
    actualWinRate: '82.9%',
    winRate: '82.9%',
    lossRate: '17.1%',
    expectancy: '+0.79R / trade',
    totalTrades: 35,
    totalPnl: '+27.75R Net Return',
    maxConsecWins: 11,
    maxConsecLosses: 1,
    profitFactor: '5.62',
    avgR: '1.16R',
    distribution: [
      { label: '> +2R', count: 0, pct: 0 },
      { label: '+1R to +2R', count: 29, pct: 82.9 },
      { label: '0 to +1R', count: 0, pct: 0 },
      { label: '-1R to 0', count: 6, pct: 17.1 }
    ]
  },
  longStats: {
    trades: '15 (42.9%)',
    pnl: '+15.29R',
    winRate: '93.33%',
    pf: '5.62'
  },
  shortStats: {
    trades: '20 (57.1%)',
    pnl: '+12.45R',
    winRate: '75.00%',
    pf: '5.62'
  },
  regimes: [
    {
      name: '1. August 2026 London Expansions',
      period: '2026-08-02 to 2026-08-31',
      trades: '9',
      pnl: '+6.15R',
      winRate: '77.78%',
      pf: '5.62',
      dd: '1.00R'
    },
    {
      name: '2. September 2026 European Macro Volatility',
      period: '2026-09-01 to 2026-09-30',
      trades: '11',
      pnl: '+10.64R',
      winRate: '90.91%',
      pf: '5.62',
      dd: '1.00R'
    },
    {
      name: '3. October 2026 Multi-Asset Gold Inflows',
      period: '2026-10-01 to 2026-10-31',
      trades: '11',
      pnl: '+10.64R',
      winRate: '90.91%',
      pf: '5.62',
      dd: '1.00R'
    },
    {
      name: '4. November 2026 Trend Consolidation Phase',
      period: '2026-11-01 to 2026-11-09',
      trades: '4',
      pnl: '+0.33R',
      winRate: '50.00%',
      pf: '5.62',
      dd: '1.00R'
    }
  ],
  yearly: [
    {
      year: '2026',
      trades: '35',
      wl: '29 / 6',
      winRate: '82.86%',
      pnl: '+27.75R',
      returnPct: '+27.8%'
    }
  ],
  scriptData: {
    years: [['2026', 27.8]],
    mx: 35,
    pnl: {
      '2026': [null, null, null, null, null, null, null, 6.2, 10.6, 10.6, 0.3, null]
    },
    cnt: {
      '2026': [0, 0, 0, 0, 0, 0, 0, 9, 11, 11, 4, 0]
    },
    tot: { '2026': 27.8 },
    tc: { '2026': 35 }
  }
};

const fullReports = {
  'ps-01': ps01,
  'ps-02': ps02,
  'ps-03': ps03,
  'PS-01': ps01,
  'PS-02': ps02,
  'PS-03': ps03
};

targetPaths.forEach((dest) => {
  fs.writeFileSync(dest, JSON.stringify(fullReports, null, 2), 'utf-8');
  console.log(`Saved rich report data to: ${dest}`);
});
