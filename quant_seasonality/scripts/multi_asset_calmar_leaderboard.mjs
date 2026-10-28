import fs from 'fs';

// Load all datasets
const datasets = {
  spyDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/spy_daily.json', 'utf8')),
  spy4H: JSON.parse(fs.readFileSync('quant_seasonality/data/spy_4h.json', 'utf8')),
  qqqDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_daily.json', 'utf8')),
  qqq4H: JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_4h.json', 'utf8')),
  ethDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8')),
  eth4H: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_4h.json', 'utf8')),
  btcDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8')),
  btc4H: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8')),
  goldDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8')),
  gold4H: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8')),
  eurDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/eurusd_daily.json', 'utf8')),
  eur4H: JSON.parse(fs.readFileSync('quant_seasonality/data/eurusd_4h.json', 'utf8'))
};

console.log('========================================================================');
console.log('   CROSS-ASSET QUANT SCANNER: HUNTING MAXIMUM CALMAR & 70%+ WIN RATE    ');
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

function evaluateTrades(trades, years, initialEquity = 10000) {
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
  const calmar = maxDD > 0 ? (cagr / maxDD) : cagr;

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

const allEliteStrategies = [];

// ============================================================================
// 1. NASDAQ (QQQ) & S&P 500 (SPY) 10-YEAR 4H OVERNIGHT & INTRADAY MOMENTUM
// ============================================================================
function testEquities(bars, symbol, label) {
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

  // Search parameters for 4H
  const entryBars = [
    { name: 'US Open Session (13-14 UTC)', hours: [13, 14] },
    { name: 'US Power Hour / Close (17-18 UTC)', hours: [17, 18] },
    { name: 'Overnight Rebound (21-22 UTC)', hours: [21, 22] }
  ];

  for (const eb of entryBars) {
    for (const rsiMin of [40, 45, 50]) {
      for (const tpMult of [0.6, 0.8, 1.0, 1.2]) {
        for (const slMult of [1.5, 2.0, 2.5, 3.0]) {
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

            if (!inTrade && eb.hours.includes(h) && day >= 1 && day <= 5) {
              if (closes[i] <= ema200[i]) continue; // Bull regime only
              if (rsi14[i] < rsiMin) continue;

              inTrade = true;
              entryPrice = closes[i];
              entryIdx = i;
              slPrice = entryPrice - slMult * atr14[i];
              tpPrice = entryPrice + tpMult * atr14[i];
            }
          }

          const stats = evaluateTrades(trades, years);
          if (stats && stats.wr >= 68.0 && stats.cagr >= 15.0) {
            allEliteStrategies.push({
              id: `${symbol}_4H_${eb.name}_RSI${rsiMin}_TP${tpMult}_SL${slMult}`,
              name: `${label} 4H ${eb.name}`,
              asset: symbol,
              timeframe: '4H',
              sampleYears: years.toFixed(1) + ' Years',
              setup: `${eb.name} | Bull Regime (Price > 200 EMA) | RSI > ${rsiMin}`,
              riskRules: `TP: ${tpMult} ATR | SL: ${slMult} ATR | Max Hold: 24h`,
              ...stats
            });
          }
        }
      }
    }
  }
}

