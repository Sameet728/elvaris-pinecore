import fs from 'fs';

// Load datasets
const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const btc4H = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));
const gold4H = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8'));

console.log('========================================================================');
console.log(' DEEP QUANT OPTIMIZATION: MAX WINRATE, MIN DRAWDOWN, HIGHEST CALMAR    ');
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

function calcStats(trades, initialEquity = 100) {
  if (trades.length === 0) return { totalTrades: 0, wr: 0, totalRet: 0, maxDD: 999, calmar: 0, pf: 0, sharpe: 0 };
  let eq = initialEquity, peak = initialEquity, maxDD = 0;
  let wins = 0, losses = 0, grossWin = 0, grossLoss = 0;
  const rets = [];

  for (const t of trades) {
    const r = t.retPct;
    rets.push(r);
    if (r > 0) {
      wins++;
      grossWin += r;
    } else if (r < 0) {
      losses++;
      grossLoss += Math.abs(r);
    }
    eq = eq * (1 + r / 100);
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const totalRet = ((eq - initialEquity) / initialEquity) * 100;
  const wr = (wins / trades.length) * 100;
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  const calmar = maxDD > 0 ? totalRet / maxDD : totalRet;

  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rets.length > 1 ? rets.length - 1 : 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(trades.length) : 0;

  return {
    totalTrades: trades.length,
    wins,
    losses,
    wr,
    totalRet,
    maxDD,
    calmar,
    pf,
    sharpe,
    finalEquity: eq
  };
}

// ============================================================================
// EXPERIMENT 1: GOLD 4H OVERNIGHT APEX SYSTEM (Targeting WR > 65%, MaxDD < 3%)
// ============================================================================
function deepOptimizeGold4H(bars) {
  console.log('>>> 1. Deep Optimizing Gold 4H Overnight Apex Strategy...');
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(highs, lows, closes, 14);

  const configs = [];

  // Grid search: entry hours, day filters, RSI filters, stop/target models
  const entryHours = [19, 23]; // 19:00 UTC or 23:00 UTC
  const daysOfWeek = ['all', 'tue_wed_thu', 'wed_thu_fri', 'thu_only', 'exclude_mon'];
  const rsiFilters = ['none', 'rsi_above_45', 'rsi_above_50', 'rsi_below_70', 'rsi_45_to_70'];
  const trendFilters = ['none', 'ema50', 'ema200', 'ema50_and_200'];
  const exitModes = [
    { mode: 'time_only', slAtr: 999, tpAtr: 999 },
    { mode: 'bracket', slAtr: 1.0, tpAtr: 1.5 },
    { mode: 'bracket', slAtr: 1.5, tpAtr: 2.0 },
    { mode: 'bracket', slAtr: 1.5, tpAtr: 2.5 },
    { mode: 'bracket', slAtr: 2.0, tpAtr: 2.5 },
    { mode: 'trailing', slAtr: 1.5, tpAtr: 2.5 },
    { mode: 'trailing', slAtr: 2.0, tpAtr: 3.0 }
  ];

  for (const entryH of entryHours) {
    for (const dFilter of daysOfWeek) {
      for (const rsiF of rsiFilters) {
        for (const tFilter of trendFilters) {
          for (const exit of exitModes) {
            const trades = [];
            let inTrade = false;
            let entryPrice = 0, slPrice = 0, tpPrice = 0, highestPrice = 0;
            let entryBarIdx = 0;

            for (let i = 200; i < n; i++) {
              const dt = new Date(times[i]);
              const h = dt.getUTCHours();
              const day = dt.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri

              if (inTrade) {
                const barsHeld = i - entryBarIdx;
                let exited = false;
                let exitPrice = 0;

                if (highs[i] > highestPrice) highestPrice = highs[i];

                if (exit.mode === 'trailing') {
                  const trailStop = highestPrice - exit.slAtr * atr14[i];
                  if (trailStop > slPrice) slPrice = trailStop;
                }

                if (exit.mode !== 'time_only') {
                  if (highs[i] >= tpPrice && lows[i] <= slPrice) {
                    exitPrice = opens[i] >= tpPrice ? tpPrice : slPrice;
                    exited = true;
                  } else if (highs[i] >= tpPrice) {
                    exitPrice = tpPrice;
                    exited = true;
                  } else if (lows[i] <= slPrice) {
                    exitPrice = slPrice;
                    exited = true;
                  }
                }

                // Time exit at 07:00 UTC (European open) or max bars
                if (!exited && (h === 7 || (entryH === 19 && barsHeld >= 3) || (entryH === 23 && barsHeld >= 2))) {
                  exitPrice = closes[i];
                  exited = true;
                }

                if (exited) {
                  trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                  inTrade = false;
                }
              }

              // Check Entry
              if (!inTrade && h === entryH) {
                // Day filter
                let dayPass = true;
                if (dFilter === 'tue_wed_thu' && (day < 2 || day > 4)) dayPass = false;
                if (dFilter === 'wed_thu_fri' && (day < 3 || day > 5)) dayPass = false;
                if (dFilter === 'thu_only' && day !== 4) dayPass = false;
                if (dFilter === 'exclude_mon' && day === 1) dayPass = false;
                if (day === 0 || day === 6) dayPass = false; // no weekends

                // Trend filter
                let trendPass = true;
                if (tFilter === 'ema50' && closes[i] <= ema50[i]) trendPass = false;
                if (tFilter === 'ema200' && closes[i] <= ema200[i]) trendPass = false;
                if (tFilter === 'ema50_and_200' && (closes[i] <= ema50[i] || closes[i] <= ema200[i])) trendPass = false;

                // RSI filter
                let rsiPass = true;
                const r = rsi14[i];
                if (rsiF === 'rsi_above_45' && r < 45) rsiPass = false;
                if (rsiF === 'rsi_above_50' && r < 50) rsiPass = false;
                if (rsiF === 'rsi_below_70' && r > 70) rsiPass = false;
                if (rsiF === 'rsi_45_to_70' && (r < 45 || r > 70)) rsiPass = false;

                if (dayPass && trendPass && rsiPass) {
                  inTrade = true;
                  entryPrice = closes[i];
                  entryBarIdx = i;
                  highestPrice = entryPrice;
                  if (exit.mode !== 'time_only') {
                    slPrice = entryPrice - exit.slAtr * atr14[i];
                    tpPrice = entryPrice + exit.tpAtr * atr14[i];
                  }
                }
              }
            }

            if (trades.length >= 40) {
              const stats = calcStats(trades);
              configs.push({
                entryH,
                dFilter,
                rsiF,
                tFilter,
                exit: `${exit.mode}_sl${exit.slAtr}_tp${exit.tpAtr}`,
                ...stats
              });
            }
          }
        }
      }
    }
  }

  // Sort by Win Rate & Calmar
  configs.sort((a, b) => b.wr * 0.4 + b.calmar * 0.6 - (a.wr * 0.4 + a.calmar * 0.6));
  const topByWR = [...configs].sort((a, b) => b.wr - a.wr).slice(0, 5);
  const topByCalmar = [...configs].sort((a, b) => b.calmar - a.calmar).slice(0, 5);

  console.log('\n--- TOP 3 GOLD 4H OVERNIGHT BY HIGHEST WIN RATE ---');
  topByWR.slice(0, 3).forEach((c, idx) => {
    console.log(`#${idx + 1}: Entry ${c.entryH}h | Days:${c.dFilter} | Trend:${c.tFilter} | RSI:${c.rsiF} | Exit:${c.exit}`);
    console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
  });

  console.log('\n--- TOP 3 GOLD 4H OVERNIGHT BY HIGHEST CALMAR RATIO (LOWEST DRAWDOWN) ---');
  topByCalmar.slice(0, 3).forEach((c, idx) => {
    console.log(`#${idx + 1}: Entry ${c.entryH}h | Days:${c.dFilter} | Trend:${c.tFilter} | RSI:${c.rsiF} | Exit:${c.exit}`);
    console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
  });

  return { topByWR: topByWR[0], topByCalmar: topByCalmar[0] };
}

// ============================================================================
// EXPERIMENT 2: BITCOIN DAILY QUANT APEX (Targeting WR > 70%, Massive Return, Low DD)
// Combining: Day of Week + Elite Month Matrix + Trend Alignment
// ============================================================================
function deepOptimizeBTCDaily(bars) {
  console.log('\n>>> 2. Deep Optimizing Bitcoin Daily Seasonality Apex Strategy...');
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(highs, lows, closes, 14);

  const configs = [];

  // Setups to test:
  // 1. Weekend Long (Fri close to Mon close)
  // 2. Mon-Wed-Fri Long
  // 3. Uptober / Golden Months (Oct, July, Nov, Feb, Apr)
  // 4. Multi-confluence: High probability days filtered by bullish months or RSI dips
  const setups = [
    'weekend_engine',
    'mon_wed_fri',
    'golden_months_all_days',
    'golden_months_fav_days',
    'turn_of_month_plus_fav_days'
  ];

  const trendFilters = ['none', 'ema50', 'ema200', 'golden_cross'];
  const rsiEntryFilters = ['none', 'rsi_dip_under_55', 'rsi_above_45', 'rsi_between_40_70'];

  for (const setup of setups) {
    for (const tFilter of trendFilters) {
      for (const rsiF of rsiEntryFilters) {
        for (const atrSlMult of [0, 2.0, 3.0, 4.0]) {
          const trades = [];
          let inTrade = false;
          let entryPrice = 0, slPrice = 0, entryBarIdx = 0, targetExitDay = -1;

          for (let i = 200; i < n; i++) {
            const dt = new Date(times[i]);
            const day = dt.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
            const month = dt.getUTCMonth(); // 0=Jan .. 9=Oct
            const dom = dt.getUTCDate();

            const isGoldenMonth = [1, 3, 6, 9, 10].includes(month); // Feb, Apr, Jul, Oct, Nov
            const isBullDay = [1, 3, 5].includes(day); // Mon, Wed, Fri
            const isTOM = dom >= 27 || dom <= 5;

            // Manage Open Trade
            if (inTrade) {
              let exited = false;
              let exitPrice = 0;

              // Check SL
              if (atrSlMult > 0 && lows[i] <= slPrice) {
                exitPrice = slPrice;
                exited = true;
              } else if (setup === 'weekend_engine') {
                if (day === 1) { // Monday close exit
                  exitPrice = closes[i];
                  exited = true;
                }
              } else if (setup === 'mon_wed_fri') {
                // Hold 1 day and exit at close
                exitPrice = closes[i];
                exited = true;
              } else if (setup === 'golden_months_fav_days' || setup === 'turn_of_month_plus_fav_days') {
                // Exit after 1-2 days
                if (i - entryBarIdx >= 1) {
                  exitPrice = closes[i];
                  exited = true;
                }
              } else if (setup === 'golden_months_all_days') {
                // Exit when month ends or on Friday
                const nextDt = i < n - 1 ? new Date(times[i + 1]) : dt;
                if (nextDt.getUTCMonth() !== month) {
                  exitPrice = closes[i];
                  exited = true;
                }
              }

              if (exited) {
                trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            // Entry Condition
            if (!inTrade) {
              let trigger = false;

              if (setup === 'weekend_engine' && day === 5) { // Buy Friday close
                trigger = true;
              } else if (setup === 'mon_wed_fri' && isBullDay) {
                trigger = true;
              } else if (setup === 'golden_months_all_days' && isGoldenMonth && dom === 1) {
                trigger = true;
              } else if (setup === 'golden_months_fav_days' && isGoldenMonth && isBullDay) {
                trigger = true;
              } else if (setup === 'turn_of_month_plus_fav_days' && (isTOM || isBullDay)) {
                trigger = true;
              }

              // Trend filter
              let trendPass = true;
              if (tFilter === 'ema50' && closes[i] <= ema50[i]) trendPass = false;
              if (tFilter === 'ema200' && closes[i] <= ema200[i]) trendPass = false;
              if (tFilter === 'golden_cross' && (closes[i] <= ema200[i] || ema50[i] <= ema200[i])) trendPass = false;

              // RSI entry filter
              let rsiPass = true;
              const r = rsi14[i];
              if (rsiF === 'rsi_dip_under_55' && r > 55) rsiPass = false;
              if (rsiF === 'rsi_above_45' && r < 45) rsiPass = false;
              if (rsiF === 'rsi_between_40_70' && (r < 40 || r > 70)) rsiPass = false;

              if (trigger && trendPass && rsiPass) {
                inTrade = true;
                entryPrice = closes[i];
                entryBarIdx = i;
                if (atrSlMult > 0) {
                  slPrice = entryPrice - atrSlMult * atr14[i];
                }
              }
            }
          }

          if (trades.length >= 30) {
            const stats = calcStats(trades);
            configs.push({
              setup,
              tFilter,
              rsiF,
              atrSlMult,
              ...stats
            });
          }
        }
      }
    }
  }

  const topByWR = [...configs].sort((a, b) => b.wr - a.wr).slice(0, 5);
  const topByCalmar = [...configs].sort((a, b) => b.calmar - a.calmar).slice(0, 5);

  console.log('\n--- TOP 3 BITCOIN DAILY BY HIGHEST WIN RATE ---');
  topByWR.slice(0, 3).forEach((c, idx) => {
    console.log(`#${idx + 1}: Setup:${c.setup} | Trend:${c.tFilter} | RSI:${c.rsiF} | SL:${c.atrSlMult} ATR`);
    console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
  });

  console.log('\n--- TOP 3 BITCOIN DAILY BY HIGHEST CALMAR RATIO (LOWEST DRAWDOWN) ---');
  topByCalmar.slice(0, 3).forEach((c, idx) => {
    console.log(`#${idx + 1}: Setup:${c.setup} | Trend:${c.tFilter} | RSI:${c.rsiF} | SL:${c.atrSlMult} ATR`);
    console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
  });

  return { topByWR: topByWR[0], topByCalmar: topByCalmar[0] };
}

// ============================================================================
// EXPERIMENT 3: GOLD DAILY 29-YEAR CALENDAR SOVEREIGN (Targeting WR > 65%, MaxDD < 7%)
// Combining: Thursday Edge + January / August Seasonality + 200 EMA Filter
// ============================================================================
function deepOptimizeGoldDaily(bars) {
  console.log('\n>>> 3. Deep Optimizing Gold Daily 29-Year Sovereign Calendar Strategy...');
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(highs, lows, closes, 14);

  const configs = [];

  const setups = [
    'thursday_only',
    'tue_to_thu',
    'january_and_august_all_days',
    'january_august_plus_thursdays',
    'midweek_expansion' // Tue close to Thu close
  ];

  const trendFilters = ['none', 'ema50', 'ema200', 'golden_cross'];
  const rsiFilters = ['none', 'rsi_above_45', 'rsi_between_40_70', 'rsi_dip_under_60'];

  for (const setup of setups) {
    for (const tFilter of trendFilters) {
      for (const rsiF of rsiFilters) {
        for (const atrSlMult of [0, 2.0, 3.0]) {
          const trades = [];
          let inTrade = false;
          let entryPrice = 0, slPrice = 0, entryBarIdx = 0;

          for (let i = 200; i < n; i++) {
            const dt = new Date(times[i]);
            const day = dt.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri
            const month = dt.getUTCMonth(); // 0=Jan, 7=Aug

            const isJanOrAug = month === 0 || month === 7;
            const isThursday = day === 4;

            // Manage Trade
            if (inTrade) {
              let exited = false;
              let exitPrice = 0;

              if (atrSlMult > 0 && lows[i] <= slPrice) {
                exitPrice = slPrice;
                exited = true;
              } else if (setup === 'thursday_only') {
                exitPrice = closes[i];
                exited = true;
              } else if (setup === 'midweek_expansion') {
                if (day === 4) { // Thursday close
                  exitPrice = closes[i];
                  exited = true;
                }
              } else if (setup === 'january_and_august_all_days') {
                const nextDt = i < n - 1 ? new Date(times[i + 1]) : dt;
                if (![0, 7].includes(nextDt.getUTCMonth())) {
                  exitPrice = closes[i];
                  exited = true;
                }
              } else if (setup === 'january_august_plus_thursdays') {
                if (i - entryBarIdx >= 1) {
                  exitPrice = closes[i];
                  exited = true;
                }
              } else if (setup === 'tue_to_thu') {
                if (day === 4) {
                  exitPrice = closes[i];
                  exited = true;
                }
              }

              if (exited) {
                trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            // Entry Condition
            if (!inTrade) {
              let trigger = false;
              if (setup === 'thursday_only' && isThursday) trigger = true;
              else if (setup === 'midweek_expansion' && day === 2) trigger = true; // Enter Tuesday close
              else if (setup === 'january_and_august_all_days' && isJanOrAug && dt.getUTCDate() === 1) trigger = true;
              else if (setup === 'january_august_plus_thursdays' && (isJanOrAug || isThursday)) trigger = true;
              else if (setup === 'tue_to_thu' && day === 2) trigger = true;

              // Trend
              let trendPass = true;
              if (tFilter === 'ema50' && closes[i] <= ema50[i]) trendPass = false;
              if (tFilter === 'ema200' && closes[i] <= ema200[i]) trendPass = false;
              if (tFilter === 'golden_cross' && (closes[i] <= ema200[i] || ema50[i] <= ema200[i])) trendPass = false;

              // RSI
              let rsiPass = true;
              const r = rsi14[i];
              if (rsiF === 'rsi_above_45' && r < 45) rsiPass = false;
              if (rsiF === 'rsi_between_40_70' && (r < 40 || r > 70)) rsiPass = false;
              if (rsiF === 'rsi_dip_under_60' && r > 60) rsiPass = false;

              if (trigger && trendPass && rsiPass) {
                inTrade = true;
                entryPrice = closes[i];
                entryBarIdx = i;
                if (atrSlMult > 0) slPrice = entryPrice - atrSlMult * atr14[i];
              }
            }
          }

          if (trades.length >= 30) {
            const stats = calcStats(trades);
            configs.push({
              setup,
              tFilter,
              rsiF,
              atrSlMult,
              ...stats
            });
          }
        }
      }
    }
  }

  const topByWR = [...configs].sort((a, b) => b.wr - a.wr).slice(0, 5);
  const topByCalmar = [...configs].sort((a, b) => b.calmar - a.calmar).slice(0, 5);

  console.log('\n--- TOP 3 GOLD DAILY (29 YEARS) BY HIGHEST WIN RATE ---');
  topByWR.slice(0, 3).forEach((c, idx) => {
    console.log(`#${idx + 1}: Setup:${c.setup} | Trend:${c.tFilter} | RSI:${c.rsiF} | SL:${c.atrSlMult} ATR`);
    console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
  });

  console.log('\n--- TOP 3 GOLD DAILY (29 YEARS) BY HIGHEST CALMAR RATIO (LOWEST DRAWDOWN) ---');
  topByCalmar.slice(0, 3).forEach((c, idx) => {
    console.log(`#${idx + 1}: Setup:${c.setup} | Trend:${c.tFilter} | RSI:${c.rsiF} | SL:${c.atrSlMult} ATR`);
    console.log(`    Trades:${c.totalTrades} | WR:${c.wr.toFixed(1)}% | Return:+${c.totalRet.toFixed(1)}% | MaxDD:${c.maxDD.toFixed(1)}% | Calmar:${c.calmar.toFixed(1)} | PF:${c.pf.toFixed(2)} | Sharpe:${c.sharpe.toFixed(2)}`);
  });

  return { topByWR: topByWR[0], topByCalmar: topByCalmar[0] };
}

// Run all deep optimizations
const gold4HResults = deepOptimizeGold4H(gold4H);
const btcDailyResults = deepOptimizeBTCDaily(btcDaily);
const goldDailyResults = deepOptimizeGoldDaily(goldDaily);

fs.writeFileSync('quant_seasonality/data/deep_quant_apex_results.json', JSON.stringify({
  gold4H: gold4HResults,
  btcDaily: btcDailyResults,
  goldDaily: goldDailyResults
}, null, 2));

console.log('\n>>> Deep optimization complete! Artifact saved to quant_seasonality/data/deep_quant_apex_results.json');
