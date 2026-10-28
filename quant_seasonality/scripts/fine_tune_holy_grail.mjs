import fs from 'fs';

const eth4H = JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_4h.json', 'utf8'));
const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));

console.log('--- Fine-Tuning 4H Institutional Cluster for Calmar >= 4.0 & WR 75-80% & CAGR >= 30% ---');

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

function runOptimizer(bars, symbol, label) {
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);
  const rsi14 = computeRSI(closes, 14);

  const matches = [];

  for (const sessionHours of [[4], [8], [4, 8]]) {
    for (const rsiThreshold of [46, 48, 50, 52, 54, 56]) {
      for (const tpMult of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]) {
        for (const slMult of [2.5, 2.8, 3.0, 3.2, 3.5, 3.8, 4.0]) {
          for (const maxHoldBars of [4, 5, 6, 7, 8]) {
            for (const trendFilter of ['ema200', 'both_ema']) {
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
                  } else if (barsHeld >= maxHoldBars) {
                    exitPrice = closes[i];
                    exited = true;
                  }

                  if (exited) {
                    trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                    inTrade = false;
                  }
                }

                if (!inTrade && sessionHours.includes(h)) {
                  if (day === 4) continue; // avoid Thursday dump
                  let trendPass = false;
                  if (trendFilter === 'ema200') trendPass = closes[i] > ema200[i];
                  else if (trendFilter === 'both_ema') trendPass = closes[i] > ema200[i] && ema50[i] > ema200[i];
                  if (!trendPass) continue;
                  if (rsi14[i] < rsiThreshold) continue;

                  inTrade = true;
                  entryPrice = closes[i];
                  entryIdx = i;
                  slPrice = entryPrice - slMult * atr14[i];
                  tpPrice = entryPrice + tpMult * atr14[i];
                }
              }

              if (trades.length >= 50) {
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
                const pf = grossLoss > 0 ? grossWin / grossLoss : 99;
                const calmar = maxDD > 0 ? cagr / maxDD : cagr;
                const avgWin = winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0;
                const avgLoss = lossPcts.length > 0 ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : 0;
                const realizedRR = avgLoss > 0 ? avgWin / avgLoss : avgWin;

                // FILTER: Win Rate >= 75% AND Calmar >= 4.0 AND CAGR >= 30%
                if (wr >= 75.0 && calmar >= 4.0 && cagr >= 30.0) {
                  matches.push({
                    name: `${label} 4H (${sessionHours.map(s => s + ':00 UTC').join(' & ')})`,
                    asset: symbol,
                    timeframe: '4H',
                    sampleYears: years.toFixed(1) + ' Years',
                    wr,
                    cagr,
                    maxDD,
                    calmar,
                    pf,
                    realizedRR,
                    plannedRR: `${(tpMult / slMult).toFixed(2)} : 1`,
                    totalTrades: trades.length,
                    avgPerMonth: (trades.length / (years * 12)).toFixed(1),
                    totalGain: eq - 100,
                    setup: `Hours: ${sessionHours.map(s => s + ':00 UTC').join(' & ')} | ${trendFilter.toUpperCase()} | RSI > ${rsiThreshold} | Excl Thu`,
                    riskRules: `TP: ${tpMult} ATR | SL: ${slMult} ATR | Max Hold: ${maxHoldBars * 4}h`
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return matches;
}

console.log('Optimizing ETH 4H...');
const ethMatches = runOptimizer(eth4H, 'ETHUSDT', 'Ethereum');
console.log(`Found ${ethMatches.length} matching setups for ETHUSDT!`);

console.log('Optimizing BTC 4H...');
const btcMatches = runOptimizer(btc4H, 'BTCUSDT', 'Bitcoin');
console.log(`Found ${btcMatches.length} matching setups for BTCUSDT!`);

const allMatches = [...ethMatches, ...btcMatches];
allMatches.sort((a, b) => b.calmar - a.calmar);

console.log('\n--- TOP 10 QUALIFIED CHAMPIONS (WR >= 75% | CALMAR >= 4.0 | CAGR >= 30%) ---');
allMatches.slice(0, 10).forEach((s, idx) => {
  console.log(`\n#${idx + 1}: ${s.name} [${s.asset} | ${s.timeframe}]`);
  console.log(`    WR: ${s.wr.toFixed(2)}% | Calmar: ${s.calmar.toFixed(2)} | CAGR: +${s.cagr.toFixed(2)}%/yr | Max DD: ${s.maxDD.toFixed(2)}%`);
  console.log(`    Realized RR: ${s.realizedRR.toFixed(2)} : 1 (Planned: ${s.plannedRR}) | Profit Factor: ${s.pf.toFixed(2)}`);
  console.log(`    Total Trades: ${s.totalTrades} | Avg/Month: ${s.avgPerMonth}/mo | Total Gain: +${s.totalGain.toFixed(1)}%`);
  console.log(`    Setup: ${s.setup}`);
  console.log(`    Risk Rules: ${s.riskRules}`);
});

fs.writeFileSync('quant_seasonality/data/exact_75wr_4calmar_30cagr_champions.json', JSON.stringify(allMatches, null, 2));
