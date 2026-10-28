import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

function runTimeframeSweep(tfName, fileName) {
  const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
  const n = candles.length;
  console.log(`\n======================================================`);
  console.log(`Analyzing Timeframe: ${tfName} (${fileName}, ${n} bars)`);
  console.log(`From: ${new Date(candles[0].openTime || candles[0].time).toISOString()} to ${new Date(candles[n-1].openTime || candles[n-1].time).toISOString()}`);

  function computeEMA(arr, period) {
    const ema = new Float64Array(n);
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    ema[period - 1] = sum / period;
    for (let i = period; i < n; i++) {
      ema[i] = arr[i] * k + ema[i - 1] * (1 - k);
    }
    return ema;
  }

  function computeSMA(arr, period) {
    const sma = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i];
    sma[period - 1] = sum / period;
    for (let i = period; i < n; i++) {
      sum += arr[i] - arr[i - period];
      sma[i] = sum / period;
    }
    return sma;
  }

  function computeRSI(closes, period = 14) {
    const rsi = new Float64Array(n);
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gain += diff;
      else loss -= diff;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
      rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return rsi;
  }

  const closes = candles.map(c => c.close);
  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const times = candles.map(c => c.openTime || c.time);
  const hours = times.map(t => new Date(t).getUTCHours());
  const months = times.map(t => {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });

  const ema50 = computeEMA(closes, 50);
  const ema100 = computeEMA(closes, 100);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);

  const bbCache = new Map();
  function getBB(length, mult) {
    const key = `${length}_${mult.toFixed(2)}`;
    if (bbCache.has(key)) return bbCache.get(key);
    const basis = computeSMA(closes, length);
    const upper = new Float64Array(n);
    const lower = new Float64Array(n);
    for (let i = length - 1; i < n; i++) {
      let sumSq = 0;
      for (let j = 0; j < length; j++) {
        const d = closes[i - j] - basis[i];
        sumSq += d * d;
      }
      const dev = mult * Math.sqrt(sumSq / length);
      upper[i] = basis[i] + dev;
      lower[i] = basis[i] - dev;
    }
    const obj = { basis, upper, lower };
    bbCache.set(key, obj);
    return obj;
  }

  function simulate(params) {
    const {
      bbLength, bbMult,
      tpDist, slDist,
      rsiLongMax, rsiShortMin,
      requireBullClose = true,
      requireBearClose = true,
      useEmaFilter = '200',
      useWickFilter = false,
      sessionMode = 'ALL',
      maxHoldBars = 100
    } = params;

    const bb = getBB(bbLength, bbMult);
    const trades = [];
    let inTrade = false;
    let entryBar = 0;
    let entryPrice = 0;
    let direction = 0;
    let currentSL = 0;
    let tpPrice = 0;

    for (let i = Math.max(200, bbLength); i < n - 1; i++) {
      const nextBar = candles[i + 1];

      if (inTrade) {
        const dir = direction;
        const bHigh = nextBar.high;
        const bLow = nextBar.low;
        const bOpen = nextBar.open;

        let exited = false;
        let exitPrice = 0;
        let pnl = 0;
        let result = '';

        if (dir === 1) { // LONG
          const hitTP = bHigh >= tpPrice;
          const hitSL = bLow <= currentSL;

          if (hitTP && hitSL) {
            if (bOpen >= tpPrice) {
              exitPrice = tpPrice;
              pnl = tpDist;
              result = 'WIN';
            } else {
              exitPrice = currentSL;
              pnl = -slDist;
              result = 'LOSS';
            }
            exited = true;
          } else if (hitTP) {
            exitPrice = tpPrice;
            pnl = tpDist;
            result = 'WIN';
            exited = true;
          } else if (hitSL) {
            exitPrice = currentSL;
            pnl = -slDist;
            result = 'LOSS';
            exited = true;
          }
        } else { // SHORT
          const hitTP = bLow <= tpPrice;
          const hitSL = bHigh >= currentSL;

          if (hitTP && hitSL) {
            if (bOpen <= tpPrice) {
              exitPrice = tpPrice;
              pnl = tpDist;
              result = 'WIN';
            } else {
              exitPrice = currentSL;
              pnl = -slDist;
              result = 'LOSS';
            }
            exited = true;
          } else if (hitTP) {
            exitPrice = tpPrice;
            pnl = tpDist;
            result = 'WIN';
            exited = true;
          } else if (hitSL) {
            exitPrice = currentSL;
            pnl = -slDist;
            result = 'LOSS';
            exited = true;
          }
        }

        if (!exited && (i + 1 - entryBar) >= maxHoldBars) {
          exitPrice = nextBar.close;
          pnl = dir === 1 ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
          result = pnl > 0 ? 'WIN' : 'LOSS';
          exited = true;
        }

        if (exited) {
          const profitR = pnl / slDist;
          trades.push({
            entryBar,
            exitBar: i + 1,
            month: months[entryBar],
            direction: dir === 1 ? 'LONG' : 'SHORT',
            entryPrice,
            exitPrice,
            pnl,
            profitR,
            result
          });
          inTrade = false;
        }
      }

      if (!inTrade) {
        const h = hours[i];
        if (sessionMode === 'LON_NY' && (h < 7 || h >= 19)) continue;
        if (sessionMode === 'NY_ONLY' && (h < 12 || h >= 20)) continue;

        let trendLongOk = true;
        let trendShortOk = true;
        if (useEmaFilter === '200') {
          trendLongOk = closes[i] > ema200[i];
          trendShortOk = closes[i] < ema200[i] && ema50[i] < ema200[i];
        } else if (useEmaFilter === '100_200') {
          trendLongOk = closes[i] > ema100[i] && ema100[i] > ema200[i];
          trendShortOk = closes[i] < ema100[i] && ema100[i] < ema200[i];
        } else if (useEmaFilter === '50_200') {
          trendLongOk = closes[i] > ema50[i] && ema50[i] > ema200[i];
          trendShortOk = closes[i] < ema50[i] && ema50[i] < ema200[i];
        }

        let wickLongOk = true;
        let wickShortOk = true;
        if (useWickFilter) {
          const body = Math.abs(closes[i] - opens[i]);
          const lowerWick = Math.min(opens[i], closes[i]) - lows[i];
          const upperWick = highs[i] - Math.max(opens[i], closes[i]);
          wickLongOk = lowerWick >= body * 0.35;
          wickShortOk = upperWick >= body * 0.35;
        }

        const longCond = trendLongOk &&
                         lows[i] <= bb.lower[i] &&
                         (!requireBullClose || closes[i] > opens[i]) &&
                         rsi14[i] < rsiLongMax &&
                         wickLongOk;

        const shortCond = trendShortOk &&
                          highs[i] >= bb.upper[i] &&
                          (!requireBearClose || closes[i] < opens[i]) &&
                          rsi14[i] > rsiShortMin &&
                          wickShortOk;

        if (longCond) {
          inTrade = true;
          direction = 1;
          entryBar = i + 1;
          entryPrice = nextBar.open;
          currentSL = entryPrice - slDist;
          tpPrice = entryPrice + tpDist;
        } else if (shortCond) {
          inTrade = true;
          direction = -1;
          entryBar = i + 1;
          entryPrice = nextBar.open;
          currentSL = entryPrice + slDist;
          tpPrice = entryPrice - tpDist;
        }
      }
    }

    if (trades.length < 20) return null;

    const wins = trades.filter(t => t.profitR > 0.05);
    const losses = trades.filter(t => t.profitR < -0.05);
    const winRate = (wins.length / trades.length) * 100;

    const monthlyR = {};
    const monthlyTrades = {};

    for (const t of trades) {
      monthlyR[t.month] = (monthlyR[t.month] || 0) + t.profitR;
      monthlyTrades[t.month] = (monthlyTrades[t.month] || 0) + 1;
    }

    let cumR = 0;
    let peakR = 0;
    let maxDDR = 0;
    for (const t of trades) {
      cumR += t.profitR;
      if (cumR > peakR) peakR = cumR;
      const dd = peakR - cumR;
      if (dd > maxDDR) maxDDR = dd;
    }

    const calmar = maxDDR > 0 ? (cumR / maxDDR) : 99.0;

    return {
      params,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      netR: cumR,
      maxDDR,
      calmar,
      monthlyR,
      monthlyTrades
    };
  }

  // Define parameter grid tailored to timeframe
  let tpList, slList;
  if (tfName === '5M') {
    tpList = [4.0, 5.0, 6.0, 7.0, 8.0, 10.0];
    slList = [4.0, 5.0, 6.0, 7.0, 8.0];
  } else if (tfName === '15M') {
    tpList = [10.0, 12.0, 14.0, 15.0, 16.0, 18.0, 20.0];
    slList = [10.0, 12.0, 14.0, 15.0, 16.0, 18.0];
  } else if (tfName === '30M') {
    tpList = [15.0, 18.0, 20.0, 25.0, 30.0];
    slList = [12.0, 15.0, 18.0, 20.0];
  } else if (tfName === '1H') {
    tpList = [15.0, 20.0, 25.0, 30.0, 35.0, 40.0];
    slList = [14.0, 18.0, 20.0, 25.0];
  }

  const bbLengths = [20, 25, 30, 35];
  const bbMults = [1.8, 2.0, 2.2, 2.4, 2.6];
  const rsiLongList = [45, 50, 55];
  const emaFilters = ['none', '200', '100_200'];
  const wickFilters = [false, true];

  const results = [];
  for (const bbLength of bbLengths) {
    for (const bbMult of bbMults) {
      for (const tpDist of tpList) {
        for (const slDist of slList) {
          if (tpDist / slDist < 0.99) continue;
          for (const rsiLongMax of rsiLongList) {
            const rsiShortMin = 100 - rsiLongMax;
            for (const useEmaFilter of emaFilters) {
              for (const useWickFilter of wickFilters) {
                const res = simulate({
                  bbLength, bbMult,
                  tpDist, slDist,
                  rsiLongMax, rsiShortMin,
                  useEmaFilter,
                  useWickFilter,
                  sessionMode: 'ALL'
                });

                if (res && res.winRate >= 80.0 && res.totalTrades >= 25) {
                  results.push(res);
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`Results for ${tfName}: Found ${results.length} strategies with Win Rate >= 80% & >= 25 Trades!`);
  results.sort((a, b) => b.winRate - a.winRate || b.calmar - a.calmar);

  for (let i = 0; i < Math.min(5, results.length); i++) {
    const r = results[i];
    const p = r.params;
    const rr = (p.tpDist / p.slDist).toFixed(2);
    console.log(`\n  Top #${i + 1} [${tfName}] | Win Rate: ${r.winRate.toFixed(2)}% (${r.wins}W / ${r.losses}L in ${r.totalTrades}T) | Net: +${r.netR.toFixed(2)}R | Max DD: ${r.maxDDR.toFixed(2)}R | Calmar: ${r.calmar.toFixed(2)}`);
    console.log(`     Params: BB(${p.bbLength}, ${p.bbMult}) | TP: $${p.tpDist} / SL: $${p.slDist} (1 : ${rr}) | RSI: <${p.rsiLongMax} | EMA: ${p.useEmaFilter} | Wick: ${p.useWickFilter}`);
    console.log(`     Monthly R:`, r.monthlyR);
    console.log(`     Monthly Trades:`, r.monthlyTrades);
  }

  return results;
}

runTimeframeSweep('5M', 'xauusd_5m_tv.json');
runTimeframeSweep('15M', 'xauusd_15m_tv.json');
runTimeframeSweep('30M', 'xauusd_30m_tv.json');
runTimeframeSweep('1H', 'xauusd_1h_tv.json');
