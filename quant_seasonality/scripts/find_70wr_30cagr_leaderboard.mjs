import fs from 'fs';

// Load datasets
const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));
const gold4H = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8'));

console.log('========================================================================');
console.log('   SEARCHING FOR ELITE QUANT STRATEGIES: WIN RATE >= 70% & CAGR >= 30%   ');
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

function computeSMA(arr, period) {
  const n = arr.length;
  const res = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i];
  res[period - 1] = s / period;
  for (let i = period; i < n; i++) {
    s += arr[i] - arr[i - period];
    res[i] = s / period;
  }
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

function calcMetrics(trades, years, initialEquity = 10000) {
  if (trades.length < 25) return null;
  let eq = initialEquity, peak = initialEquity, maxDD = 0;
  let wins = 0, losses = 0, grossWin = 0, grossLoss = 0;
  const rets = [];

  for (const t of trades) {
    const r = t.retPct;
    rets.push(r);
    if (r > 0) {
      wins++;
      grossWin += (eq * (r / 100));
    } else if (r < 0) {
      losses++;
      grossLoss += Math.abs(eq * (r / 100));
    }
    eq = eq * (1 + r / 100);
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const totalRet = ((eq - initialEquity) / initialEquity) * 100;
  const wr = (wins / trades.length) * 100;
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  const cagr = (Math.pow(eq / initialEquity, 1 / years) - 1) * 100;
  const calmar = maxDD > 0 ? cagr / maxDD : cagr;

  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rets.length > 1 ? rets.length - 1 : 1);
  const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(trades.length / years) : 0;

  return {
    tradesCount: trades.length,
    wins,
    losses,
    wr,
    totalRet,
    cagr,
    maxDD,
    calmar,
    pf,
    sharpe,
    finalEquity: eq
  };
}

const qualifiedStrategies = [];

