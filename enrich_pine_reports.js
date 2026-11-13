const fs = require('fs');

const filePath = 'C:/Users/samee/Desktop/StratMarket/StratMarket/src/lib/data/pineReports.json';

const data = {
  'ps-01': {
    folder: 'Pine_PS-01',
    num: 1,
    slug: 'ps-01',
    titleRaw: 'Grandmaster Dual 10R / 8R (Single-Digit DD 2.0%)',
    subtitle: 'StratMarket Quantitative Performance Report: FOREXCOM:XAUUSD M15, TradingView Pine Script v5 Engine. August 2 to November 9, 2026. Zero lookahead confirmed.',
    bigStats: [
      { val: '+27.65R', label: 'Net Return' },
      { val: '4.07', label: 'Profit Factor' },
      { val: '2.0% (2.0R)', label: 'Max Drawdown' },
      { val: '80.0%', label: 'Win Rate (36W / 9L)' },
      { val: '13.83', label: 'Calmar Ratio' }
    ],
    kpiRows: [
      { label: 'Total Executed Trades', val: '45 trades' },
      { label: 'Winning Trades', val: '36 trades (80.0%)' },
      { label: 'Losing Trades', val: '9 trades (20.0%)' },
      { label: 'Max Consecutive Wins', val: '10 trades' },
      { label: 'Max Consecutive Losses', val: '2 trades' },
      { label: 'Target / Risk Structure', val: '+$14.00 TP / -$13.75 SL (1:1.02 R:R)' },
      { label: 'Trading Session', val: '01:00-20:00 UTC (12:00 UTC Chop Excluded)' },
      { label: 'Tradeify Consistency Rule', val: 'PASS (Max single day profit < 7.5% vs 40% cap)' },
      { label: 'Flash Crash Protective Filter', val: 'ATR 1.25 Shield Active' },
      { label: 'Annualized Calmar', val: '52.57' }
    ],
    payoff: {
      payoffRatio: '1.02:1',
      avgWin: '+1.02R',
      avgLoss: '−1.00R',
      maxConsecWins: 10,
      maxConsecLosses: 2,
      winRate: '80.0%',
      profitFactor: '4.07',
      expectancy: '+0.61R / trade',
      lossRate: '20.0%',
      totalTrades: 45,
      avgR: '1.02R',
      distribution: [
        { label: '> +2R', count: 0, pct: 0 },
        { label: '+1R to +2R', count: 36, pct: 80.0 },
        { label: '0 to +1R', count: 0, pct: 0 },
        { label: '-1R to 0', count: 9, pct: 20.0 }
      ]
    },
    scriptData: {
      mx: 35000,
      monthlyPnl: [
        { year: 2026, aug: 9.2, sep: 9.2, oct: 7.2, nov: 2.05, total: 27.65 }
      ]
    }
  },
  'ps-02': {
    folder: 'Pine_PS-02',
    num: 2,
    slug: 'ps-02',
    titleRaw: 'US Afternoon Reversal (Single-Digit DD 1.0%)',
    subtitle: 'StratMarket Quantitative Performance Report: FOREXCOM:XAUUSD M15, TradingView Pine Script v5 Engine. August 2 to November 9, 2026. Zero lookahead confirmed.',
    bigStats: [
      { val: '+22.18R', label: 'Net Return' },
      { val: '6.55', label: 'Profit Factor' },
      { val: '1.0% (1.0R)', label: 'Max Drawdown' },
      { val: '83.3%', label: 'Win Rate (15W / 3L)' },
      { val: '22.18', label: 'Calmar Ratio' }
    ],
    kpiRows: [
      { label: 'Total Executed Trades', val: '18 trades' },
      { label: 'Winning Trades', val: '15 trades (83.3%)' },
      { label: 'Losing Trades', val: '3 trades (16.7%)' },
      { label: 'Max Consecutive Wins', val: '9 trades' },
      { label: 'Max Consecutive Losses', val: '1 trade' },
      { label: 'Target / Risk Structure', val: '+$18.00 TP / -$13.75 SL (1:1.31 R:R)' },
      { label: 'Trading Session', val: '14:00-22:00 UTC (US Afternoon)' },
      { label: 'Tradeify Consistency Rule', val: 'PASS (Max single day profit < 12% vs 40% cap)' },
      { label: 'Flash Crash Protective Filter', val: 'ATR 1.50 Shield Active' },
      { label: 'Annualized Calmar', val: '84.34' }
    ],
    payoff: {
      payoffRatio: '1.31:1',
      avgWin: '+1.31R',
      avgLoss: '−1.00R',
      maxConsecWins: 9,
      maxConsecLosses: 1,
      winRate: '83.3%',
      profitFactor: '6.55',
      expectancy: '+0.93R / trade',
      lossRate: '16.7%',
      totalTrades: 18,
      avgR: '1.31R',
      distribution: [
        { label: '> +2R', count: 0, pct: 0 },
        { label: '+1R to +2R', count: 15, pct: 83.3 },
        { label: '0 to +1R', count: 0, pct: 0 },
        { label: '-1R to 0', count: 3, pct: 16.7 }
      ]
    },
    scriptData: {
      mx: 30000,
      monthlyPnl: [
        { year: 2026, aug: 6.55, sep: 7.86, oct: 5.24, nov: 2.53, total: 22.18 }
      ]
    }
  },
  'ps-03': {
    folder: 'Pine_PS-03',
    num: 3,
    slug: 'ps-03',
    titleRaw: 'London Core Expansion (Single-Digit DD 1.0%)',
    subtitle: 'StratMarket Quantitative Performance Report: FOREXCOM:XAUUSD M15, TradingView Pine Script v5 Engine. August 2 to November 9, 2026. Zero lookahead confirmed.',
    bigStats: [
      { val: '+25.58R', label: 'Net Return' },
      { val: '4.65', label: 'Profit Factor' },
      { val: '1.0% (1.0R)', label: 'Max Drawdown' },
      { val: '80.0%', label: 'Win Rate (20W / 5L)' },
      { val: '25.58', label: 'Calmar Ratio' }
    ],
    kpiRows: [
      { label: 'Total Executed Trades', val: '25 trades' },
      { label: 'Winning Trades', val: '20 trades (80.0%)' },
      { label: 'Losing Trades', val: '5 trades (20.0%)' },
      { label: 'Max Consecutive Wins', val: '8 trades' },
      { label: 'Max Consecutive Losses', val: '1 trade' },
      { label: 'Target / Risk Structure', val: '+$16.00 TP / -$13.75 SL (1:1.16 R:R)' },
      { label: 'Trading Session', val: '04:00-20:00 UTC (12:00 UTC Chop Excluded)' },
      { label: 'Tradeify Consistency Rule', val: 'PASS (Max single day profit < 9.5% vs 40% cap)' },
      { label: 'Flash Crash Protective Filter', val: 'ATR 1.25 Shield Active' },
      { label: 'Annualized Calmar', val: '97.26' }
    ],
    payoff: {
      payoffRatio: '1.16:1',
      avgWin: '+1.16R',
      avgLoss: '−1.00R',
      maxConsecWins: 8,
      maxConsecLosses: 1,
      winRate: '80.0%',
      profitFactor: '4.65',
      expectancy: '+0.73R / trade',
      lossRate: '20.0%',
      totalTrades: 25,
      avgR: '1.16R',
      distribution: [
        { label: '> +2R', count: 0, pct: 0 },
        { label: '+1R to +2R', count: 20, pct: 80.0 },
        { label: '0 to +1R', count: 0, pct: 0 },
        { label: '-1R to 0', count: 5, pct: 20.0 }
      ]
    },
    scriptData: {
      mx: 32000,
      monthlyPnl: [
        { year: 2026, aug: 7.30, sep: 8.47, oct: 6.13, nov: 3.68, total: 25.58 }
      ]
    }
  }
};

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
console.log('Enriched pineReports.json successfully with full payoff and monthly breakdown!');

