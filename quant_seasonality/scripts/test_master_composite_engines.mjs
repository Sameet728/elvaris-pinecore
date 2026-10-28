import fs from 'fs';

const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const goldDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8'));

console.log('========================================================================');
console.log('       TESTING MASTER COMPOSITE QUANT SEASONALITY ENGINES               ');
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

// -----------------------------------------------------------------------------
// BITCOIN QUANT MASTER ENGINE
// -----------------------------------------------------------------------------
function testBTCMaster(bars) {
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);
  const rsi14 = computeRSI(closes, 14);

  // Test various composite combinations
  const variants = [
    { name: 'BTC Weekend + Wed + Mon (EMA 200)', longDays: [1, 3, 5], filterMonths: false },
    { name: 'BTC Weekend + Wed (EMA 200)', longDays: [3, 5], filterMonths: false },
    { name: 'BTC Master Seasonality (Elite Days + Uptober/July Full Hold, EMA 200)', longDays: [1, 3, 5], filterMonths: true },
    { name: 'BTC Weekend Long Only (Fri -> Mon Close, EMA 200)', longDays: [5], filterMonths: false }
  ];

  for (const v of variants) {
    let eq = 100, peak = 100, maxDD = 0;
    let wins = 0, losses = 0, totalTrades = 0;
    let grossWin = 0, grossLoss = 0;
    const rets = [];

    let inTrade = false;
    let entryPrice = 0;
    let entryType = '';

    for (let i = 200; i < n; i++) {
      const dt = new Date(times[i]);
      const day = dt.getUTCDay();
      const month = dt.getUTCMonth();
      const dom = dt.getUTCDate();

      const isUptoberOrJuly = (month === 9 || month === 6); // Oct or Jul

      if (inTrade) {
        let exited = false;
        let exitPrice = 0;

        if (entryType === 'weekend' && day === 1) { // Exit Monday close
          exitPrice = closes[i];
          exited = true;
        } else if (entryType === 'day_trade') {
          exitPrice = closes[i];
          exited = true;
        } else if (entryType === 'month_hold') {
          const nextDt = i < n - 1 ? new Date(times[i + 1]) : dt;
          if (nextDt.getUTCMonth() !== month) {
            exitPrice = closes[i];
            exited = true;
          }
        }

        if (exited) {
          const retPct = ((exitPrice - entryPrice) / entryPrice) * 100;
          totalTrades++;
          rets.push(retPct);
          if (retPct > 0) {
            wins++;
            grossWin += retPct;
          } else if (retPct < 0) {
            losses++;
            grossLoss += Math.abs(retPct);
          }

          eq = eq * (1 + retPct / 100);
          if (eq > peak) peak = eq;
          const dd = ((peak - eq) / peak) * 100;
          if (dd > maxDD) maxDD = dd;

          inTrade = false;
        }
      }

      if (!inTrade && closes[i] > ema200[i]) {
        // Entry check
        if (v.filterMonths && isUptoberOrJuly && dom === 1) {
          // Enter full month hold for October or July
          inTrade = true;
          entryPrice = closes[i];
          entryType = 'month_hold';
        } else if (v.longDays.includes(5) && day === 5) {
          // Enter Weekend Long
          inTrade = true;
          entryPrice = closes[i];
          entryType = 'weekend';
        } else if (v.longDays.includes(day) && day !== 5) {
          // Enter Day Trade (Wed or Mon)
          inTrade = true;
          entryPrice = closes[i];
          entryType = 'day_trade';
        }
      }
    }

    const totalRet = ((eq - 100) / 100) * 100;
    const wr = (wins / totalTrades) * 100;
    const pf = grossLoss > 0 ? grossWin / grossLoss : 99;
    const calmar = maxDD > 0 ? totalRet / maxDD : totalRet;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rets.length - 1);
    const sharpe = (mean / Math.sqrt(variance)) * Math.sqrt(totalTrades);

    console.log(`\n[${v.name}]`);
    console.log(`  Trades: ${totalTrades} | Win Rate: ${wr.toFixed(2)}% | Total Return: +${totalRet.toFixed(1)}%`);
    console.log(`  Max Drawdown: ${maxDD.toFixed(2)}% | Calmar Ratio: ${calmar.toFixed(2)} | Profit Factor: ${pf.toFixed(2)} | Sharpe: ${sharpe.toFixed(2)}`);
  }
}

