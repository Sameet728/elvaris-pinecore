import fs from 'fs';

const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));
const gold4H = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));

console.log('========================================================================');
console.log('  ENGINEERING LEADERBOARD CANDIDATES: WIN RATE >= 70% & CAGR >= 30%     ');
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

const eliteMatches = [];

// -----------------------------------------------------------------------------
// MODEL A: BITCOIN 4H DUAL-SESSION ALPHA DRIFT (4:00 UTC & 8:00 UTC)
// -----------------------------------------------------------------------------
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

  // Test session combos: [4], [8], [4, 8], [8, 20], [4, 20]
  for (const sessionHours of [[4], [8], [4, 8], [4, 20], [8, 20]]) {
    for (const rsiThreshold of [25, 30, 35, 40, 45, 50, 55]) {
      for (const tpMult of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
        for (const slMult of [2.0, 2.5, 3.0, 3.5, 4.0]) {
          for (const maxHoldBars of [4, 6, 8]) {
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
                if (day === 4) continue; // strictly avoid Thursday liquidation
                if (closes[i] <= ema200[i]) continue;
                if (rsi14[i] < rsiThreshold) continue;

                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                slPrice = entryPrice - slMult * atr14[i];
                tpPrice = entryPrice + tpMult * atr14[i];
              }
            }

            if (trades.length >= 40) {
              let eq = 100, peak = 100, maxDD = 0, wins = 0;
              let grossWin = 0, grossLoss = 0;
              const rets = [];

              for (const t of trades) {
                rets.push(t.retPct);
                if (t.retPct > 0) {
                  wins++;
                  grossWin += t.retPct;
                } else {
                  grossLoss += Math.abs(t.retPct);
                }
                eq = eq * (1 + t.retPct / 100);
                if (eq > peak) peak = eq;
                const dd = ((peak - eq) / peak) * 100;
                if (dd > maxDD) maxDD = dd;
              }

              const wr = (wins / trades.length) * 100;
              const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;
              const pf = grossLoss > 0 ? grossWin / grossLoss : 99;
              const calmar = maxDD > 0 ? cagr / maxDD : cagr;
              const mean = rets.reduce((a, b) => a + b, 0) / trades.length;
              const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / trades.length;
              const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(365 * 6) : 0;

              if (wr >= 70.0 && cagr >= 30.0) {
                eliteMatches.push({
                  id: `BTC_4H_Sess_${sessionHours.join('_')}_RSI${rsiThreshold}_TP${tpMult}_SL${slMult}`,
                  name: `Bitcoin 4H Session Apex (${sessionHours.map(s => s + ':00 UTC').join(' & ')})`,
                  asset: 'BTCUSDT',
                  timeframe: '4H',
                  sampleYears: years.toFixed(1) + ' Years',
                  setup: `Hours: ${sessionHours.map(s => s + ':00 UTC').join(' & ')} | Bull Trend (Price > EMA 200) | RSI > ${rsiThreshold} | Avoid Thu`,
                  riskRules: `Take Profit: ${tpMult} ATR | Stop Loss: ${slMult} ATR | Max Hold: ${maxHoldBars * 4}h`,
                  wr,
                  cagr,
                  maxDD,
                  calmar,
                  pf,
                  sharpe,
                  trades: trades.length,
                  totalGain: eq - 100
                });
              }
            }
          }
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// MODEL B: BITCOIN DAILY CALENDAR MOMENTUM WITH ASYMMETRIC TAKE PROFIT (9.1 Years)
// -----------------------------------------------------------------------------
{
  const bars = btcDaily;
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

  // Test days: Mon-Wed-Fri, Weekend, Weekend + Wed, etc.
  const dayConfigs = [
    { name: 'Mon-Wed-Fri Drift', days: [1, 3, 5], holdDays: 1 },
    { name: 'Weekend Drift (Fri Close -> Mon Close)', days: [5], holdDays: 3 },
    { name: 'Weekend + Wednesday Drift', days: [3, 5], holdDays: 2 },
    { name: 'All Bull Days (Mon, Tue, Wed, Fri)', days: [1, 2, 3, 5], holdDays: 1 }
  ];

  for (const dCfg of dayConfigs) {
    for (const rsiMin of [35, 40, 45, 50]) {
      for (const tpMult of [0.75, 1.0, 1.25, 1.5, 2.0, 999]) {
        for (const slMult of [1.5, 2.0, 2.5, 3.0, 4.0, 999]) {
          const trades = [];
          let inTrade = false;
          let entryPrice = 0, slPrice = 0, tpPrice = 0, entryIdx = 0, targetExitIdx = 0;

          for (let i = 200; i < n; i++) {
            const dt = new Date(times[i]);
            const day = dt.getUTCDay();

            if (inTrade) {
              let exited = false;
              let exitPrice = 0;

              if (tpMult !== 999 && highs[i] >= tpPrice) {
                exitPrice = tpPrice;
                exited = true;
              } else if (slMult !== 999 && lows[i] <= slPrice) {
                exitPrice = slPrice;
                exited = true;
              } else if (i >= targetExitIdx) {
                exitPrice = closes[i];
                exited = true;
              }

              if (exited) {
                trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            if (!inTrade && dCfg.days.includes(day)) {
              if (day === 4) continue; // never Thursday
              if (closes[i] <= ema200[i]) continue;
              if (rsi14[i] < rsiMin) continue;

              inTrade = true;
              entryPrice = closes[i];
              entryIdx = i;
              targetExitIdx = i + dCfg.holdDays;
              if (slMult !== 999) slPrice = entryPrice - slMult * atr14[i];
              if (tpMult !== 999) tpPrice = entryPrice + tpMult * atr14[i];
            }
          }

          if (trades.length >= 40) {
            let eq = 100, peak = 100, maxDD = 0, wins = 0;
            let grossWin = 0, grossLoss = 0;
            const rets = [];

            for (const t of trades) {
              rets.push(t.retPct);
              if (t.retPct > 0) {
                wins++;
                grossWin += t.retPct;
              } else {
                grossLoss += Math.abs(t.retPct);
              }
              eq = eq * (1 + t.retPct / 100);
              if (eq > peak) peak = eq;
              const dd = ((peak - eq) / peak) * 100;
              if (dd > maxDD) maxDD = dd;
            }

            const wr = (wins / trades.length) * 100;
            const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;
            const pf = grossLoss > 0 ? grossWin / grossLoss : 99;
            const calmar = maxDD > 0 ? cagr / maxDD : cagr;
            const mean = rets.reduce((a, b) => a + b, 0) / trades.length;
            const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / trades.length;
            const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(52) : 0;

            if (wr >= 70.0 && cagr >= 30.0) {
              eliteMatches.push({
                id: `BTC_1D_${dCfg.name.replace(/\s+/g, '_')}_RSI${rsiMin}_TP${tpMult}_SL${slMult}`,
                name: `Bitcoin Daily ${dCfg.name}`,
                asset: 'BTCUSDT',
                timeframe: '1D',
                sampleYears: years.toFixed(1) + ' Years',
                setup: `${dCfg.name} | Price > 200 EMA | RSI > ${rsiMin} | Exclude Thursday`,
                riskRules: `Take Profit: ${tpMult === 999 ? 'Time' : tpMult + ' ATR'} | Stop Loss: ${slMult === 999 ? 'None' : slMult + ' ATR'}`,
                wr,
                cagr,
                maxDD,
                calmar,
                pf,
                sharpe,
                trades: trades.length,
                totalGain: eq - 100
              });
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${eliteMatches.length} matching setups strictly meeting Win Rate >= 70% and CAGR >= 30%!\n`);

// Deduplicate into the best variants per archetype
const archetypeBest = new Map();
for (const s of eliteMatches) {
  const key = `${s.id}`;
  if (!archetypeBest.has(key) || archetypeBest.get(key).calmar < s.calmar) {
    archetypeBest.set(key, s);
  }
}

const finalLeaderboard = Array.from(archetypeBest.values());
finalLeaderboard.sort((a, b) => b.calmar - a.calmar);

console.log('========================================================================');
console.log('                 FINAL ELITE LEADERBOARD (CAGR >= 30% & WR >= 70%)      ');
console.log('========================================================================\n');

finalLeaderboard.forEach((s, idx) => {
  console.log(`#${idx + 1}: ${s.name}`);
  console.log(`    Asset / TF: ${s.asset} (${s.timeframe}) | Sample: ${s.sampleYears}`);
  console.log(`    CAGR: +${s.cagr.toFixed(2)}% | Win Rate: ${s.wr.toFixed(2)}% | Max Drawdown: ${s.maxDD.toFixed(2)}%`);
  console.log(`    Calmar Ratio: ${s.calmar.toFixed(2)} | Profit Factor: ${s.pf.toFixed(2)} | Sharpe: ${s.sharpe.toFixed(2)} | Trades: ${s.trades}`);
  console.log(`    Total Return: +${s.totalGain.toFixed(1)}%`);
  console.log(`    Strategy Setup: ${s.setup}`);
  console.log(`    Risk / Exit Rules: ${s.riskRules}\n`);
});

fs.writeFileSync('quant_seasonality/data/strict_70wr_30cagr_leaderboard.json', JSON.stringify({
  count: finalLeaderboard.length,
  leaderboard: finalLeaderboard
}, null, 2));

console.log('Saved to quant_seasonality/data/strict_70wr_30cagr_leaderboard.json');
