import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Test combinations targeting >75%-80% Win Rate with R:R >= 1:1
const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger, cool) => `//@version=6
strategy("HighWR_1to1", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

tpDist = ${tp}
slDist = ${sl}

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${blen})
dev = ${bmult} * ta.stdev(close, ${blen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

var int lastLossBar = -999

longCond = (bar_index - lastLossBar > ${cool}) and close > ema200 and low <= lower and close > open and rsi < ${rsiL} and strategy.position_size == 0
shortCond = (bar_index - lastLossBar > ${cool}) and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${100 - rsiL} and strategy.position_size == 0

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

    ${beTrigger > 0 ? `
    if not isBE and currentGain >= slDist * ${beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)

if strategy.closedtrades > strategy.closedtrades[1]
    if strategy.closedtrades.profit(strategy.closedtrades - 1) < -0.05
        lastLossBar := bar_index
`;

async function main() {
  console.log('--- SEARCHING FOR >75%-80% WIN RATE WITH R:R >= 1:1 ---');
  let topCandidates = [];

  for (const sl of [8.0, 10.0, 12.0]) {
    for (const tp of [sl, sl * 1.1, sl * 1.25, sl * 1.5]) {
      for (const blen of [20, 25, 30]) {
        for (const bmult of [2.2, 2.4, 2.6]) {
          for (const rsiL of [35, 40, 45]) {
            for (const beTrigger of [0.0, 0.4, 0.5]) {
              for (const cool of [0, 2, 4]) {
                const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger, cool);
                const p = new PineTS(candles, 'XAUUSD', '60');
                await p.ready();
                const res = await p.run(code);
                const s = res.strategy;
                const trades = s.closedtrades || [];
                if (trades.length < 25) continue;
                const wins = trades.filter(t => t.profit > 0);
                const wr = (wins.length / trades.length) * 100;
                const net = s.netprofit;
                const dd = s.max_drawdown || 1;
                const calmar = net / dd;

                if (wr >= 75.0 && calmar >= 4.0 && net > 150) {
                  const wTrades = trades.filter(t => t.profit > 0);
                  const lTrades = trades.filter(t => t.profit <= 0);
                  const avgWin = wTrades.reduce((acc, t) => acc + t.profit, 0) / wTrades.length;
                  const avgLoss = lTrades.length ? Math.abs(lTrades.reduce((acc, t) => acc + t.profit, 0) / lTrades.length) : 0;
                  const realRR = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : 'N/A';
                  console.log(`⭐ [MATCH] TP: $${tp.toFixed(1)} | SL: $${sl.toFixed(1)} | BM: ${bmult} | RSI: ${rsiL} | BE: ${beTrigger} | Cool: ${cool} -> Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: $${net.toFixed(2)} | DD: $${dd.toFixed(2)} | Calmar: ${calmar.toFixed(2)} | AvgWin: $${avgWin.toFixed(2)} | AvgLoss: -$${avgLoss.toFixed(2)} | Real R:R: 1:${realRR}`);
                  topCandidates.push({ tp, sl, blen, bmult, rsiL, beTrigger, cool, wr, net, dd, calmar, trades: trades.length, avgWin, avgLoss, realRR });
                }
              }
            }
          }
        }
      }
    }
  }

  topCandidates.sort((a, b) => b.wr - a.wr);
  console.log('\n=== TOP 3 STRATEGIES FOUND ===');
  topCandidates.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1}: WR: ${c.wr.toFixed(1)}% | Net: $${c.net.toFixed(2)} | DD: $${c.dd.toFixed(2)} | Calmar: ${c.calmar.toFixed(2)} | Trades: ${c.trades} | AvgWin: $${c.avgWin.toFixed(2)} | AvgLoss: -$${c.avgLoss.toFixed(2)} | Real R:R: 1:${c.realRR}`);
    console.log('Params:', c);
  });
}

main().catch(console.error);
