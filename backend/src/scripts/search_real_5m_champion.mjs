import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const n = candles.length;
console.log(`Searching for Genuine 5M Champion on ${n} candles...`);

const p5 = new PineTS(candles, 'XAUUSD', '5');
await p5.ready();

// Let's test a parameter grid on 5M using the proven confirmed candle close & bracket exit architecture
const candidates = [
  { bLen: 20, bMult: 2.2, sl: 4.0, tp: 8.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 24, bMult: 2.3, sl: 5.0, tp: 10.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 28, bMult: 2.4, sl: 5.0, tp: 10.0, rsi: 52, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 30, bMult: 2.5, sl: 6.0, tp: 12.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 20, bMult: 2.2, sl: 4.0, tp: 6.0, rsi: 52, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 26, bMult: 2.4, sl: 5.0, tp: 8.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 30, bMult: 2.6, sl: 5.0, tp: 10.0, rsi: 48, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 35, bMult: 2.8, sl: 5.0, tp: 10.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 40, bMult: 2.8, sl: 6.0, tp: 12.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 28, bMult: 2.5, sl: 4.0, tp: 8.0, rsi: 45, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 25, bMult: 2.4, sl: 4.0, tp: 7.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 },
  { bLen: 20, bMult: 2.5, sl: 5.0, tp: 10.0, rsi: 50, offset: 0.0, sStart: 1, sEnd: 19 }
];

const results = [];

for (const c of candidates) {
  const code = `//@version=5
strategy("Test5M", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${c.bLen})
dev = ${c.bMult} * ta.stdev(close, ${c.bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${c.sStart} and utcHour <= ${c.sEnd})

longSig = inActiveSession and close > (ema200 + ${c.offset}) and low <= lower and close > open and rsi < ${c.rsi} and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${c.rsi}) and strategy.position_size == 0

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

  const res = await p5.run(code);
  const trades = res.strategy?.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const net = res.strategy?.netprofit || 0;
  const maxDD = res.strategy?.max_drawdown || 1;

  if (trades.length >= 10 && net > 0) {
    results.push({
      ...c,
      trades: trades.length,
      wins: wins.length,
      losses: trades.length - wins.length,
      wr: Number(wr.toFixed(2)),
      net: Number(net.toFixed(2)),
      maxDD: Number(maxDD.toFixed(2)),
      calmar: Number((net / maxDD).toFixed(2))
    });
  }
}

results.sort((a, b) => b.wr - a.wr || b.calmar - a.calmar);

console.log(`\nFound ${results.length} valid 5M candidates:`);
results.forEach((r, i) => {
  console.log(`#${i+1}: BB(${r.bLen}, ${r.bMult}) | SL: $${r.sl} / TP: $${r.tp} | RSI: <${r.rsi} -> ${r.trades} trades | WR: ${r.wr}% | Net: $${r.net} | DD: $${r.maxDD} | Calmar: ${r.calmar}`);
});
