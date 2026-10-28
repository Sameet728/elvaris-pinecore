import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Function to calculate R-squared of equity curve to evaluate smooth, clean growth
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

const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger, cool, slAtrMult, useAtrSL) => `//@version=6
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
var float initSLDist = na
var bool isBE = false

if longCond
    ep := close
    ${useAtrSL ? `
    rawSL = low - atr * ${slAtrMult}
    sDist = math.min(math.max(ep - rawSL, 5.0), ${sl})
    currSL := ep - sDist
    tpP := ep + sDist * ${(tp / sl).toFixed(2)}
    initSLDist := sDist
    ` : `
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    initSLDist := ${sl}
    `}
    isBE := false
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=tpP, stop=currSL)

if shortCond
    ep := close
    ${useAtrSL ? `
    rawSL = high + atr * ${slAtrMult}
    sDist = math.min(math.max(rawSL - ep, 5.0), ${sl})
    currSL := ep + sDist
    tpP := ep - sDist * ${(tp / sl).toFixed(2)}
    initSLDist := sDist
    ` : `
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    initSLDist := ${sl}
    `}
    isBE := false
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTrigger > 0 ? `
    if not isBE and currentGain >= initSLDist * ${beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)

if strategy.closedtrades > strategy.closedtrades[1]
    if strategy.closedtrades.profit(strategy.closedtrades - 1) < -0.05
        lastLossBar := bar_index
`;

async function main() {
  console.log('=== SEARCHING FOR CLEAN GROWING EQUITY CURVE WITH SMALL DRAWDOWN & R:R >= 1:1 ===');
  const candidates = [];

  // Systematic grid
  const configs = [];
  for (const sl of [8.0, 10.0, 12.0, 14.0]) {
    for (const rrMult of [1.0, 1.15, 1.25, 1.4, 1.5]) {
      const tp = sl * rrMult;
      for (const blen of [25, 30]) {
        for (const bmult of [2.1, 2.3, 2.5]) {
          for (const rsiL of [40, 45, 50]) {
            for (const beTrigger of [0.0, 0.35, 0.45]) {
              for (const cool of [0, 2]) {
                for (const useAtrSL of [false, true]) {
                  configs.push({ sl, tp, blen, bmult, rsiL, beTrigger, cool, slAtrMult: 1.0, useAtrSL });
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`Total configurations to test: ${configs.length}`);
  let tested = 0;

  for (const cfg of configs) {
    tested++;
    try {
      const code = makeCode(cfg.tp, cfg.sl, cfg.blen, cfg.bmult, cfg.rsiL, cfg.beTrigger, cfg.cool, cfg.slAtrMult, cfg.useAtrSL);
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

      if (wr >= 72.0 && calmar >= 4.0 && dd <= 75.0 && net >= 180) {
        const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / wins.length;
        const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 0;
        const realRR = avgLoss > 0 ? avgWin / avgLoss : 1.0;

        // Check if R:R is at least ~1:1
        if (realRR >= 0.98) {
          // Calculate equity curve smoothness (R^2 and max consecutive losses)
          let cum = 0;
          const eqSeries = [0];
          let maxConsecLoss = 0;
          let currLossStreak = 0;
          for (const t of trades) {
            cum += t.profit;
            eqSeries.push(cum);
            if (t.profit <= 0) {
              currLossStreak++;
              if (currLossStreak > maxConsecLoss) maxConsecLoss = currLossStreak;
            } else {
              currLossStreak = 0;
            }
          }

          const r2 = calculateR2(eqSeries);

          // Monthly consistency
          const monthly = {};
          trades.forEach(t => {
            const d = new Date(t.entry_time);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            monthly[mKey] = (monthly[mKey] || 0) + t.profit;
          });
          const monthValues = Object.values(monthly);
          const positiveMonths = monthValues.filter(v => v > 0).length;
          const monthConsistency = (positiveMonths / monthValues.length) * 100;

          if (r2 >= 0.90 && maxConsecLoss <= 2) {
            console.log(`✨ [SMOOTH] TP: $${cfg.tp.toFixed(1)} | SL: $${cfg.sl.toFixed(1)} | ATR:${cfg.useAtrSL} | BM: ${cfg.bmult} | RSI: ${cfg.rsiL} | Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Net: $${net.toFixed(1)} | DD: $${dd.toFixed(1)} | Calmar: ${calmar.toFixed(2)} | Real R:R: 1:${realRR.toFixed(2)} | R²: ${r2.toFixed(3)} | MaxLossStreak: ${maxConsecLoss} | PosMonths: ${positiveMonths}/${monthValues.length} (${monthConsistency.toFixed(0)}%)`);
            candidates.push({ ...cfg, wr, net, dd, calmar, trades: trades.length, avgWin, avgLoss, realRR, r2, maxConsecLoss, monthConsistency });
          }
        }
      }
    } catch (e) {
      // Ignore individual test syntax or timeout
    }

    if (tested % 100 === 0) {
      console.log(`Progress: ${tested}/${configs.length} tested, ${candidates.length} smooth candidates found...`);
    }
  }

  // Sort candidates by Smooth Growth Score (R^2 * Calmar * WR)
  candidates.sort((a, b) => (b.r2 * b.calmar * (b.wr / 100)) - (a.r2 * a.calmar * (a.wr / 100)));

  console.log('\n======================================================');
  console.log(`=== TOP 5 SMOOTHEST CLEAN-GROWTH STRATEGIES FOUND ===`);
  console.log('======================================================');
  candidates.slice(0, 5).forEach((c, idx) => {
    console.log(`\n🏆 RANK #${idx + 1}:`);
    console.log(`• Win Rate: ${c.wr.toFixed(2)}% (${Math.round(c.wr * c.trades / 100)}W / ${c.trades - Math.round(c.wr * c.trades / 100)}L over ${c.trades} trades)`);
    console.log(`• Realized R:R: 1 : ${c.realRR.toFixed(2)} (Avg Win: +$${c.avgWin.toFixed(2)} vs Avg Loss: -$${c.avgLoss.toFixed(2)})`);
    console.log(`• Net Profit: +$${c.net.toFixed(2)} | Max Drawdown: $${c.dd.toFixed(2)}`);
    console.log(`• Calmar Ratio: ${c.calmar.toFixed(2)} (Target >= 4.0 MET!)`);
    console.log(`• Equity Curve Linearity (R²): ${c.r2.toFixed(4)} (Near-perfect 45° upward drift!)`);
    console.log(`• Max Consecutive Losses: ${c.maxConsecLoss} (Never more than ${c.maxConsecLoss} losses in a row!)`);
    console.log(`• Monthly Consistency: ${c.monthConsistency.toFixed(1)}% profitable months`);
    console.log(`• Parameters:`, JSON.stringify(c));
  });

  fs.writeFileSync('backend/src/scripts/smooth_candidates.json', JSON.stringify(candidates, null, 2));
}

main().catch(console.error);
