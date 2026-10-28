import fs from 'fs';

// Load all datasets
const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));
const gold4H = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8'));

console.log('========================================================================');
console.log('       ENGINEERING ELITE QUANTITATIVE SEASONALITY STRATEGIES            ');
console.log('========================================================================');

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

// -----------------------------------------------------------------------------
// SYSTEM 1: GOLD 4H OVERNIGHT DRIFT + MACRO TREND FILTER
// Strategy: At 19:00 UTC (US Market Close), if Price > EMA(200), Enter Long.
// Exit at 07:00 UTC (London Open) or via ATR Stop/Target.
// -----------------------------------------------------------------------------
function optimizeGoldOvernight(bars) {
  console.log('\n--- 1. Optimizing Gold 4H Overnight Drift Strategy ---');
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);

  const results = [];

  for (const emaFilter of ['none', 'ema50', 'ema200', 'ema_both']) {
    for (const holdMode of ['time_exit', 'atr_sl_tp', 'trailing_sl']) {
      for (const atrSlMult of [1.5, 2.0, 2.5, 3.0, 999]) {
        for (const atrTpMult of [1.5, 2.0, 2.5, 3.0, 999]) {
          if (holdMode === 'time_exit' && (atrSlMult !== 999 || atrTpMult !== 999)) continue;
          if (holdMode !== 'time_exit' && (atrSlMult === 999 || atrTpMult === 999)) continue;

          let eq = 100, peak = 100, maxDD = 0;
          let wins = 0, losses = 0, totalTrades = 0;
          const tradesList = [];

          let inTrade = false;
          let entryPrice = 0;
          let slPrice = 0;
          let tpPrice = 0;
          let entryBarIdx = 0;

          for (let i = 200; i < n; i++) {
            const h = new Date(times[i]).getUTCHours();

            // Exit logic if in trade
            if (inTrade) {
              const barsHeld = i - entryBarIdx;
              let exited = false;
              let exitPrice = 0;

              if (holdMode === 'time_exit') {
                // Exit at 07:00 UTC bar close (or after 3 bars = 12 hours)
                if (h === 7 || barsHeld >= 3) {
                  exitPrice = closes[i];
                  exited = true;
                }
              } else {
                if (highs[i] >= tpPrice && lows[i] <= slPrice) {
                  exitPrice = opens[i] >= tpPrice ? tpPrice : slPrice;
                  exited = true;
                } else if (highs[i] >= tpPrice) {
                  exitPrice = tpPrice;
                  exited = true;
                } else if (lows[i] <= slPrice) {
                  exitPrice = slPrice;
                  exited = true;
                } else if (h === 7 || barsHeld >= 4) {
                  // Session time expiration
                  exitPrice = closes[i];
                  exited = true;
                }
              }

              if (exited) {
                const retPct = ((exitPrice - entryPrice) / entryPrice) * 100;
                totalTrades++;
                if (retPct > 0) wins++;
                else if (retPct < 0) losses++;
                tradesList.push(retPct);

                eq = eq * (1 + retPct / 100);
                if (eq > peak) peak = eq;
                const dd = ((peak - eq) / peak) * 100;
                if (dd > maxDD) maxDD = dd;
                inTrade = false;
              }
            }

            // Entry logic at 19:00 UTC
            if (!inTrade && h === 19) {
              let trendOk = true;
              if (emaFilter === 'ema50') trendOk = closes[i] > ema50[i];
              else if (emaFilter === 'ema200') trendOk = closes[i] > ema200[i];
              else if (emaFilter === 'ema_both') trendOk = closes[i] > ema200[i] && ema50[i] > ema200[i];

              if (trendOk) {
                inTrade = true;
                entryPrice = closes[i];
                entryBarIdx = i;
                slPrice = entryPrice - atr14[i] * atrSlMult;
                tpPrice = entryPrice + atr14[i] * atrTpMult;
              }
            }
          }

          if (totalTrades < 50) continue;
          const wr = (wins / totalTrades) * 100;
          const totalRet = eq - 100;
          const calmar = maxDD > 0 ? (totalRet / maxDD) : 0;

          const grossWin = tradesList.filter(r => r > 0).reduce((a, b) => a + b, 0);
          const grossLoss = Math.abs(tradesList.filter(r => r < 0).reduce((a, b) => a + b, 0));
          const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

          const mean = tradesList.reduce((a, b) => a + b, 0) / totalTrades;
          const variance = tradesList.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totalTrades;
          const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(250) : 0;

          results.push({
            name: `Gold 4H Overnight (${emaFilter}, ${holdMode}, SL:${atrSlMult} ATR, TP:${atrTpMult} ATR)`,
            emaFilter, holdMode, atrSlMult, atrTpMult,
            totalTrades, wins, losses, wr, totalRet, maxDD, calmar, pf, sharpe
          });
        }
      }
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
  console.log(`Top 5 Configurations for Gold 4H Overnight Drift:`);
  results.slice(0, 5).forEach((r, idx) => {
    console.log(`#${idx+1}: ${r.name}`);
    console.log(`    Trades: ${r.totalTrades} | WR: ${r.wr.toFixed(1)}% | Return: +${r.totalRet.toFixed(1)}% | MaxDD: ${r.maxDD.toFixed(1)}% | Calmar: ${r.calmar.toFixed(2)} | PF: ${r.pf.toFixed(2)} | Sharpe: ${r.sharpe.toFixed(2)}`);
  });
  return results[0];
}

// -----------------------------------------------------------------------------
// SYSTEM 2: BITCOIN 4H DAY VS NIGHT / LONDON OPEN MOMENTUM
// Strategy: At 08:00 UTC (London Open), if Trend is Bullish, Enter Long.
// -----------------------------------------------------------------------------
function optimizeBTCSessionDrift(bars) {
  console.log('\n--- 2. Optimizing Bitcoin 4H London & Overnight Drift Strategy ---');
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);

  const results = [];

  for (const entryHour of [8, 20, 'both_8_20']) {
    for (const emaFilter of ['ema50', 'ema200', 'ema_both']) {
      for (const atrSlMult of [1.5, 2.0, 2.5, 3.0]) {
        for (const rr of [1.0, 1.25, 1.5, 2.0]) {
          const atrTpMult = atrSlMult * rr;

          let eq = 100, peak = 100, maxDD = 0;
          let wins = 0, losses = 0, totalTrades = 0;
          const tradesList = [];

          let inTrade = false;
          let entryPrice = 0, slPrice = 0, tpPrice = 0, entryBarIdx = 0;

          for (let i = 200; i < n; i++) {
            const h = new Date(times[i]).getUTCHours();

            if (inTrade) {
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
              } else if (i - entryBarIdx >= 6) { // Max hold 24h
                exitPrice = closes[i];
                exited = true;
              }

              if (exited) {
                const retPct = ((exitPrice - entryPrice) / entryPrice) * 100;
                totalTrades++;
                if (retPct > 0) wins++;
                else if (retPct < 0) losses++;
                tradesList.push(retPct);

                eq = eq * (1 + retPct / 100);
                if (eq > peak) peak = eq;
                const dd = ((peak - eq) / peak) * 100;
                if (dd > maxDD) maxDD = dd;
                inTrade = false;
              }
            }

            if (!inTrade) {
              const hourMatch = entryHour === 'both_8_20' ? (h === 8 || h === 20) : (h === entryHour);
              if (hourMatch) {
                let trendOk = true;
                if (emaFilter === 'ema50') trendOk = closes[i] > ema50[i];
                else if (emaFilter === 'ema200') trendOk = closes[i] > ema200[i];
                else if (emaFilter === 'ema_both') trendOk = closes[i] > ema200[i] && ema50[i] > ema200[i];

                // Day-of-week filter: Avoid Thursday
                const day = new Date(times[i]).getUTCDay();
                const dayOk = day !== 4; // Avoid Thursday

                if (trendOk && dayOk) {
                  inTrade = true;
                  entryPrice = closes[i];
                  entryBarIdx = i;
                  slPrice = entryPrice - atr14[i] * atrSlMult;
                  tpPrice = entryPrice + atr14[i] * atrTpMult;
                }
              }
            }
          }

          if (totalTrades < 40) continue;
          const wr = (wins / totalTrades) * 100;
          const totalRet = eq - 100;
          const calmar = maxDD > 0 ? (totalRet / maxDD) : 0;

          const grossWin = tradesList.filter(r => r > 0).reduce((a, b) => a + b, 0);
          const grossLoss = Math.abs(tradesList.filter(r => r < 0).reduce((a, b) => a + b, 0));
          const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

          const mean = tradesList.reduce((a, b) => a + b, 0) / totalTrades;
          const variance = tradesList.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totalTrades;
          const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(365) : 0;

          results.push({
            name: `BTC 4H Session (${entryHour} UTC, ${emaFilter}, SL:${atrSlMult} ATR, 1:${rr})`,
            entryHour, emaFilter, atrSlMult, rr,
            totalTrades, wins, losses, wr, totalRet, maxDD, calmar, pf, sharpe
          });
        }
      }
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.wr - a.wr);
  console.log(`Top 5 Configurations for Bitcoin 4H Session Momentum:`);
  results.slice(0, 5).forEach((r, idx) => {
    console.log(`#${idx+1}: ${r.name}`);
    console.log(`    Trades: ${r.totalTrades} | WR: ${r.wr.toFixed(1)}% | Return: +${r.totalRet.toFixed(1)}% | MaxDD: ${r.maxDD.toFixed(1)}% | Calmar: ${r.calmar.toFixed(2)} | PF: ${r.pf.toFixed(2)} | Sharpe: ${r.sharpe.toFixed(2)}`);
  });
  return results[0];
}