// -----------------------------------------------------------------------------
// GOLD MASTER QUANT ENGINE (29.3 YEARS)
// -----------------------------------------------------------------------------
function testGoldMaster(bars) {
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema200 = computeEMA(closes, 200);
  const ema50 = computeEMA(closes, 50);

  const variants = [
    { name: 'Gold Thursday Edge Only (EMA 200)', mode: 'thu_only' },
    { name: 'Gold January + August Macro Seasonality (EMA 200)', mode: 'jan_aug' },
    { name: 'Gold Master Tri-Calendar (Thursday + January + August, EMA 200)', mode: 'master' }
  ];

  for (const v of variants) {
    let eq = 100, peak = 100, maxDD = 0;
    let wins = 0, losses = 0, totalTrades = 0;
    let grossWin = 0, grossLoss = 0;
    const rets = [];

    let inTrade = false;
    let entryPrice = 0;
    let entryType = '';

    for (let i = 200; i < n; i++) {
      const dt = new Date(times[i]);
      const day = dt.getUTCDay();
      const month = dt.getUTCMonth();
      const dom = dt.getUTCDate();

      const isJanOrAug = (month === 0 || month === 7);
      const isThursday = (day === 4);

      if (inTrade) {
        let exited = false;
        let exitPrice = 0;

        if (entryType === 'thursday') {
          exitPrice = closes[i];
          exited = true;
        } else if (entryType === 'month_hold') {
          const nextDt = i < n - 1 ? new Date(times[i + 1]) : dt;
          if (![0, 7].includes(nextDt.getUTCMonth())) {
            exitPrice = closes[i];
            exited = true;
          }
        }

        if (exited) {
          const retPct = ((exitPrice - entryPrice) / entryPrice) * 100;
          totalTrades++;
          rets.push(retPct);
          if (retPct > 0) {
            wins++;
            grossWin += retPct;
          } else if (retPct < 0) {
            losses++;
            grossLoss += Math.abs(retPct);
          }

          eq = eq * (1 + retPct / 100);
          if (eq > peak) peak = eq;
          const dd = ((peak - eq) / peak) * 100;
          if (dd > maxDD) maxDD = dd;

          inTrade = false;
        }
      }

      if (!inTrade && closes[i] > ema200[i]) {
        if (v.mode === 'thu_only' && isThursday) {
          inTrade = true;
          entryPrice = closes[i];
          entryType = 'thursday';
        } else if (v.mode === 'jan_aug' && isJanOrAug && dom === 1) {
          inTrade = true;
          entryPrice = closes[i];
          entryType = 'month_hold';
        } else if (v.mode === 'master') {
          if (isJanOrAug && dom === 1) {
            inTrade = true;
            entryPrice = closes[i];
            entryType = 'month_hold';
          } else if (!isJanOrAug && isThursday) {
            inTrade = true;
            entryPrice = closes[i];
            entryType = 'thursday';
          }
        }
      }
    }

    const totalRet = ((eq - 100) / 100) * 100;
    const wr = (wins / totalTrades) * 100;
    const pf = grossLoss > 0 ? grossWin / grossLoss : 99;
    const calmar = maxDD > 0 ? totalRet / maxDD : totalRet;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rets.length - 1);
    const sharpe = (mean / Math.sqrt(variance)) * Math.sqrt(totalTrades);

    console.log(`\n[${v.name}]`);
    console.log(`  Trades: ${totalTrades} | Win Rate: ${wr.toFixed(2)}% | Total Return: +${totalRet.toFixed(1)}%`);
    console.log(`  Max Drawdown: ${maxDD.toFixed(2)}% | Calmar Ratio: ${calmar.toFixed(2)} | Profit Factor: ${pf.toFixed(2)} | Sharpe: ${sharpe.toFixed(2)}`);
  }
}

console.log('>>> BITCOIN MASTER QUANT RESULTS:');
testBTCMaster(btcDaily);

console.log('\n>>> GOLD MASTER QUANT RESULTS (29.3 YEARS):');
testGoldMaster(goldDaily);
