import fs from 'fs';

// Let's inspect the exact win rates of Connors RSI & Extreme Dips when Reward >= Risk (RR >= 1.0)
const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const ethDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));
const qqqDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_daily.json', 'utf8'));

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

function computeRSI(closes, period = 2) {
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

function evaluate(bars, label) {
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);
  const rsi2 = computeRSI(closes, 2);

  const results = [];

  for (const rsiThreshold of [5, 10, 15, 20]) {
    for (const tpMult of [1.0, 1.25, 1.5, 2.0]) {
      for (const slMult of [1.0, 1.25, 1.5]) {
        for (const maxHold of [3, 5, 7]) {
          const trades = [];
          let inTrade = false, entryPrice = 0, slPrice = 0, tpPrice = 0, entryIdx = 0;

          for (let i = 200; i < n; i++) {
            if (inTrade) {
              const barsHeld = i - entryIdx;
              let exited = false, exitPrice = 0;
              if (highs[i] >= tpPrice && lows[i] <= slPrice) {
                exitPrice = opens[i] >= tpPrice ? tpPrice : slPrice;
                exited = true;
              } else if (highs[i] >= tpPrice) {
                exitPrice = tpPrice;
                exited = true;
              } else if (lows[i] <= slPrice) {
                exitPrice = slPrice;
                exited = true;
              } else if (barsHeld >= maxHold) {
                exitPrice = closes[i];
                exited = true;
              }
              if (exited) {
                trades.push({ ret: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            if (!inTrade && closes[i] > ema200[i] && rsi2[i] <= rsiThreshold) {
              inTrade = true;
              entryPrice = closes[i];
              entryIdx = i;
              slPrice = entryPrice - slMult * atr14[i];
              tpPrice = entryPrice + tpMult * atr14[i];
            }
          }

          if (trades.length >= 25) {
            let wins = 0, winSum = 0, lossSum = 0, eq = 100, peak = 100, maxDD = 0;
            for (const t of trades) {
              if (t.ret > 0) {
                wins++;
                winSum += t.ret;
              } else {
                lossSum += Math.abs(t.ret);
              }
              eq *= (1 + t.ret / 100);
              if (eq > peak) peak = eq;
              const dd = ((peak - eq) / peak) * 100;
              if (dd > maxDD) maxDD = dd;
            }
            const wr = (wins / trades.length) * 100;
            const avgWin = wins > 0 ? winSum / wins : 0;
            const avgLoss = (trades.length - wins) > 0 ? lossSum / (trades.length - wins) : 0;
            const realizedRR = avgLoss > 0 ? avgWin / avgLoss : avgWin;
            const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;

            if (realizedRR >= 0.98) {
              results.push({
                label,
                rsiThreshold,
                tpMult,
                slMult,
                plannedRR: (tpMult / slMult).toFixed(2),
                realizedRR: realizedRR.toFixed(2),
                wr,
                cagr,
                maxDD,
                trades: trades.length
              });
            }
          }
        }
      }
    }
  }

  return results;
}

const btc = evaluate(btcDaily, 'BTC Daily');
const eth = evaluate(ethDaily, 'ETH Daily');
const qqq = evaluate(qqqDaily, 'QQQ Daily');

const all = [...btc, ...eth, ...qqq];
all.sort((a, b) => b.wr - a.wr);

console.log('--- TOP 10 HIGHEST WIN RATES ACHIEVABLE WITH REWARD >= RISK (RR >= 1.0) ---');
all.slice(0, 10).forEach((r, idx) => {
  console.log(`#${idx + 1}: [${r.label}] Win Rate: ${r.wr.toFixed(2)}% | Realized RR: ${r.realizedRR} : 1 (Planned: ${r.plannedRR}:1)`);
  console.log(`    Setup: RSI(2) <= ${r.rsiThreshold} | TP: ${r.tpMult} ATR | SL: ${r.slMult} ATR`);
  console.log(`    CAGR: +${r.cagr.toFixed(2)}%/yr | MaxDD: ${r.maxDD.toFixed(2)}% | Trades: ${r.trades}\n`);
});
