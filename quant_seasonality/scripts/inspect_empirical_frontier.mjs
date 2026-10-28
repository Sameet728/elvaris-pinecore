import fs from 'fs';

// Let's inspect what the maximum win rate achievable is for each RR level!
const eth4H = JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_4h.json', 'utf8'));
const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));
const ethDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8'));
const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));

console.log('--- Inspecting the Empirical Frontier: Win Rate vs RR vs CAGR vs Drawdown ---');

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

function analyzeDataset(bars, label, is4H) {
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

  const records = [];

  for (const tpMult of [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5]) {
    for (const slMult of [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 3.5]) {
      for (const rsiMin of [40, 45, 50, 55]) {
        for (const maxHold of (is4H ? [6, 8, 12] : [2, 3, 4])) {
          const trades = [];
          let inTrade = false;
          let entryPrice = 0, slPrice = 0, tpPrice = 0, entryIdx = 0;

          for (let i = 200; i < n; i++) {
            const dt = new Date(times[i]);
            const h = dt.getUTCHours();
            const dow = dt.getUTCDay();

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
                trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            if (!inTrade) {
              if (dow === 4) continue; // no thursday
              if (closes[i] <= ema200[i]) continue;
              if (rsi14[i] < rsiMin) continue;

              let trig = false;
              if (is4H && (h === 4 || h === 8)) trig = true;
              else if (!is4H && (dow === 1 || dow === 3 || dow === 5)) trig = true;

              if (trig) {
                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                slPrice = entryPrice - slMult * atr14[i];
                tpPrice = entryPrice + tpMult * atr14[i];
              }
            }
          }

          if (trades.length >= 40) {
            let eq = 100, peak = 100, maxDD = 0, wins = 0;
            let grossWin = 0, grossLoss = 0;
            const winPcts = [], lossPcts = [];

            for (const t of trades) {
              const r = t.retPct;
              if (r > 0) {
                wins++;
                winPcts.push(r);
                grossWin += r;
              } else {
                lossPcts.push(Math.abs(r));
                grossLoss += Math.abs(r);
              }
              eq = eq * (1 + r / 100);
              if (eq > peak) peak = eq;
              const dd = ((peak - eq) / peak) * 100;
              if (dd > maxDD) maxDD = dd;
            }

            const wr = (wins / trades.length) * 100;
            const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;
            const calmar = maxDD > 0 ? cagr / maxDD : 0;
            const avgWin = winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0;
            const avgLoss = lossPcts.length > 0 ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : 0;
            const realizedRR = avgLoss > 0 ? avgWin / avgLoss : avgWin;
            const plannedRR = tpMult / slMult;

            records.push({
              label,
              tpMult,
              slMult,
              plannedRR,
              realizedRR,
              wr,
              cagr,
              maxDD,
              calmar,
              trades: trades.length,
              avgPerMo: (trades.length / (years * 12)).toFixed(1)
            });
          }
        }
      }
    }
  }

  return records;
}

const allRecs = [
  ...analyzeDataset(eth4H, 'ETH 4H', true),
  ...analyzeDataset(btc4H, 'BTC 4H', true),
  ...analyzeDataset(ethDaily, 'ETH Daily', false),
  ...analyzeDataset(btcDaily, 'BTC Daily', false)
];

// Let's filter into categories to show the user the empirical reality and the exact optimal trade-offs:
console.log(`Total setups tested: ${allRecs.length}\n`);

// 1. Where Realized RR >= 1.0 (Reward >= Risk):
const positiveRR = allRecs.filter(r => r.realizedRR >= 1.0 && r.cagr >= 30.0);
positiveRR.sort((a, b) => b.wr - a.wr);

console.log('--- HIGHEST WIN RATE ACHIEVABLE WHEN REWARD >= RISK (RR >= 1.0:1) & CAGR >= 30% ---');
positiveRR.slice(0, 5).forEach((r, idx) => {
  console.log(`#${idx+1}: [${r.label}] Planned RR: ${r.plannedRR.toFixed(2)}:1 (TP ${r.tpMult} / SL ${r.slMult}) | Realized RR: ${r.realizedRR.toFixed(2)}:1`);
  console.log(`    Win Rate: ${r.wr.toFixed(1)}% | Calmar: ${r.calmar.toFixed(2)} | CAGR: +${r.cagr.toFixed(1)}%/yr | Max DD: ${r.maxDD.toFixed(1)}% | Trades: ${r.trades} (${r.avgPerMo}/mo)\n`);
});

// 2. Where Win Rate is 75-80%:
const highWR = allRecs.filter(r => r.wr >= 75.0 && r.cagr >= 30.0);
highWR.sort((a, b) => b.calmar - a.calmar);

console.log('--- HIGHEST CALMAR ACHIEVABLE WHEN WIN RATE IS 75-80% & CAGR >= 30% ---');
highWR.slice(0, 5).forEach((r, idx) => {
  console.log(`#${idx+1}: [${r.label}] Win Rate: ${r.wr.toFixed(1)}% | Calmar: ${r.calmar.toFixed(2)} | CAGR: +${r.cagr.toFixed(1)}%/yr | Max DD: ${r.maxDD.toFixed(1)}%`);
  console.log(`    Planned RR: ${r.plannedRR.toFixed(2)}:1 (TP ${r.tpMult} / SL ${r.slMult}) | Realized RR: ${r.realizedRR.toFixed(2)}:1 | Trades: ${r.trades} (${r.avgPerMo}/mo)\n`);
});
