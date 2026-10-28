import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function analyze51() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("Candidate51", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= 1 and hour <= 20)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
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

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];

  console.log(`Total Trades: ${trades.length}`);
  const losses = trades.filter(t => t.profit <= 0);
  const wins = trades.filter(t => t.profit > 0);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length} | Win Rate: ${(wins.length / trades.length * 100).toFixed(2)}%`);

  console.log(`\n=== 11 LOSSES ===`);
  for (let i = 0; i < losses.length; i++) {
    const t = losses[i];
    const d = new Date(t.entry_time);
    console.log(`Loss #${i+1}: ${t.entry_id.padEnd(5)} | Entry: ${d.toISOString().substring(0, 16)} (H:${d.getUTCHours()}) @ $${t.entry_price.toFixed(2)} -> Exit: @ $${t.exit_price.toFixed(2)}`);
  }

  // Monthly summary
  const mR = {};
  const mW = {};
  const mL = {};
  for (const t of trades) {
    const m = new Date(t.entry_time).toISOString().substring(0, 7);
    mR[m] = (mR[m] || 0) + (t.profit / 14.0);
    if (t.profit > 0) mW[m] = (mW[m] || 0) + 1;
    else mL[m] = (mL[m] || 0) + 1;
  }
  console.log(`\nMonthly breakdown:`, mR);
  console.log(`Monthly Wins:`, mW);
  console.log(`Monthly Losses:`, mL);
}

analyze51().catch(console.error);