// -----------------------------------------------------------------------------
// SYSTEM 3: BITCOIN DAILY WEEKEND & TURNAROUND ENGINE (9+ YEARS VERIFIED)
// Strategy: Long on Friday close into Monday + Long Tuesday close into Thursday
// Filtered by 200-Day EMA.
// -----------------------------------------------------------------------------
function optimizeBTCDailyCalendar(bars) {
  console.log('\n--- 3. Optimizing Bitcoin Daily Calendar Anomaly Engine (9.1 Years) ---');
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema200 = computeEMA(closes, 200);

  const results = [];

  for (const filterType of ['none', 'ema200']) {
    for (const setup of ['weekend_only', 'weekend_plus_tuesday', 'mon_wed_fri']) {
      let eq = 100, peak = 100, maxDD = 0;
      let wins = 0, losses = 0, totalTrades = 0;
      const tradesList = [];

      for (let i = 200; i < n; i++) {
        const d = new Date(times[i]).getUTCDay();
        let trigger = false;
        let holdDays = 1;

        if (setup === 'weekend_only') {
          // Friday close to Monday close (3 days)
          if (d === 5 && i + 3 < n) { trigger = true; holdDays = 3; }
        } else if (setup === 'weekend_plus_tuesday') {
          // Friday close to Mon close OR Tuesday close to Wed close
          if (d === 5 && i + 3 < n) { trigger = true; holdDays = 3; }
          else if (d === 2 && i + 1 < n) { trigger = true; holdDays = 1; }
        } else if (setup === 'mon_wed_fri') {
          // Mon open to Mon close, Wed open to Wed close, Fri open to Fri close
          if ((d === 1 || d === 3 || d === 5) && i < n) {
            trigger = true; holdDays = 0; // intraday open to close
          }
        }

        if (trigger) {
          const trendOk = filterType === 'none' || closes[i] > ema200[i];
          if (trendOk) {
            let retPct = 0;
            if (holdDays === 0) {
              retPct = ((closes[i] - opens[i]) / opens[i]) * 100;
            } else {
              retPct = ((closes[i + holdDays].close || closes[i + holdDays]) - closes[i]) / closes[i] * 100;
            }

            totalTrades++;
            if (retPct > 0) wins++;
            else if (retPct < 0) losses++;
            tradesList.push(retPct);

            eq = eq * (1 + retPct / 100);
            if (eq > peak) peak = eq;
            const dd = ((peak - eq) / peak) * 100;
            if (dd > maxDD) maxDD = dd;
          }
        }
      }

      if (totalTrades < 50) continue;
      const wr = (wins / totalTrades) * 100;
      const totalRet = eq - 100;
      const calmar = maxDD > 0 ? (totalRet / maxDD) : 0;

      const grossWin = tradesList.filter(r => r > 0).reduce((a, b) => a + b, 0);
      const grossLoss = Math.abs(tradesList.filter(r => r < 0).reduce((a, b) => a + b, 0));
      const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

      const mean = tradesList.reduce((a, b) => a + b, 0) / totalTrades;
      const variance = tradesList.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totalTrades;
      const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(52) : 0;

      results.push({
        name: `BTC Daily (${setup}, Filter: ${filterType})`,
        setup, filterType, totalTrades, wins, losses, wr, totalRet, maxDD, calmar, pf, sharpe
      });
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.totalRet - a.totalRet);
  console.log(`Top Configurations for Bitcoin Daily Calendar Engine:`);
  results.slice(0, 5).forEach((r, idx) => {
    console.log(`#${idx+1}: ${r.name}`);
    console.log(`    Trades: ${r.totalTrades} | WR: ${r.wr.toFixed(1)}% | Return: +${r.totalRet.toFixed(1)}% | MaxDD: ${r.maxDD.toFixed(1)}% | Calmar: ${r.calmar.toFixed(2)} | PF: ${r.pf.toFixed(2)} | Sharpe: ${r.sharpe.toFixed(2)}`);
  });
  return results[0];
}

// -----------------------------------------------------------------------------
// SYSTEM 4: GOLD DAILY MID-WEEK & THURSDAY ENGINE (29.3 YEARS VERIFIED)
// -----------------------------------------------------------------------------
function optimizeGoldDailyCalendar(bars) {
  console.log('\n--- 4. Optimizing Gold Daily Calendar Engine (29.3 Years) ---');
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema200 = computeEMA(closes, 200);

  const results = [];

  for (const filterType of ['none', 'ema200']) {
    for (const setup of ['thursday_only', 'tue_to_thu', 'wed_to_fri']) {
      let eq = 100, peak = 100, maxDD = 0;
      let wins = 0, losses = 0, totalTrades = 0;
      const tradesList = [];

      for (let i = 200; i < n; i++) {
        const d = new Date(times[i]).getUTCDay();
        let trigger = false;
        let holdDays = 1;

        if (setup === 'thursday_only') {
          if (d === 4) { trigger = true; holdDays = 0; } // Open to close on Thursday
        } else if (setup === 'tue_to_thu') {
          if (d === 2 && i + 2 < n) { trigger = true; holdDays = 2; }
        } else if (setup === 'wed_to_fri') {
          if (d === 3 && i + 2 < n) { trigger = true; holdDays = 2; }
        }

        if (trigger) {
          const trendOk = filterType === 'none' || closes[i] > ema200[i];
          if (trendOk) {
            let retPct = 0;
            if (holdDays === 0) {
              retPct = ((closes[i] - opens[i]) / opens[i]) * 100;
            } else {
              retPct = ((closes[i + holdDays] - closes[i]) / closes[i]) * 100;
            }

            totalTrades++;
            if (retPct > 0) wins++;
            else if (retPct < 0) losses++;
            tradesList.push(retPct);

            eq = eq * (1 + retPct / 100);
            if (eq > peak) peak = eq;
            const dd = ((peak - eq) / peak) * 100;
            if (dd > maxDD) maxDD = dd;
          }
        }
      }

      if (totalTrades < 50) continue;
      const wr = (wins / totalTrades) * 100;
      const totalRet = eq - 100;
      const calmar = maxDD > 0 ? (totalRet / maxDD) : 0;

      const grossWin = tradesList.filter(r => r > 0).reduce((a, b) => a + b, 0);
      const grossLoss = Math.abs(tradesList.filter(r => r < 0).reduce((a, b) => a + b, 0));
      const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin;

      const mean = tradesList.reduce((a, b) => a + b, 0) / totalTrades;
      const variance = tradesList.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totalTrades;
      const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(52) : 0;

      results.push({
        name: `Gold Daily (${setup}, Filter: ${filterType})`,
        setup, filterType, totalTrades, wins, losses, wr, totalRet, maxDD, calmar, pf, sharpe
      });
    }
  }

  results.sort((a, b) => b.calmar - a.calmar || b.totalRet - a.totalRet);
  console.log(`Top Configurations for Gold Daily Calendar Engine:`);
  results.slice(0, 5).forEach((r, idx) => {
    console.log(`#${idx+1}: ${r.name}`);
    console.log(`    Trades: ${r.totalTrades} | WR: ${r.wr.toFixed(1)}% | Return: +${r.totalRet.toFixed(1)}% | MaxDD: ${r.maxDD.toFixed(1)}% | Calmar: ${r.calmar.toFixed(2)} | PF: ${r.pf.toFixed(2)} | Sharpe: ${r.sharpe.toFixed(2)}`);
  });
  return results[0];
}

const bestGold4H = optimizeGoldOvernight(gold4H);
const bestBTC4H = optimizeBTCSessionDrift(btc4H);
const bestBTCDaily = optimizeBTCDailyCalendar(btcDaily);
const bestGoldDaily = optimizeGoldDailyCalendar(goldDaily);

fs.writeFileSync('quant_seasonality/data/optimized_elite_quant_systems.json', JSON.stringify({
  bestGold4H, bestBTC4H, bestBTCDaily, bestGoldDaily
}, null, 2));

console.log('\nOptimization complete! Saved to quant_seasonality/data/optimized_elite_quant_systems.json');
