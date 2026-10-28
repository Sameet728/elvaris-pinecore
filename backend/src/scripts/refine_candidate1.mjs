import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

function calculateR2(equitySeries) {
  const n = equitySeries.length;
  if (n < 5) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = equitySeries[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return 0;
  const r = numerator / denominator;
  return r * r;
}

const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger) => `//@version=6
strategy("Smooth_Candidate", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${blen})
dev = ${bmult} * ta.stdev(close, ${blen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longCond = close > ema200 and low <= lower and close > open and rsi < ${rsiL} and strategy.position_size == 0
shortCond = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${100 - rsiL} and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    isBE := false
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    isBE := false
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTrigger > 0 ? `
    if not isBE and currentGain >= ${sl} * ${beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)
`;

async function main() {
  console.log('=== TARGETED VARIATIONS AROUND TOP CANDIDATE (TP: 15-20, SL: 10-14) ===');
  const results = [];

  const tpList = [14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0];
  const slList = [10.0, 11.0, 12.0, 13.0, 14.0];
  const blenList = [25, 30];
  const bmultList = [2.2, 2.3, 2.4, 2.5];
  const rsiList = [40, 45];
  const beList = [0.0, 0.35, 0.40, 0.50];

  for (const sl of slList) {
    for (const tp of tpList) {
      if (tp < sl) continue; // Ensure R:R >= 1.0
      for (const blen of blenList) {
        for (const bmult of bmultList) {
          for (const rsiL of rsiList) {
            for (const beTrigger of beList) {
              try {
                const code = makeCode(tp, sl, blen, bmult, rsiL, beTrigger);
                const p = new PineTS(candles, 'XAUUSD', '60');
                await p.ready();
                const res = await p.run(code);
                const s = res.strategy;
                const trades = s.closedtrades || [];

                if (trades.length < 35) continue;

                const wins = trades.filter(t => t.profit > 0);
                const losses = trades.filter(t => t.profit <= 0);
                const wr = (wins.length / trades.length) * 100;
                const net = s.netprofit;
                const dd = s.max_drawdown || 1;
                const calmar = net / dd;

                if (wr >= 72.0 && calmar >= 4.0) {
                  let cum = 0, peak = 0, closedDD = 0;
                  const eqSeries = [0];
                  let maxLossStreak = 0, curLossStreak = 0;
                  for (const t of trades) {
                    cum += t.profit;
                    if (cum > peak) peak = cum;
                    const cDD = peak - cum;
                    if (cDD > closedDD) closedDD = cDD;
                    eqSeries.push(cum);
                    if (t.profit <= 0) {
                      curLossStreak++;
                      if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
                    } else {
                      curLossStreak = 0;
                    }
                  }

                  const r2 = calculateR2(eqSeries);
                  const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / wins.length;
                  const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 0;
                  const realRR = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : '1.00';

                  results.push({
                    tp, sl, blen, bmult, rsiL, beTrigger,
                    trades: trades.length, wins: wins.length, losses: losses.length,
                    wr, net, dd, closedDD, calmar, r2, maxLossStreak,
                    avgWin, avgLoss, realRR
                  });
                }
              } catch (e) {}
            }
          }
        }
      }
    }
  }

  // Sort by Smoothness: R^2 * Calmar * WR
  results.sort((a, b) => (b.r2 * b.calmar * (b.wr / 100)) - (a.r2 * a.calmar * (a.wr / 100)));

  console.log(`\nFound ${results.length} high-performing smooth candidates with Calmar >= 4.0 and WR >= 72%:\n`);
  results.slice(0, 10).forEach((c, i) => {
    console.log(`#${i + 1}: WR: ${c.wr.toFixed(1)}% (${c.wins}W / ${c.losses}L) | Net: +$${c.net.toFixed(2)} | Real R:R: 1:${c.realRR} (+$${c.avgWin.toFixed(2)} / -$${c.avgLoss.toFixed(2)})`);
    console.log(`   Closed DD: $${c.closedDD.toFixed(2)} | Max Excursion DD: $${c.dd.toFixed(2)} | Calmar: ${c.calmar.toFixed(2)} | R²: ${c.r2.toFixed(4)} | Max Loss Streak: ${c.maxLossStreak}`);
    console.log(`   Params: TP=$${c.tp}, SL=$${c.sl}, BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}\n`);
  });

  fs.writeFileSync('backend/src/scripts/top_refined_smooth.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
