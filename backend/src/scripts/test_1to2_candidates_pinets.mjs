import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testPineTS1to2() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const candidates = [
    {
      name: "Grandmaster 1:2 R:R (SL $10 / TP $20 | BB 30, 2.2 | Both Sides)",
      sl: 10.0, tp: 20.0, bLen: 30, bMult: 2.2, rsiF: 52, emaOffset: 4.0, longOnly: false
    },
    {
      name: "Grandmaster 1:2 R:R (SL $10 / TP $20 | BB 28, 2.1 | Both Sides)",
      sl: 10.0, tp: 20.0, bLen: 28, bMult: 2.1, rsiF: 52, emaOffset: 4.0, longOnly: false
    },
    {
      name: "Grandmaster 1:2 R:R (SL $11 / TP $22 | BB 30, 2.2 | Both Sides)",
      sl: 11.0, tp: 22.0, bLen: 30, bMult: 2.2, rsiF: 52, emaOffset: 4.0, longOnly: false
    },
    {
      name: "Grandmaster 1:2 R:R (SL $12 / TP $24 | BB 30, 2.1 | Long Only)",
      sl: 12.0, tp: 24.0, bLen: 30, bMult: 2.1, rsiF: 54, emaOffset: 4.0, longOnly: true
    },
    {
      name: "Grandmaster 1:2 R:R (SL $10 / TP $20 | BB 35, 2.3 | Both Sides)",
      sl: 10.0, tp: 20.0, bLen: 35, bMult: 2.3, rsiF: 52, emaOffset: 4.0, longOnly: false
    }
  ];

  for (const c of candidates) {
    const shortLogic = c.longOnly
      ? 'shortSig = false'
      : `shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${c.rsiF}) and strategy.position_size == 0`;

    const code = `//@version=5
strategy("Test1to2", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${c.bLen})
dev = ${c.bMult} * ta.stdev(close, ${c.bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= 1 and utcHour <= 20) and (utcHour != 12)

longSig = inActiveSession and close > (ema200 + ${c.emaOffset}) and low <= lower and close > open and rsi < ${c.rsiF} and strategy.position_size == 0
${shortLogic}

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${c.sl}
    tpP := ep + ${c.tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${c.sl}
    tpP := ep - ${c.tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

    const res = await p.run(code);
    const trades = res.strategy.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0);
    const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const netR = res.strategy.netprofit / c.sl;
    const maxDD = (res.strategy.max_drawdown || 1) / c.sl;
    const calmar = maxDD > 0 ? (netR / maxDD) : 0;

    const mR = {};
    const mW = {};
    const mL = {};
    for (const t of trades) {
      const m = new Date(t.entry_time).toISOString().substring(0, 7);
      mR[m] = (mR[m] || 0) + (t.profit / c.sl);
      if (t.profit > 0) mW[m] = (mW[m] || 0) + 1;
      else mL[m] = (mL[m] || 0) + 1;
    }

    console.log(`\n======================================================`);
    console.log(`🏆 ${c.name}:`);
    console.log(`Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${trades.length - wins.length}`);
    console.log(`Win Rate: ${wr.toFixed(2)}%`);
    console.log(`Net Profit: $${res.strategy.netprofit.toFixed(2)} (+${netR.toFixed(2)}R)`);
    console.log(`Max Drawdown: $${res.strategy.max_drawdown?.toFixed(2)} (${maxDD.toFixed(2)}R)`);
    console.log(`Calmar Ratio: ${calmar.toFixed(2)}`);
    console.log(`Monthly Breakdown:`);
    for (const m of Object.keys(mR).sort()) {
      console.log(`  ${m}: ${mW[m] + mL[m]} trades | ${mW[m]}W / ${mL[m]}L | Return: +${mR[m].toFixed(2)}R`);
    }
  }
}

testPineTS1to2().catch(console.error);
