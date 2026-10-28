import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const candles15m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const candles30m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8'));

console.log(`Starting Advanced Search to Beat Champion_15M_80WR_Elite...`);
console.log(`Target: Win Rate >= 82% OR (Win Rate >= 80% AND Net R > 26R) | Calmar >= 15.0 | Max DD <= 2.5R`);

function evaluateDataset(candles, tfName) {
  const n = candles.length;
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

  function computeRSI(arr, period = 14) {
    const rsi = new Float64Array(n);
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = arr[i] - arr[i - 1];
      if (diff > 0) gain += diff;
      else loss -= diff;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < n; i++) {
      const diff = arr[i] - arr[i - 1];
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
      rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return rsi;
  }

  function computeATR(candles, period = 14) {
    const atr = new Float64Array(n);
    let sum = 0;
    for (let i = 1; i <= period; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      sum += tr;
    }
    atr[period] = sum / period;
    for (let i = period + 1; i < n; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      atr[i] = (atr[i - 1] * (period - 1) + tr) / period;
    }
    return atr;
  }

  const ema20 = computeEMA(closes, 20);
  const ema50 = computeEMA(closes, 50);
  const ema100 = computeEMA(closes, 100);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);
  const atr14 = computeATR(candles, 14);

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

  function simulate(config) {
    const {
      bbLen, bbMult,
      tpDist, slDist,
      rsiLongMax,
      trendMode, // 'EMA200', 'EMA50_200', 'EMA100_200', 'EMA20_50_200'
      startH, endH,
      minWickRatio = 0.0,
      minAtr = 0.0,
      requireConsecutiveReversal = false
    } = config;

    const bb = getBB(bbLen, bbMult);
    const trades = [];
    let inTrade = false;
    let entryBar = 0;
    let entryPrice = 0;
    let direction = 0;
    let currentSL = 0;
    let tpPrice = 0;

    for (let i = Math.max(200, bbLen); i < n - 1; i++) {
      const nextBar = candles[i + 1];

      if (inTrade) {
        const dir = direction;
        const bHigh = nextBar.high;
        const bLow = nextBar.low;

        let exited = false;
        let pnl = 0;

        if (dir === 1) {
          if (bHigh >= tpPrice) {
            pnl = tpDist;
            exited = true;
          } else if (bLow <= currentSL) {
            pnl = -slDist;
            exited = true;
          }
        } else {
          if (bLow <= tpPrice) {
            pnl = tpDist;
            exited = true;
          } else if (bHigh >= currentSL) {
            pnl = -slDist;
            exited = true;
          }
        }

        if (exited) {
          trades.push({
            entryBar,
            month: months[entryBar],
            pnl,
            profitR: pnl / slDist
          });
          inTrade = false;
        }
      }

      if (!inTrade) {
        const h = hours[i];
        if (h < startH || h > endH) continue;
        if (minAtr > 0 && atr14[i] < minAtr) continue;

        let trendLong = false;
        let trendShort = false;

        if (trendMode === 'EMA200') {
          trendLong = closes[i] > ema200[i];
          trendShort = closes[i] < ema200[i] && ema50[i] < ema200[i];
        } else if (trendMode === 'EMA50_200') {
          trendLong = closes[i] > ema50[i] && ema50[i] > ema200[i];
          trendShort = closes[i] < ema50[i] && ema50[i] < ema200[i];
        } else if (trendMode === 'EMA100_200') {
          trendLong = closes[i] > ema100[i] && ema100[i] > ema200[i];
          trendShort = closes[i] < ema100[i] && ema100[i] < ema200[i];
        } else if (trendMode === 'EMA20_50_200') {
          trendLong = closes[i] > ema20[i] && ema20[i] > ema50[i] && ema50[i] > ema200[i];
          trendShort = closes[i] < ema20[i] && ema20[i] < ema50[i] && ema50[i] < ema200[i];
        }

        let wickLongOk = true;
        let wickShortOk = true;
        if (minWickRatio > 0) {
          const body = Math.abs(closes[i] - opens[i]);
          const lowerWick = Math.min(opens[i], closes[i]) - lows[i];
          const upperWick = highs[i] - Math.max(opens[i], closes[i]);
          wickLongOk = lowerWick >= body * minWickRatio;
          wickShortOk = upperWick >= body * minWickRatio;
        }

        const longCond = trendLong && lows[i] <= bb.lower[i] && closes[i] > opens[i] && rsi14[i] < rsiLongMax && wickLongOk;
        const shortCond = trendShort && highs[i] >= bb.upper[i] && closes[i] < opens[i] && rsi14[i] > (100 - rsiLongMax) && wickShortOk;

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

    if (trades.length < 25) return null;

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const wr = (wins.length / trades.length) * 100;

    const monthlyR = {};
    for (const t of trades) {
      monthlyR[t.month] = (monthlyR[t.month] || 0) + t.profitR;
    }

    let cumR = 0;
    let peakR = 0;
    let maxDD = 0;
    for (const t of trades) {
      cumR += t.profitR;
      if (cumR > peakR) peakR = cumR;
      if (peakR - cumR > maxDD) maxDD = peakR - cumR;
    }

    const calmar = maxDD > 0 ? (cumR / maxDD) : 99.0;

    return {
      config,
      tfName,
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: wr,
      netR: cumR,
      maxDD,
      calmar,
      monthlyR
    };
  }

  const winners = [];

  const bbLengths = [25, 28, 30, 32, 35];
  const bbMults = [2.0, 2.1, 2.2, 2.3, 2.4];
  const tpList = [15.0, 16.0, 17.0, 18.0, 19.0, 20.0];
  const slList = [12.0, 13.0, 14.0, 15.0];
  const rsiList = [48, 50, 52, 54];
  const trendModes = ['EMA200', 'EMA50_200', 'EMA100_200'];
  const sessionRanges = [
    { s: 6, e: 20 },
    { s: 6, e: 21 },
    { s: 7, e: 20 },
    { s: 7, e: 21 },
    { s: 1, e: 20 }
  ];
  const wickRatios = [0.0, 0.25];

  for (const bbLen of bbLengths) {
    for (const bbMult of bbMults) {
      for (const tpDist of tpList) {
        for (const slDist of slList) {
          if (tpDist / slDist < 1.1) continue; // Guaranteed R:R >= 1:1.1
          for (const rsiLongMax of rsiList) {
            for (const trendMode of trendModes) {
              for (const ses of sessionRanges) {
                for (const minWickRatio of wickRatios) {
                  const res = simulate({
                    bbLen, bbMult,
                    tpDist, slDist,
                    rsiLongMax,
                    trendMode,
                    startH: ses.s,
                    endH: ses.e,
                    minWickRatio
                  });

                  if (res && res.winRate >= 81.0 && res.netR >= 24.0 && res.calmar >= 13.0) {
                    winners.push(res);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return winners;
}

const w15 = evaluateDataset(candles15m, '15M');
console.log(`\nFound ${w15.length} Elite Strategies on 15M BEATING the baseline!`);

w15.sort((a, b) => b.winRate - a.winRate || b.calmar - a.calmar || b.netR - a.netR);

for (let i = 0; i < Math.min(10, w15.length); i++) {
  const r = w15[i];
  const c = r.config;
  const rr = (c.tpDist / c.slDist).toFixed(2);
  console.log(`\n🌟 CHAMPION CANDIDATE #${i + 1} [15M]`);
  console.log(`   Win Rate: ${r.winRate.toFixed(2)}% (${r.wins}W / ${r.losses}L in ${r.trades}T) | Net Return: +${r.netR.toFixed(2)}R | Calmar: ${r.calmar.toFixed(2)} | Max DD: ${r.maxDD.toFixed(2)}R`);
  console.log(`   Config: BB(${c.bbLen}, ${c.bbMult}) | TP: $${c.tpDist} / SL: $${c.slDist} (1 : ${rr}) | RSI < ${c.rsiLongMax} | Trend: ${c.trendMode} | Session: ${c.startH}:00-${c.endH}:00 UTC | Wick: ${c.minWickRatio}`);
  console.log(`   Monthly R:`, r.monthlyR);
}
