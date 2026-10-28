import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testNoHour12() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("Champion_Dual10R_Oct8R", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

// Active Session: 01:00 to 20:00 UTC, excluding 12:00-13:00 UTC (London Lunch / Pre-US Chop)
inActiveSession = (hour >= 1 and hour <= 20) and (hour != 12)

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

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];
  const wins = trades.filter(tr => tr.profit > 0);
  const wr = (wins.length / trades.length) * 100;

  const mR = {};
  const mW = {};
  const mL = {};
  for (const tr of trades) {
    const m = new Date(tr.entry_time).toISOString().substring(0, 7);
    mR[m] = (mR[m] || 0) + (tr.profit / 14.0);
    if (tr.profit > 0) mW[m] = (mW[m] || 0) + 1;
    else mL[m] = (mL[m] || 0) + 1;
  }

  const netR = res.strategy.netprofit / 14.0;
  const maxDD = (res.strategy.max_drawdown || 1) / 14.0;
  const calmar = maxDD > 0 ? (netR / maxDD) : 0;

  console.log(`\n======================================================`);
  console.log(`🏆 GRANDMASTER CHAMPION RESULT (hour != 12):`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${trades.length - wins.length}`);
  console.log(`Win Rate: ${wr.toFixed(2)}%`);
  console.log(`Net Profit: $${res.strategy.netprofit.toFixed(2)} (+${netR.toFixed(2)}R)`);
  console.log(`Max Drawdown: $${res.strategy.max_drawdown?.toFixed(2)} (${maxDD.toFixed(2)}R)`);
  console.log(`Calmar Ratio: ${calmar.toFixed(2)}`);

  console.log(`\nMonthly Breakdown:`);
  for (const m of Object.keys(mR).sort()) {
    console.log(`  ${m}: ${mW[m] + mL[m]} trades | ${mW[m]}W / ${mL[m]}L (${(mW[m]/(mW[m]+mL[m])*100).toFixed(1)}% WR) | Return: +${mR[m].toFixed(2)}R`);
  }
}

testNoHour12().catch(console.error);
