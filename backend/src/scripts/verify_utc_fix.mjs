import fs from 'fs';
import { PineTS } from 'pinets';

async function testUTCFix() {
  const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const codeUTC = `//@version=5
strategy("TestUTC", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

// Explicitly locked to UTC across ALL platforms and exchanges:
h = hour(time, "UTC")
inActiveSession = (h >= 1 and h <= 20) and (h != 12)

longSig = inActiveSession and close > (ema200 + 4.0) and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 48 and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 14.0
    tpP := ep + 18.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 14.0
    tpP := ep - 18.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const res = await p.run(codeUTC);
  const s = res.strategy;
  const tr = s.closedtrades || [];
  const wins = tr.filter(t => t.profit > 0);
  console.log(`\n=== WITH hour(time, "UTC") ===`);
  console.log(`Total Trades: ${tr.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${tr.length - wins.length}`);
  console.log(`Win Rate: ${(wins.length / tr.length * 100).toFixed(2)}%`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)}`);

  const mProfit = {};
  const mTrades = {};
  const mWins = {};
  for (const t of tr) {
    const d = new Date(t.entry_time);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    mProfit[m] = (mProfit[m] || 0) + t.profit;
    mTrades[m] = (mTrades[m] || 0) + 1;
    if (t.profit > 0) mWins[m] = (mWins[m] || 0) + 1;
  }
  for (const m of Object.keys(mProfit).sort()) {
    console.log(`  ${m}: ${mTrades[m]} trades | ${mWins[m]}W / ${mTrades[m] - mWins[m]}L | +${(mProfit[m] / 14.0).toFixed(2)}R (+$${mProfit[m].toFixed(2)})`);
  }
}

testUTCFix().catch(console.error);
