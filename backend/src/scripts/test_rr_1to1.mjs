import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

console.log(`Loaded ${candles.length} 1H candles.`);

// Test strategy where R:R is strictly >= 1:1
// Method A: Dynamic TP = slDist * rrRatio (e.g. rrRatio = 1.0, 1.2, 1.5)
// Method B: Fixed TP >= Fixed SL (e.g. TP $15, SL $12 -> 1:1.25 R:R)
const codeDynamicRR = (rrRatio, maxSL, minSL, bandLen, bandMult, rsiFilter, beTriggerR, useEMAAlign) => `//@version=6
strategy("DynamicRR_1H", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bandLen})
dev = ${bandMult} * ta.stdev(close, ${bandLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

${useEMAAlign ? `
longCond = close > ema200 and low <= lower and close > open and rsi < ${rsiFilter} and strategy.position_size == 0
shortCond = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${100 - rsiFilter} and strategy.position_size == 0
` : `
longCond = close > ema200 and low <= lower and close > open and rsi < ${rsiFilter} and strategy.position_size == 0
shortCond = close < ema200 and high >= upper and close < open and rsi > ${100 - rsiFilter} and strategy.position_size == 0
`}

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
        tpP := ep + sDist * ${rrRatio}
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
        tpP := ep - sDist * ${rrRatio}
        isBE := false
        strategy.entry("S", strategy.short)
        strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTriggerR > 0 ? `
    if not isBE and currentGain >= slDistInit * ${beTriggerR}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)
`;

async function test() {
  console.log('--- TESTING DYNAMIC R:R (>= 1:1) ON 10,568 1H CANDLES ---');
  for (const rr of [1.0, 1.1, 1.2, 1.3, 1.5]) {
    for (const maxSL of [15.0, 20.0, 25.0]) {
      for (const minSL of [4.0, 6.0]) {
        for (const beTrigger of [0.0, 0.5, 0.6]) {
          for (const bandMult of [2.0, 2.2]) {
            const c = codeDynamicRR(rr, maxSL, minSL, 25, bandMult, 45, beTrigger, true);
            const p = new PineTS(candles, 'XAUUSD', '60');
            await p.ready();
            const res = await p.run(c);
            const s = res.strategy;
            const trades = s.closedtrades || [];
            if (trades.length < 25) continue;
            const wins = trades.filter(t => t.profit > 0);
            const wr = (wins.length / trades.length) * 100;
            const net = s.netprofit;
            const dd = s.max_drawdown || 1;
            const calmar = net / dd;

            if (net > 100 && calmar >= 3.0) {
              let avgWin = 0, avgLoss = 0;
              const wTrades = trades.filter(t => t.profit > 0);
              const lTrades = trades.filter(t => t.profit <= 0);
              if (wTrades.length) avgWin = wTrades.reduce((acc, t) => acc + t.profit, 0) / wTrades.length;
              if (lTrades.length) avgLoss = Math.abs(lTrades.reduce((acc, t) => acc + t.profit, 0) / lTrades.length);
              const realRR = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A';

              console.log(`RR: ${rr}:1 | MaxSL: $${maxSL} | BE: ${beTrigger} | BM: ${bandMult} -> Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: $${net.toFixed(2)} | DD: $${dd.toFixed(2)} | Calmar: ${calmar.toFixed(2)} | AvgWin: $${avgWin.toFixed(2)} | AvgLoss: -$${avgLoss.toFixed(2)} | Real R:R: 1:${realRR}`);
            }
          }
        }
      }
    }
  }
}

test().catch(console.error);
