import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Test fixed SL and TP where TP >= SL (R:R >= 1:1 guaranteed)
const makeCode = (tpPips, slPips, bandLen, bandMult, rsiFilter, beTriggerR, useEMAAlign) => `//@version=6
strategy("FixedRR_1H", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

tpDist = ${tpPips} / 10.0
slDist = ${slPips} / 10.0

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
var bool isBE = false

if longCond
    ep := close
    currSL := close - slDist
    tpP := close + tpDist
    isBE := false
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := close + slDist
    tpP := close - tpDist
    isBE := false
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTriggerR > 0 ? `
    if not isBE and currentGain >= slDist * ${beTriggerR}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)
`;

async function main() {
  console.log('--- TESTING FIXED TP >= SL (R:R >= 1:1 GUARANTEED) ---');
  for (const sl of [10.0, 12.0, 14.0, 15.0]) {
    for (const tp of [sl, sl * 1.1, sl * 1.2, sl * 1.3, sl * 1.5]) {
      for (const beR of [0.0, 0.4, 0.5]) {
        for (const bandMult of [2.0, 2.2]) {
          for (const rsiFilter of [45, 50]) {
            const tpPips = tp * 10.0;
            const slPips = sl * 10.0;
            const code = makeCode(tpPips, slPips, 25, bandMult, rsiFilter, beR, true);
            const p = new PineTS(candles, 'XAUUSD', '60');
            await p.ready();
            const res = await p.run(code);
            const s = res.strategy;
            const trades = s.closedtrades || [];
            if (trades.length < 30) continue;
            const wins = trades.filter(t => t.profit > 0);
            const wr = (wins.length / trades.length) * 100;
            const net = s.netprofit;
            const dd = s.max_drawdown || 1;
            const calmar = net / dd;

            if (calmar >= 4.0 && net > 150) {
              const wTrades = trades.filter(t => t.profit > 0);
              const lTrades = trades.filter(t => t.profit <= 0);
              const avgWin = wTrades.reduce((acc, t) => acc + t.profit, 0) / wTrades.length;
              const avgLoss = lTrades.length ? Math.abs(lTrades.reduce((acc, t) => acc + t.profit, 0) / lTrades.length) : 0;
              const realRR = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A';
              console.log(`TP: $${tp.toFixed(1)} | SL: $${sl.toFixed(1)} | BE: ${beR} | BM: ${bandMult} | RSI: ${rsiFilter} -> Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: $${net.toFixed(2)} | DD: $${dd.toFixed(2)} | Calmar: ${calmar.toFixed(2)} | AvgWin: $${avgWin.toFixed(2)} | AvgLoss: -$${avgLoss.toFixed(2)} | Real R:R: 1:${realRR}`);
            }
          }
        }
      }
    }
  }
}

main().catch(console.error);
