import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Detailed tuning of dynamic R:R >= 1:1
const codeDynamic = (rr, maxSL, minSL, beTrigger, bandLen, bandMult, rsiFilter, emaLen) => `//@version=6
strategy("TuneRR", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, ${emaLen})
basis = ta.sma(close, ${bandLen})
dev = ${bandMult} * ta.stdev(close, ${bandLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longCond = close > ema200 and low <= lower and close > open and rsi < ${rsiFilter} and strategy.position_size == 0
shortCond = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${100 - rsiFilter} and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na
var float slDistInit = na
var bool isBE = false

if longCond
    ep := close
    rawSL = low - atr * 1.0
    sDist = ep - rawSL
    if sDist >= ${minSL} and sDist <= ${maxSL}
        slDistInit := sDist
        currSL := rawSL
        tpP := ep + sDist * ${rr}
        isBE := false
        strategy.entry("L", strategy.long)
        strategy.exit("XL", "L", limit=tpP, stop=currSL)

if shortCond
    ep := close
    rawSL = high + atr * 1.0
    sDist = rawSL - ep
    if sDist >= ${minSL} and sDist <= ${maxSL}
        slDistInit := sDist
        currSL := rawSL
        tpP := ep - sDist * ${rr}
        isBE := false
        strategy.entry("S", strategy.short)
        strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTrigger > 0 ? `
    if not isBE and currentGain >= slDistInit * ${beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)
`;

async function test() {
  console.log('--- FINDING HIGHEST WIN RATE WITH R:R >= 1:1 AND CALMAR >= 4.0 ---');
  let best = [];

  for (const rr of [1.0, 1.05, 1.1, 1.15, 1.2]) {
    for (const maxSL of [14, 16, 18, 20, 22]) {
      for (const beTrigger of [0.45, 0.50, 0.55, 0.60]) {
        for (const bandMult of [2.0, 2.1, 2.2]) {
          for (const rsiFilter of [42, 45, 48]) {
            const code = codeDynamic(rr, maxSL, 5.0, beTrigger, 25, bandMult, rsiFilter, 200);
            const p = new PineTS(candles, 'XAUUSD', '60');
            await p.ready();
            const res = await p.run(code);
            const s = res.strategy;
            const trades = s.closedtrades || [];
            if (trades.length < 25) continue;
            const wins = trades.filter(t => t.profit > 0);
            const losses = trades.filter(t => t.profit <= 0);
            const wr = (wins.length / trades.length) * 100;
            const net = s.netprofit;
            const dd = s.max_drawdown || 1;
            const calmar = net / dd;

            const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / wins.length;
            const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 0;
            const realRR = avgLoss > 0 ? avgWin / avgLoss : 0;

            if (realRR >= 1.0 && calmar >= 4.0 && wr >= 72.0) {
              console.log(`⭐ RR_Target: ${rr}:1 | MaxSL: $${maxSL} | BE: ${beTrigger} | BM: ${bandMult} | RSI: ${rsiFilter} -> Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: $${net.toFixed(2)} | DD: $${dd.toFixed(2)} | Calmar: ${calmar.toFixed(2)} | AvgWin: $${avgWin.toFixed(2)} | AvgLoss: -$${avgLoss.toFixed(2)} | Real R:R: 1:${realRR.toFixed(2)}`);
              best.push({ rr, maxSL, beTrigger, bandMult, rsiFilter, trades: trades.length, wr, net, dd, calmar, avgWin, avgLoss, realRR });
            }
          }
        }
      }
    }
  }

  best.sort((a, b) => b.wr - a.wr);
  console.log('\n=== TOP 5 HIGHEST WIN RATE WITH REAL R:R >= 1:1 ===');
  best.slice(0, 5).forEach((b, i) => {
    console.log(`#${i+1}: WR: ${b.wr.toFixed(1)}% | Real R:R: 1:${b.realRR.toFixed(2)} | Calmar: ${b.calmar.toFixed(2)} | Net: $${b.net.toFixed(2)} | DD: $${b.dd.toFixed(2)} | Trades: ${b.trades}`);
    console.log(`Params: RR_Target=${b.rr}, MaxSL=$${b.maxSL}, BE=${b.beTrigger}, BandMult=${b.bandMult}, RSI=${b.rsiFilter}`);
  });
}

test().catch(console.error);
