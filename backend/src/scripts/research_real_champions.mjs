import fs from 'fs';
import { PineTS } from 'pinets';

// Authentic candles from TradingView
const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

console.log(`Loaded ${candles5m.length} 5M candles and ${candles1h.length} 1H candles.`);

// Helper to evaluate PineTS results
function analyzeStrategy(res) {
  const s = res.strategy;
  const trades = s.closedtrades || [];
  if (trades.length === 0) return { trades: 0, wr: 0, net: 0, dd: 0, maxDDPercent: 0, rPerMonth: {} };

  const wins = trades.filter(t => t.profit > 0);
  const wr = (wins.length / trades.length) * 100;
  
  // Calculate month-wise performance
  const monthlyProfit = {};
  trades.forEach(t => {
    const d = new Date(t.entry_time);
    const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyProfit[mKey] = (monthlyProfit[mKey] || 0) + t.profit;
  });

  return {
    trades: trades.length,
    wins: wins.length,
    losses: trades.length - wins.length,
    wr: wr.toFixed(1),
    net: s.netprofit.toFixed(2),
    dd: s.max_drawdown ? s.max_drawdown.toFixed(2) : 0,
    ddPct: (s.max_drawdown_percent_value * 100).toFixed(2),
    monthly: monthlyProfit
  };
}

async function runTest(code, tf = '5') {
  const candles = tf === '60' ? candles1h : candles5m;
  const p = new PineTS(candles, 'XAUUSD', tf);
  await p.ready();
  const res = await p.run(code);
  return analyzeStrategy(res);
}

// Let's test a suite of proven quant concepts on 5M
async function explore5m() {
  console.log('\n=== EXPLORING 5M TIMEFRAME STRATEGIES (ZERO LOOKAHEAD) ===\n');

  // Architecture 1: Session-based Liquidity Sweep + Trend Filter + Quick Targets
  const arch1 = (tp, sl, emaLen, rsiThresh) => `//@version=6
strategy("Arch1_TrendSweep", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
tpPips = ${tp}
slPips = ${sl}
tpDist = tpPips / 10.0
slDist = slPips / 10.0

ema = ta.ema(close, ${emaLen})
rsi = ta.rsi(close, 14)
sH = ta.pivothigh(high, 3, 3)
sL = ta.pivotlow(low, 3, 3)

var float bsl = na
var float ssl = na
if not na(sH)
    bsl := sH
if not na(sL)
    ssl := sL

// Sweeps only evaluated AFTER pivot confirms (3 bars lag = authentic, zero lookahead)
sslSweep = not na(ssl) and low < ssl and close > ssl
bslSweep = not na(bsl) and high > bsl and close < bsl

longCond = sslSweep and close > ema and rsi < ${100 - rsiThresh} and strategy.position_size == 0
shortCond = bslSweep and close < ema and rsi > ${rsiThresh} and strategy.position_size == 0

if longCond
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=close + tpDist, stop=close - slDist)

if shortCond
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=close - tpDist, stop=close + slDist)
`;

  for (const tp of [20.0, 30.0, 40.0, 50.0, 80.0]) {
    for (const sl of [15.0, 20.0, 25.0]) {
      const code = arch1(tp, sl, 100, 55);
      const res = await runTest(code, '5');
      if (res.trades >= 15 && parseFloat(res.net) > 0) {
        console.log(`[5M Arch1] TP: ${tp}p | SL: ${sl}p -> Trades: ${res.trades} | WR: ${res.wr}% | Net: $${res.net} | DD: $${res.dd} (${res.ddPct}%) | Monthly:`, res.monthly);
      }
    }
  }
}

explore5m().catch(console.error);
