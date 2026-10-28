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

const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger, cool) => `//@version=6
strategy("SmoothGrowth", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

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

if strategy.closedtrades > strategy.closedtrades[1]
    if strategy.closedtrades.profit(strategy.closedtrades - 1) < -0.05
        lastLossBar := bar_index
`;

async function main() {
  console.log('=== FOCUSED SEARCH FOR HIGHEST WIN RATE, SMOOTHEST CURVE & CALMAR >= 4.0 ===');
  const candidates = [];

  const configs = [];
  for (const sl of [8.0, 10.0, 12.0]) {
    for (const tp of [sl * 1.0, sl * 1.1, sl * 1.25, sl * 1.4, sl * 1.5]) {
      for (const blen of [25, 30]) {
        for (const bmult of [2.2, 2.4, 2.6]) {
          for (const rsiL of [40, 45, 50]) {
            for (const beTrigger of [0.0, 0.35, 0.40, 0.50]) {
              for (const cool of [0, 2]) {
                configs.push({ sl, tp, blen, bmult, rsiL, beTrigger, cool });
              }
            }
          }
        }
      }
    }
  }

  console.log(`Total focused configurations: ${configs.length}`);
  let count = 0;

  for (const cfg of configs) {
    count++;
    try {
      const code = makeCode(cfg.tp, cfg.sl, cfg.blen, cfg.bmult, cfg.rsiL, cfg.beTrigger, cfg.cool);
      const p = new PineTS(candles, 'XAUUSD', '60');
      await p.ready();
      const res = await p.run(code);
      const s = res.strategy;
      const trades = s.closedtrades || [];

      if (trades.length < 30) continue;

      const wins = trades.filter(t => t.profit > 0);
      const losses = trades.filter(t => t.profit <= 0);
      const wr = (wins.length / trades.length) * 100;
      const net = s.netprofit;
      const dd = s.max_drawdown || 1;
      const calmar = net / dd;

      if (wr >= 74.0 && calmar >= 4.0 && net >= 200) {
        const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / wins.length;
        const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 0;
        const realRR = avgLoss > 0 ? avgWin / avgLoss : 1.0;

        if (realRR >= 0.98) {
          let cum = 0, peak = 0, closedDD = 0;
          const eqSeries = [0];
          let maxConsecLoss = 0, currLoss = 0;
          for (const t of trades) {
            cum += t.profit;
            if (cum > peak) peak = cum;
            const curDD = peak - cum;
            if (curDD > closedDD) closedDD = curDD;
            eqSeries.push(cum);
            if (t.profit <= 0) {
              currLoss++;
              if (currLoss > maxConsecLoss) maxConsecLoss = currLoss;
            } else {
              currLoss = 0;
            }
          }

          const r2 = calculateR2(eqSeries);

          candidates.push({
            ...cfg,
            wr,
            net,
            dd,
            closedDD,
            calmar,
            trades: trades.length,
            wins: wins.length,
            losses: losses.length,
            avgWin,
            avgLoss,
            realRR,
            r2,
            maxConsecLoss
          });
        }
      }
    } catch (e) {}

    if (count % 100 === 0) {
      console.log(`Tested ${count}/${configs.length} | Found ${candidates.length} candidates...`);
    }
  }

  // Sort by Smoothness: R^2 * Calmar * (WR/100)
  candidates.sort((a, b) => (b.r2 * b.calmar * (b.wr / 100)) - (a.r2 * a.calmar * (a.wr / 100)));

  console.log(`\n=== FOUND ${candidates.length} CANDIDATES MATCHING ALL REQUIREMENTS ===\n`);
  candidates.slice(0, 10).forEach((c, idx) => {
    console.log(`#${idx + 1}: WR=${c.wr.toFixed(1)}% (${c.wins}W/${c.losses}L) | Net=+$${c.net.toFixed(2)} | Real R:R=1:${c.realRR.toFixed(2)} (+$${c.avgWin.toFixed(2)} / -$${c.avgLoss.toFixed(2)}) | ClosedDD=$${c.closedDD.toFixed(2)} | IntrabarDD=$${c.dd.toFixed(2)} | Calmar=${c.calmar.toFixed(2)} | R²=${c.r2.toFixed(4)} | MaxLossStreak=${c.maxConsecLoss}`);
    console.log(`   Params: TP=$${c.tp.toFixed(1)}, SL=$${c.sl.toFixed(1)}, BB(${c.blen}, ${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}, Cool=${c.cool}\n`);
  });

  fs.writeFileSync('backend/src/scripts/top_smooth_candidates.json', JSON.stringify(candidates, null, 2));
}

main().catch(console.error);
