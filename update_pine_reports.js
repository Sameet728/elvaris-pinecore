const fs = require('fs');
const path = require('path');

const filePath = 'C:/Users/samee/Desktop/StratMarket/StratMarket/src/lib/data/pineReports.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// 1. Update ps-01
data['ps-01'] = {
  folder: 'Pine_PS-01',
  num: 1,
  slug: 'ps-01',
  titleRaw: 'Grandmaster Dual 10R / 8R (Single-Digit DD 2.0%)',
  subtitle: 'StratMarket Performance Report: XAUUSD M15, TradingView Pine Script v5 Engine. 6,800 bars (2 Aug to 9 Nov 2026). Normalized institutional risk model.',
  bigStats: [
    { val: '+27.65R', label: 'Net Return' },
    { val: '4.07', label: 'Profit Factor' },
    { val: '2.0%', label: 'Max Drawdown' },
    { val: '80.0%', label: 'Win Rate' },
    { val: '13.83', label: 'Calmar Ratio' }
  ],
  kpiRows: [
    { label: 'Total Executed Trades', val: '45 trades' },
    { label: 'Winning Trades', val: '36 trades (80.0%)' },
    { label: 'Losing Trades', val: '9 trades (20.0%)' },
    { label: 'Max Consecutive Wins', val: '10 trades' },
    { label: 'Max Consecutive Losses', val: '2 trades' },
    { label: 'Take Profit / Stop Loss', val: '$14.00 / $13.75' },
    { label: 'Session Hours', val: '01:00-20:00 UTC (excl 12:00)' },
    { label: 'Prop Compliance', val: '100% (Tradeify / Apex)' }
  ]
};

// 2. Update ps-02 (US Afternoon Reversal)
data['ps-02'] = {
  folder: 'Pine_PS-02',
  num: 2,
  slug: 'ps-02',
  titleRaw: 'US Afternoon Reversal (Single-Digit DD 1.0%)',
  subtitle: 'StratMarket Performance Report: XAUUSD M15, TradingView Pine Script v5 Engine. 6,800 bars (2 Aug to 9 Nov 2026). Normalized institutional risk model.',
  bigStats: [
    { val: '+22.18R', label: 'Net Return' },
    { val: '6.55', label: 'Profit Factor' },
    { val: '1.0%', label: 'Max Drawdown' },
    { val: '83.3%', label: 'Win Rate' },
    { val: '22.18', label: 'Calmar Ratio' }
  ],
  kpiRows: [
    { label: 'Total Executed Trades', val: '18 trades' },
    { label: 'Winning Trades', val: '15 trades (83.3%)' },
    { label: 'Losing Trades', val: '3 trades (16.7%)' },
    { label: 'Max Consecutive Losses', val: '1 trade' },
    { label: 'Take Profit / Stop Loss', val: '$18.00 / $13.75' },
    { label: 'Session Hours', val: '14:00-22:00 UTC (US Afternoon)' },
    { label: 'Prop Compliance', val: '100% (Tradeify / Apex)' }
  ]
};

// 3. Update ps-03 (London Core Expansion)
data['ps-03'] = {
  folder: 'Pine_PS-03',
  num: 3,
  slug: 'ps-03',
  titleRaw: 'London Core Expansion (Single-Digit DD 1.0%)',
  subtitle: 'StratMarket Performance Report: XAUUSD M15, TradingView Pine Script v5 Engine. 6,800 bars (2 Aug to 9 Nov 2026). Normalized institutional risk model.',
  bigStats: [
    { val: '+25.58R', label: 'Net Return' },
    { val: '4.65', label: 'Profit Factor' },
    { val: '1.0%', label: 'Max Drawdown' },
    { val: '80.0%', label: 'Win Rate' },
    { val: '25.58', label: 'Calmar Ratio' }
  ],
  kpiRows: [
    { label: 'Total Executed Trades', val: '25 trades' },
    { label: 'Winning Trades', val: '20 trades (80.0%)' },
    { label: 'Losing Trades', val: '5 trades (20.0%)' },
    { label: 'Max Consecutive Losses', val: '1 trade' },
    { label: 'Take Profit / Stop Loss', val: '$16.00 / $13.75' },
    { label: 'Session Hours', val: '04:00-20:00 UTC (excl 12:00)' },
    { label: 'Prop Compliance', val: '100% (Tradeify / Apex)' }
  ]
};

// 4. Remove ps-04
delete data['ps-04'];

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
console.log('Updated pineReports.json successfully! Remaining keys:', Object.keys(data));

