import fs from 'fs';

const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));
const gold4H = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8'));

console.log('--- Analyzing Frontier: Win Rate vs CAGR ---');

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

// Check what configurations in BTC 4H, BTC Daily, Gold 4H reach high winrates and high CAGRs
const results = [];

// Test 1: BTC 4H with varying Take-Profit and Stop-Loss
{
  const bars = btc4H;
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);
  const rsi14 = computeRSI(closes, 14);

  for (const entryH of [0, 4, 8, 12, 16, 20]) {
    for (const rsiMin of [30, 40, 50, 55]) {
      for (const tpMult of [0.5, 0.75, 1.0, 1.5]) {
        for (const slMult of [1.5, 2.0, 2.5, 3.0, 4.0]) {
          const trades = [];
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
              } else if (barsHeld >= 6) {
                exitPrice = closes[i];
                exited = true;
              }

              if (exited) {
                trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            if (!inTrade && h === entryH) {
              if (day === 4) continue; // avoid Thursday
              if (closes[i] <= ema200[i]) continue;
              if (rsi14[i] < rsiMin) continue;

              inTrade = true;
              entryPrice = closes[i];
              entryIdx = i;
              slPrice = entryPrice - slMult * atr14[i];
              tpPrice = entryPrice + tpMult * atr14[i];
            }
          }

          if (trades.length >= 30) {
            let eq = 100, peak = 100, maxDD = 0, wins = 0;
            for (const t of trades) {
              if (t.retPct > 0) wins++;
              eq = eq * (1 + t.retPct / 100);
              if (eq > peak) peak = eq;
              const dd = ((peak - eq) / peak) * 100;
              if (dd > maxDD) maxDD = dd;
            }
            const wr = (wins / trades.length) * 100;
            const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;
            results.push({
              source: `BTC 4H ${entryH}:00 UTC (RSI>${rsiMin}, TP:${tpMult} ATR, SL:${slMult} ATR)`,
              wr,
              cagr,
              maxDD,
              calmar: maxDD > 0 ? cagr / maxDD : 0,
              trades: trades.length,
              totalRet: eq - 100
            });
          }
        }
      }
    }
  }
}

// Print top 10 by Win Rate
results.sort((a, b) => b.wr - a.wr);
console.log('Top 10 Configurations by Win Rate:');
results.slice(0, 10).forEach(r => {
  console.log(`WR: ${r.wr.toFixed(1)}% | CAGR: ${r.cagr.toFixed(1)}% | MaxDD: ${r.maxDD.toFixed(1)}% | Calmar: ${r.calmar.toFixed(1)} | Trades: ${r.trades} | ${r.source}`);
});

// Print top 10 by CAGR
results.sort((a, b) => b.cagr - a.cagr);
console.log('\nTop 10 Configurations by CAGR:');
results.slice(0, 10).forEach(r => {
  console.log(`CAGR: ${r.cagr.toFixed(1)}% | WR: ${r.wr.toFixed(1)}% | MaxDD: ${r.maxDD.toFixed(1)}% | Calmar: ${r.calmar.toFixed(1)} | Trades: ${r.trades} | ${r.source}`);
});
