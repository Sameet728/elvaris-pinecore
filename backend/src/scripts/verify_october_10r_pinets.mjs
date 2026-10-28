import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testPineTS() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const configs = [
    {
      name: "Config #1: BB(26, 2.35) | Offset $0 | Wick 0.1 | Sess 1-19 excl12",
      bLen: 26, bMult: 2.35, rsiF: 52, sl: 10.0, tp: 20.0, offset: 0.0, sStart: 1, sEnd: 19, exclH12: true, wick: 0.1
    },
    {
      name: "Config #2: BB(26, 2.35) | Offset $0 | Wick 0.1 | Sess 1-19 (All Hours)",
      bLen: 26, bMult: 2.35, rsiF: 52, sl: 10.0, tp: 20.0, offset: 0.0, sStart: 1, sEnd: 19, exclH12: false, wick: 0.1
    },
    {
      name: "Config #4: BB(26, 2.35) | Offset $4 | Wick 0.0 | Sess 1-19 excl12",
      bLen: 26, bMult: 2.35, rsiF: 52, sl: 10.0, tp: 20.0, offset: 4.0, sStart: 1, sEnd: 19, exclH12: true, wick: 0.0
    },
    {
      name: "Config #11: BB(26, 2.35) | Offset $3 | Wick 0.0 | RSI <54 | Sess 1-19 excl12",
      bLen: 26, bMult: 2.35, rsiF: 54, sl: 10.0, tp: 20.0, offset: 3.0, sStart: 1, sEnd: 19, exclH12: true, wick: 0.0
    }
  ];

  for (const c of configs) {
    const exclStr = c.exclH12 ? ' and (utcHour != 12)' : '';
    const wickStrLong = c.wick > 0 ? ` and (math.min(open, close) - low) >= (math.abs(close - open) * ${c.wick})` : '';
    const wickStrShort = c.wick > 0 ? ` and (high - math.max(open, close)) >= (math.abs(close - open) * ${c.wick})` : '';

    const code = `//@version=5
strategy("TestBoost10R", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${c.bLen})
dev = ${c.bMult} * ta.stdev(close, ${c.bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${c.sStart} and utcHour <= ${c.sEnd})${exclStr}

longSig = inActiveSession and close > (ema200 + ${c.offset}) and low <= lower and close > open and rsi < ${c.rsiF}${wickStrLong} and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${c.rsiF})${wickStrShort} and strategy.position_size == 0

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
    const wr = (wins.length / trades.length) * 100;
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
    console.log(`Win Rate: ${wr.toFixed(2)}% | Net Profit: $${res.strategy.netprofit.toFixed(2)} (+${netR.toFixed(2)}R)`);
    console.log(`Max Drawdown: $${res.strategy.max_drawdown?.toFixed(2)} (${maxDD.toFixed(2)}R) | Calmar: ${calmar.toFixed(2)}`);
    console.log(`Monthly Breakdown:`);
    for (const m of Object.keys(mR).sort()) {
      console.log(`  ${m}: ${mW[m] + mL[m]} trades | ${mW[m]}W / ${mL[m]}L | Return: +${mR[m].toFixed(2)}R`);
    }
  }
}

testPineTS().catch(console.error);