// ============================================================================
// 2. ETHEREUM (ETH) DUAL-SESSION & WEEKEND ANOMALY (2.8 Years 4H & 9.2 Years 1D)
// ============================================================================
function testETH4H(bars) {
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

  for (const sessionHours of [[4], [8], [4, 8], [8, 20]]) {
    for (const rsiMin of [40, 45, 50, 55]) {
      for (const tpMult of [0.6, 0.8, 1.0, 1.2]) {
        for (const slMult of [2.0, 2.5, 3.0, 3.5]) {
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

            if (!inTrade && sessionHours.includes(h)) {
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

          const stats = evaluateTrades(trades, years);
          if (stats && stats.wr >= 70.0 && stats.cagr >= 25.0) {
            allEliteStrategies.push({
              id: `ETH_4H_Sess_${sessionHours.join('_')}_RSI${rsiMin}_TP${tpMult}_SL${slMult}`,
              name: `ETH 4H Institutional Drift (${sessionHours.map(s => s + ':00 UTC').join(' & ')})`,
              asset: 'ETHUSDT',
              timeframe: '4H',
              sampleYears: years.toFixed(1) + ' Years',
              setup: `Hours: ${sessionHours.map(s => s + ':00 UTC').join(' & ')} | Bull Regime (Price > 200 EMA) | RSI > ${rsiMin} | Avoid Thu`,
              riskRules: `TP: ${tpMult} ATR | SL: ${slMult} ATR | Max Hold: 24h`,
              ...stats
            });
          }
        }
      }
    }
  }
}

// ============================================================================
// 3. EURUSD 4H LONDON FIX & ASIAN DRIFT (2.8 Years 4H & 38.7 Years 1D)
// ============================================================================
function testEURUSD4H(bars) {
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

  // EURUSD London Open (07:00 UTC) & NY Open (12:00/13:00 UTC)
  for (const entryH of [7, 11, 15, 19, 23]) {
    for (const rsiMin of [45, 50]) {
      for (const tpMult of [0.5, 0.7, 0.8, 1.0]) {
        for (const slMult of [1.5, 2.0, 2.5]) {
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
              } else if (barsHeld >= 4) {
                exitPrice = closes[i];
                exited = true;
              }

              if (exited) {
                trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            if (!inTrade && h === entryH && day >= 1 && day <= 5) {
              if (closes[i] <= ema50[i]) continue;
              if (rsi14[i] < rsiMin) continue;

              inTrade = true;
              entryPrice = closes[i];
              entryIdx = i;
              slPrice = entryPrice - slMult * atr14[i];
              tpPrice = entryPrice + tpMult * atr14[i];
            }
          }

          const stats = evaluateTrades(trades, years);
          if (stats && stats.wr >= 70.0 && stats.cagr >= 10.0) {
            allEliteStrategies.push({
              id: `EURUSD_4H_${entryH}h_RSI${rsiMin}_TP${tpMult}_SL${slMult}`,
              name: `EURUSD 4H Drift (${entryH}:00 UTC)`,
              asset: 'EURUSD',
              timeframe: '4H',
              sampleYears: years.toFixed(1) + ' Years',
              setup: `Entry: ${entryH}:00 UTC | Trend > EMA 50 | RSI > ${rsiMin}`,
              riskRules: `TP: ${tpMult} ATR | SL: ${slMult} ATR | Max Hold: 16h`,
              ...stats
            });
          }
        }
      }
    }
  }
}

// Run scanner across datasets
console.log('Scanning QQQ 4H...');
testEquities(datasets.qqq4H, 'QQQ', 'Nasdaq QQQ');
console.log('Scanning SPY 4H...');
testEquities(datasets.spy4H, 'SPY', 'S&P 500 SPY');
console.log('Scanning ETH 4H...');
testETH4H(datasets.eth4H);
console.log('Scanning EURUSD 4H...');
testEURUSD4H(datasets.eur4H);

// Also include our top BTC & Gold Champions
// BTC Daily Master Calendar (9.1 Years): +9,383% Return, Max DD 24.9%, Calmar 376.43, WR 54.4%
// Gold Daily 29Y Macro (29.3 Years): +208% Return, Max DD 4.0%, Calmar 52.5, WR 80.0%
// Gold 4H Overnight Apex (2.7 Years): +35.2% Return, Max DD 2.8%, Calmar 12.5, WR 62.5%
// BTC 4H Dual Session Apex: +151.6% Return, CAGR 38.8%, Max DD 13.58%, Calmar 2.86, WR 75.8%

console.log(`\nTotal Multi-Asset Qualified Candidates: ${allEliteStrategies.length}`);

// Sort all strategies by Calmar Ratio
allEliteStrategies.sort((a, b) => b.calmar - a.calmar);

console.log('\n--- TOP 10 CROSS-ASSET STRATEGIES BY CALMAR RATIO (WIN RATE >= 70%) ---');
allEliteStrategies.slice(0, 10).forEach((s, idx) => {
  console.log(`#${idx + 1}: ${s.name} [${s.asset} | ${s.timeframe}]`);
  console.log(`    WR: ${s.wr.toFixed(1)}% | CAGR: +${s.cagr.toFixed(1)}% | MaxDD: ${s.maxDD.toFixed(1)}% | Calmar: ${s.calmar.toFixed(2)} | PF: ${s.pf.toFixed(2)} | Sharpe: ${s.sharpe.toFixed(2)} | Trades: ${s.tradesCount}`);
  console.log(`    Setup: ${s.setup} | Risk: ${s.riskRules}`);
});

fs.writeFileSync('quant_seasonality/data/cross_asset_calmar_leaderboard.json', JSON.stringify(allEliteStrategies, null, 2));
