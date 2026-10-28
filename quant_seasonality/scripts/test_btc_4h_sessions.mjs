import fs from 'fs';

const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));

console.log('========================================================================');
console.log('       OPTIMIZING BITCOIN 4H SESSION ENGINE FOR 65%+ WIN RATE           ');
console.log('========================================================================\n');

function computeEMA(arr, period) {
  const n = arr.length;
  const res = new Float64Array(n);
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i];
  res[period - 1] = s / period;
  for (let i = period; i < n; i++) res[i] = arr[i] * k + res[i - 1] * (1 - k);
  return res;
}

function computeRSI(closes, period = 14) {
  const n = closes.length;
  const rsi = new Float64Array(n);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function computeATR(highs, lows, closes, period = 14) {
  const n = highs.length;
  const tr = new Float64Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  const atr = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < period; i++) s += tr[i];
  atr[period - 1] = s / period;
  for (let i = period; i < n; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  return atr;
}

const n = btc4H.length;
const closes = btc4H.map(b => b.close);
const opens = btc4H.map(b => b.open);
const highs = btc4H.map(b => b.high);
const lows = btc4H.map(b => b.low);
const times = btc4H.map(b => b.time);

const ema50 = computeEMA(closes, 50);
const ema200 = computeEMA(closes, 200);
const rsi14 = computeRSI(closes, 14);
const atr14 = computeATR(highs, lows, closes, 14);

const configs = [];

// Test hours: 8 (London Open), 20 (US Close / Overnight)
for (const entryH of [8, 20]) {
  for (const avoidThu of [true, false]) {
    for (const rsiThreshold of [40, 45, 50, 55]) {
      for (const slAtr of [1.5, 2.0, 2.5, 3.0]) {
        for (const tpRatio of [0.75, 1.0, 1.25, 1.5, 2.0]) {
          const tpAtr = slAtr * tpRatio;

          let eq = 100, peak = 100, maxDD = 0;
          let wins = 0, losses = 0, totalTrades = 0;
          let grossWin = 0, grossLoss = 0;
          const rets = [];

          let inTrade = false;
          let entryPrice = 0, slPrice = 0, tpPrice = 0, entryIdx = 0;

          for (let i = 200; i < n; i++) {
            const dt = new Date(times[i]);
            const h = dt.getUTCHours();
            const day = dt.getUTCDay();

            if (inTrade) {
              const barsHeld = i - entryIdx;
              let exited = false;
              let exitPrice = 0;

              if (highs[i] >= tpPrice && lows[i] <= slPrice) {
                exitPrice = opens[i] >= tpPrice ? tpPrice : slPrice;
                exited = true;
              } else if (highs[i] >= tpPrice) {
                exitPrice = tpPrice;
                exited = true;
              } else if (lows[i] <= slPrice) {
                exitPrice = slPrice;
                exited = true;
              } else if (barsHeld >= 6) { // Max hold 24 hours (6 x 4H bars)
                exitPrice = closes[i];
                exited = true;
              }

              if (exited) {
                const retPct = ((exitPrice - entryPrice) / entryPrice) * 100;
                totalTrades++;
                rets.push(retPct);
                if (retPct > 0) {
                  wins++;
                  grossWin += retPct;
                } else if (retPct < 0) {
                  losses++;
                  grossLoss += Math.abs(retPct);
                }

                eq = eq * (1 + retPct / 100);
                if (eq > peak) peak = eq;
                const dd = ((peak - eq) / peak) * 100;
                if (dd > maxDD) maxDD = dd;

                inTrade = false;
              }
            }

            if (!inTrade && h === entryH) {
              if (avoidThu && day === 4) continue;
              if (closes[i] <= ema200[i]) continue;
              if (rsi14[i] < rsiThreshold) continue;

              inTrade = true;
              entryPrice = closes[i];
              entryIdx = i;
              slPrice = entryPrice - slAtr * atr14[i];
              tpPrice = entryPrice + tpAtr * atr14[i];
            }
          }

          if (totalTrades >= 50) {
            const wr = (wins / totalTrades) * 100;
            const totalRet = eq - 100;
            const calmar = maxDD > 0 ? totalRet / maxDD : 0;
            const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;
            const mean = rets.reduce((a, b) => a + b, 0) / totalTrades;
            const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totalTrades;
            const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(365) : 0;

            configs.push({
              entryH,
              avoidThu,
              rsiThreshold,
              slAtr,
              tpRatio,
              totalTrades,
              wins,
              losses,
              wr,
              totalRet,
              maxDD,
              calmar,
              pf,
              sharpe
            });
          }
        }
      }
    }
  }
}

configs.sort((a, b) => b.wr - a.wr);

console.log('--- TOP 5 BITCOIN 4H BY HIGHEST WIN RATE ---');
configs.slice(0, 5).forEach((c, idx) => {
  console.log(`#${idx + 1}: Hour:${c.entryH} UTC | AvoidThu:${c.avoidThu} | RSI>${c.rsiThreshold} | SL:${c.slAtr} ATR | TP/SL Ratio:${c.tpRatio}`);
  console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
});

configs.sort((a, b) => b.calmar - a.calmar);
console.log('\n--- TOP 5 BITCOIN 4H BY HIGHEST CALMAR RATIO ---');
configs.slice(0, 5).forEach((c, idx) => {
  console.log(`#${idx + 1}: Hour:${c.entryH} UTC | AvoidThu:${c.avoidThu} | RSI>${c.rsiThreshold} | SL:${c.slAtr} ATR | TP/SL Ratio:${c.tpRatio}`);
  console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
});
