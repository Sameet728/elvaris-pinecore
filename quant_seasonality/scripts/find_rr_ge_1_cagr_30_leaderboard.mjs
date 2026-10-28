import fs from 'fs';

// Load datasets
const datasets = {
  btcDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8')),
  btc4H: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8')),
  ethDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8')),
  eth4H: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_4h.json', 'utf8')),
  goldDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8')),
  gold4H: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8')),
  qqqDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_daily.json', 'utf8')),
  qqq4H: JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_4h.json', 'utf8'))
};

console.log('========================================================================');
console.log('   STRICT SEARCH: REWARD >= RISK (RR >= 1.0:1) & CAGR >= 30% & HIGH WR  ');
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

function evaluateTradeList(trades, years, initialEquity = 10000) {
  if (trades.length < 30) return null;
  let eq = initialEquity, peak = initialEquity, maxDD = 0;
  let wins = 0, losses = 0;
  let grossWin = 0, grossLoss = 0;
  const winPcts = [];
  const lossPcts = [];

  for (const t of trades) {
    const r = t.retPct;
    if (r > 0) {
      wins++;
      winPcts.push(r);
      grossWin += (eq * (r / 100));
    } else if (r < 0) {
      losses++;
      lossPcts.push(Math.abs(r));
      grossLoss += Math.abs(eq * (r / 100));
    }
    eq = eq * (1 + r / 100);
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const avgWin = winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0;
  const avgLoss = lossPcts.length > 0 ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : 0;
  const realizedRR = avgLoss > 0 ? avgWin / avgLoss : avgWin;

  const totalRet = ((eq - initialEquity) / initialEquity) * 100;
  const wr = (wins / trades.length) * 100;
  const pf = grossLoss > 0 ? grossWin / grossLoss : 99;
  const cagr = (Math.pow(eq / initialEquity, 1 / years) - 1) * 100;
  const calmar = maxDD > 0 ? cagr / maxDD : cagr;

  return {
    tradesCount: trades.length,
    wins,
    losses,
    wr,
    avgWin,
    avgLoss,
    realizedRR,
    totalRet,
    cagr,
    maxDD,
    calmar,
    pf,
    finalEquity: eq
  };
}

const qualifiedList = [];

// ============================================================================
// 1. SCANNING CRYPTO 4H (BTC & ETH) WITH RR >= 1.0 (TP >= SL)
// ============================================================================
function scanCrypto4H(bars, symbol, label) {
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

  // We test TP >= SL (Reward >= Risk: 1:1, 1.25:1, 1.5:1, 2:1)
  const brackets = [
    { tpAtr: 1.0, slAtr: 1.0, plannedRR: '1.0 : 1' },
    { tpAtr: 1.25, slAtr: 1.0, plannedRR: '1.25 : 1' },
    { tpAtr: 1.5, slAtr: 1.0, plannedRR: '1.5 : 1' },
    { tpAtr: 1.5, slAtr: 1.25, plannedRR: '1.2 : 1' },
    { tpAtr: 1.5, slAtr: 1.5, plannedRR: '1.0 : 1' },
    { tpAtr: 2.0, slAtr: 1.5, plannedRR: '1.33 : 1' },
    { tpAtr: 2.0, slAtr: 1.0, plannedRR: '2.0 : 1' },
    { tpAtr: 2.5, slAtr: 1.5, plannedRR: '1.67 : 1' },
    { tpAtr: 2.5, slAtr: 2.0, plannedRR: '1.25 : 1' },
    { tpAtr: 3.0, slAtr: 1.5, plannedRR: '2.0 : 1' }
  ];

  const sessions = [
    { name: 'London Open (08 UTC)', hours: [8] },
    { name: 'European Pre-Market (04 UTC)', hours: [4] },
    { name: 'US Open (12 & 16 UTC)', hours: [12, 16] },
    { name: 'Overnight Drift (20 UTC)', hours: [20] },
    { name: 'Dual Session (04 & 08 UTC)', hours: [4, 8] },
    { name: 'Trend Pullback (Any Bar)', hours: [0, 4, 8, 12, 16, 20] }
  ];

  for (const sess of sessions) {
    for (const b of brackets) {
      for (const tFilter of ['ema200', 'both_ema']) {
        for (const rsiMin of [45, 50, 55]) {
          for (const maxHold of [4, 6, 8, 12]) {
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
                } else if (barsHeld >= maxHold) {
                  exitPrice = closes[i];
                  exited = true;
                }

                if (exited) {
                  trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                  inTrade = false;
                }
              }

              if (!inTrade && sess.hours.includes(h)) {
                if (day === 4) continue; // avoid Thursday dump
                let trendOk = false;
                if (tFilter === 'ema200') trendOk = closes[i] > ema200[i];
                else if (tFilter === 'both_ema') trendOk = closes[i] > ema200[i] && ema50[i] > ema200[i];
                if (!trendOk) continue;
                if (rsi14[i] < rsiMin) continue;

                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                slPrice = entryPrice - b.slAtr * atr14[i];
                tpPrice = entryPrice + b.tpAtr * atr14[i];
              }
            }

            const stats = evaluateTradeList(trades, years);
            // Strict filter: CAGR >= 30% AND Realized RR >= 1.0 : 1
            if (stats && stats.cagr >= 30.0 && stats.realizedRR >= 1.0) {
              qualifiedList.push({
                id: `${symbol}_4H_${sess.name}_TP${b.tpAtr}_SL${b.slAtr}_Hold${maxHold}`,
                name: `${label} 4H ${sess.name}`,
                asset: symbol,
                timeframe: '4H',
                sampleYears: years.toFixed(1) + ' Years',
                plannedRR: b.plannedRR,
                setup: `${sess.name} | ${tFilter.toUpperCase()} | RSI > ${rsiMin} | Excl Thu`,
                riskRules: `TP: ${b.tpAtr} ATR | SL: ${b.slAtr} ATR | Max Hold: ${maxHold * 4}h`,
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
// 2. SCANNING CRYPTO DAILY (BTC & ETH) WITH RR >= 1.0 & CAGR >= 30%
// ============================================================================
function scanCryptoDaily(bars, symbol, label) {
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

  const daySetups = [
    { name: 'Weekend Drift (Fri Close -> Mon Close)', days: [5], holdDays: 3 },
    { name: 'Mon-Wed-Fri Active Drift', days: [1, 3, 5], holdDays: 1 },
    { name: 'Wednesday Expansion', days: [3], holdDays: 1 },
    { name: 'Weekend + Wednesday', days: [3, 5], holdDays: 2 },
    { name: 'Turn-of-Month (Day 27 - Day 4)', tom: true, holdDays: 4 },
    { name: 'Golden Quarter (Uptober + Q4)', q4: true, holdDays: 5 }
  ];

  for (const s of daySetups) {
    for (const trendFilter of ['ema200', 'ema50']) {
      for (const rsiMin of [40, 45, 50]) {
        for (const tpMult of [1.0, 1.5, 2.0, 2.5, 3.0, 999]) {
          for (const slMult of [1.0, 1.5, 2.0, 999]) {
            const trades = [];
            let inTrade = false;
            let entryPrice = 0, slPrice = 0, tpPrice = 0, entryIdx = 0, targetExitIdx = 0;

            for (let i = 200; i < n; i++) {
              const dt = new Date(times[i]);
              const day = dt.getUTCDay();
              const dom = dt.getUTCDate();
              const m = dt.getUTCMonth() + 1;

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

              let trigger = false;
              if (s.days && s.days.includes(day)) trigger = true;
              else if (s.tom && (dom >= 27 || dom <= 4)) trigger = true;
              else if (s.q4 && (m === 10 || m === 11 || m === 7) && day === 1) trigger = true;

              if (!inTrade && trigger) {
                if (day === 4) continue; // never Thursday
                const trendPass = trendFilter === 'ema200' ? closes[i] > ema200[i] : closes[i] > ema50[i];
                if (!trendPass) continue;
                if (rsi14[i] < rsiMin) continue;

                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                targetExitIdx = i + (s.holdDays || 1);
                if (slMult !== 999) slPrice = entryPrice - slMult * atr14[i];
                if (tpMult !== 999) tpPrice = entryPrice + tpMult * atr14[i];
              }
            }

            const stats = evaluateTradeList(trades, years);
            if (stats && stats.cagr >= 30.0 && stats.realizedRR >= 1.0) {
              qualifiedList.push({
                id: `${symbol}_1D_${s.name.replace(/\s+/g, '_')}_TP${tpMult}_SL${slMult}`,
                name: `${label} Daily ${s.name}`,
                asset: symbol,
                timeframe: '1D',
                sampleYears: years.toFixed(1) + ' Years',
                plannedRR: tpMult !== 999 && slMult !== 999 ? `${(tpMult / slMult).toFixed(2)} : 1` : 'Session Drift (Natural Edge)',
                setup: `${s.name} | ${trendFilter.toUpperCase()} | RSI > ${rsiMin} | Exclude Thu`,
                riskRules: `TP: ${tpMult === 999 ? 'Session Close' : tpMult + ' ATR'} | SL: ${slMult === 999 ? 'Trend Filter' : slMult + ' ATR'}`,
                ...stats
              });
            }
          }
        }
      }
    }
  }
}

console.log('Scanning BTC 4H...');
scanCrypto4H(datasets.btc4H, 'BTCUSDT', 'Bitcoin');
console.log('Scanning ETH 4H...');
scanCrypto4H(datasets.eth4H, 'ETHUSDT', 'Ethereum');
console.log('Scanning BTC Daily...');
scanCryptoDaily(datasets.btcDaily, 'BTCUSDT', 'Bitcoin');
console.log('Scanning ETH Daily...');
scanCryptoDaily(datasets.ethDaily, 'ETHUSDT', 'Ethereum');

console.log(`\nTotal Qualified Candidates (CAGR >= 30% AND Realized RR >= 1.0:1): ${qualifiedList.length}`);

// Sort by Win Rate to show the highest win rates first that satisfy both conditions!
qualifiedList.sort((a, b) => b.wr - a.wr);

console.log('\n--- TOP 10 HIGHEST WIN-RATE STRATEGIES (WITH REWARD >= RISK & CAGR >= 30%) ---');
qualifiedList.slice(0, 10).forEach((s, idx) => {
  console.log(`\n#${idx + 1}: ${s.name} [${s.asset} | ${s.timeframe}]`);
  console.log(`    Win Rate: ${s.wr.toFixed(2)}% | Realized RR: ${s.realizedRR.toFixed(2)} : 1 (Planned: ${s.plannedRR})`);
  console.log(`    Yearly CAGR: +${s.cagr.toFixed(2)}% | Max DD: ${s.maxDD.toFixed(2)}% | Calmar: ${s.calmar.toFixed(2)} | Profit Factor: ${s.pf.toFixed(2)}`);
  console.log(`    Trades: ${s.tradesCount} | Sample: ${s.sampleYears} | Total Gain: +${s.totalRet.toFixed(1)}%`);
  console.log(`    Setup: ${s.setup}`);
  console.log(`    Risk Rules: ${s.riskRules}`);
});

fs.writeFileSync('quant_seasonality/data/strict_rr_ge_1_cagr_30_leaderboard.json', JSON.stringify(qualifiedList, null, 2));