// ============================================================================
// 1. BITCOIN 4H INTRADAY SESSION & SEASONAL ENGINE (2.8 Years)
// ============================================================================
{
  const bars = btc4H;
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(highs, lows, closes, 14);

  // Search parameter space
  const sessionHours = [
    { name: 'London Open (08 UTC)', hours: [8] },
    { name: 'US Close / Overnight (20 UTC)', hours: [20] },
    { name: 'London + Overnight (08 & 20 UTC)', hours: [8, 20] },
    { name: 'Asian / Euro Pre-Market (04 & 08 UTC)', hours: [4, 8] }
  ];

  const trendModes = ['ema200', 'ema50', 'both_ema'];
  const rsiConditions = [
    { name: 'RSI > 50', fn: r => r > 50 },
    { name: 'RSI > 55', fn: r => r > 55 },
    { name: 'RSI Dip (35 - 55)', fn: r => r >= 35 && r <= 55 },
    { name: 'RSI Dip (40 - 60)', fn: r => r >= 40 && r <= 60 },
    { name: 'RSI < 45 (Deep Pullback in Trend)', fn: r => r < 45 }
  ];

  const exitBrackets = [
    { slAtr: 1.5, tpAtr: 0.75, maxBars: 4 },
    { slAtr: 1.5, tpAtr: 1.0, maxBars: 4 },
    { slAtr: 2.0, tpAtr: 1.0, maxBars: 5 },
    { slAtr: 2.0, tpAtr: 1.25, maxBars: 5 },
    { slAtr: 2.5, tpAtr: 1.25, maxBars: 6 },
    { slAtr: 2.5, tpAtr: 1.5, maxBars: 6 },
    { slAtr: 3.0, tpAtr: 1.5, maxBars: 6 },
    { slAtr: 3.0, tpAtr: 2.0, maxBars: 8 }
  ];

  for (const sess of sessionHours) {
    for (const tMode of trendModes) {
      for (const rsiCond of rsiConditions) {
        for (const avoidThu of [true, false]) {
          for (const bracket of exitBrackets) {
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
                } else if (barsHeld >= bracket.maxBars) {
                  exitPrice = closes[i];
                  exited = true;
                }

                if (exited) {
                  trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                  inTrade = false;
                }
              }

              if (!inTrade && sess.hours.includes(h)) {
                if (avoidThu && day === 4) continue;

                let trendPass = false;
                if (tMode === 'ema200') trendPass = closes[i] > ema200[i];
                else if (tMode === 'ema50') trendPass = closes[i] > ema50[i];
                else if (tMode === 'both_ema') trendPass = closes[i] > ema200[i] && ema50[i] > ema200[i];

                if (!trendPass) continue;
                if (!rsiCond.fn(rsi14[i])) continue;

                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                slPrice = entryPrice - bracket.slAtr * atr14[i];
                tpPrice = entryPrice + bracket.tpAtr * atr14[i];
              }
            }

            const stats = calcMetrics(trades, years);
            if (stats && stats.wr >= 70.0 && stats.cagr >= 30.0) {
              qualifiedStrategies.push({
                name: `BTC 4H ${sess.name} Momentum Drift`,
                asset: 'BTCUSDT',
                timeframe: '4H',
                sampleYears: years.toFixed(1) + ' Years',
                setupDesc: `${sess.name} + ${tMode.toUpperCase()} + ${rsiCond.name}${avoidThu ? ' (No Thu)' : ''}`,
                slTpDesc: `SL: ${bracket.slAtr} ATR | TP: ${bracket.tpAtr} ATR | Max ${bracket.maxBars * 4}h`,
                ...stats
              });
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// 2. BITCOIN DAILY QUANTITATIVE SEASONALITY (9.1 Years)
// ============================================================================
{
  const bars = btcDaily;
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(highs, lows, closes, 14);

  // Setups:
  // - High-probability calendar days (Mon, Wed, Fri/Weekend) with Mean-Reversion / Dip-buying (prev bar red or RSI dip)
  // - Uptober & Golden Month Dip-Buying
  const dailySetups = [
    { name: 'Weekend Drift Dip-Buyer (Buy Fri Close)', days: [5], holdDays: 3 },
    { name: 'Mon-Wed-Fri Bull Drift', days: [1, 3, 5], holdDays: 1 },
    { name: 'Wednesday Alpha Drift', days: [3], holdDays: 1 },
    { name: 'Monday Inflow Drift', days: [1], holdDays: 1 },
    { name: 'Midweek Power Expansion (Tue-Thu)', days: [2], holdDays: 2 }
  ];

  for (const s of dailySetups) {
    for (const trendFilter of ['ema200', 'ema50', 'golden_cross']) {
      for (const dipFilter of ['prev_red', 'rsi_under_55', 'rsi_under_50', 'none']) {
        for (const tpMult of [0.5, 0.75, 1.0, 1.25, 1.5, 999]) {
          for (const slMult of [1.5, 2.0, 2.5, 3.0, 999]) {
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

              if (!inTrade && s.days.includes(day)) {
                // Trend
                let trendPass = false;
                if (trendFilter === 'ema200') trendPass = closes[i] > ema200[i];
                else if (trendFilter === 'ema50') trendPass = closes[i] > ema50[i];
                else if (trendFilter === 'golden_cross') trendPass = closes[i] > ema200[i] && ema50[i] > ema200[i];
                if (!trendPass) continue;

                // Dip
                let dipPass = true;
                if (dipFilter === 'prev_red' && closes[i] >= opens[i]) dipPass = false;
                else if (dipFilter === 'rsi_under_55' && rsi14[i] > 55) dipPass = false;
                else if (dipFilter === 'rsi_under_50' && rsi14[i] > 50) dipPass = false;
                if (!dipPass) continue;

                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                targetExitIdx = i + s.holdDays;
                if (slMult !== 999) slPrice = entryPrice - slMult * atr14[i];
                if (tpMult !== 999) tpPrice = entryPrice + tpMult * atr14[i];
              }
            }

            const stats = calcMetrics(trades, years);
            if (stats && stats.wr >= 70.0 && stats.cagr >= 30.0) {
              qualifiedStrategies.push({
                name: `BTC Daily ${s.name}`,
                asset: 'BTCUSDT',
                timeframe: '1D',
                sampleYears: years.toFixed(1) + ' Years',
                setupDesc: `${s.name} + ${trendFilter.toUpperCase()} + Dip:${dipFilter}`,
                slTpDesc: `SL: ${slMult === 999 ? 'None' : slMult + ' ATR'} | TP: ${tpMult === 999 ? 'Time Exit' : tpMult + ' ATR'}`,
                ...stats
              });
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// 3. GOLD 4H & DAILY OVERNIGHT / MIDWEEK ENGINES (2.7 & 29.3 Years)
// ============================================================================
{
  const bars = gold4H;
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(highs, lows, closes, 14);

  // Search 4H Gold overnight with high-winrate asymmetric targets
  for (const entryH of [19, 23]) {
    for (const tFilter of ['none', 'ema50', 'ema200']) {
      for (const rsiMin of [40, 45, 50]) {
        for (const slAtr of [1.5, 2.0, 2.5]) {
          for (const tpAtr of [0.6, 0.8, 1.0, 1.2]) {
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
                } else if (h === 7 || barsHeld >= 3) {
                  exitPrice = closes[i];
                  exited = true;
                }

                if (exited) {
                  trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                  inTrade = false;
                }
              }

              if (!inTrade && h === entryH && day >= 1 && day <= 5) {
                let trendPass = true;
                if (tFilter === 'ema50') trendPass = closes[i] > ema50[i];
                else if (tFilter === 'ema200') trendPass = closes[i] > ema200[i];
                if (!trendPass) continue;
                if (rsi14[i] < rsiMin) continue;

                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                slPrice = entryPrice - slAtr * atr14[i];
                tpPrice = entryPrice + tpAtr * atr14[i];
              }
            }

            const stats = calcMetrics(trades, years);
            if (stats && stats.wr >= 70.0 && stats.cagr >= 30.0) {
              qualifiedStrategies.push({
                name: `Gold 4H Overnight Apex (${entryH} UTC)`,
                asset: 'XAUUSD',
                timeframe: '4H',
                sampleYears: years.toFixed(1) + ' Years',
                setupDesc: `Entry ${entryH}:00 UTC + ${tFilter.toUpperCase()} + RSI>${rsiMin}`,
                slTpDesc: `SL: ${slAtr} ATR | TP: ${tpAtr} ATR | Exit 07:00 UTC`,
                ...stats
              });
            }
          }
        }
      }
    }
  }
}

console.log(`Search Complete! Total configurations meeting Win Rate >= 70% AND CAGR >= 30%: ${qualifiedStrategies.length}\n`);

// Deduplicate and group by unique strategic archetype, keeping the best Calmar/Sharpe variant
const archetypeMap = new Map();

for (const s of qualifiedStrategies) {
  const key = `${s.asset}_${s.timeframe}_${s.name.split(' (')[0]}`;
  if (!archetypeMap.has(key) || archetypeMap.get(key).calmar < s.calmar) {
    archetypeMap.set(key, s);
  }
}

const eliteLeaderboard = Array.from(archetypeMap.values());

// Sort Leaderboard strictly by Calmar Ratio (Annualized Return / Max Drawdown)
eliteLeaderboard.sort((a, b) => b.calmar - a.calmar);

console.log('========================================================================');
console.log('              ELITE QUANT LEADERBOARD (CAGR >= 30% & WR >= 70%)         ');
console.log('========================================================================');

eliteLeaderboard.forEach((s, idx) => {
  console.log(`\n#${idx + 1}: ${s.name} [${s.asset} | ${s.timeframe}]`);
  console.log(`    Setup: ${s.setupDesc}`);
  console.log(`    Risk/Exit: ${s.slTpDesc}`);
  console.log(`    CAGR: +${s.cagr.toFixed(2)}% | Win Rate: ${s.wr.toFixed(2)}% | Max DD: ${s.maxDD.toFixed(2)}%`);
  console.log(`    Calmar: ${s.calmar.toFixed(2)} | Profit Factor: ${s.pf.toFixed(2)} | Sharpe: ${s.sharpe.toFixed(2)} | Trades: ${s.tradesCount}`);
  console.log(`    Sample: ${s.sampleYears} | Total Compounded Gain: +${s.totalRet.toFixed(1)}%`);
});

fs.writeFileSync('quant_seasonality/data/elite_70wr_30cagr_leaderboard.json', JSON.stringify({
  count: eliteLeaderboard.length,
  leaderboard: eliteLeaderboard
}, null, 2));

console.log('\nSaved results to quant_seasonality/data/elite_70wr_30cagr_leaderboard.json');
