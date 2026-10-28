import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const candles15 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const n = candles15.length;

console.log(`Candles: ${n} from ${new Date(candles15[0].openTime || candles15[0].time).toISOString()} to ${new Date(candles15[n - 1].openTime || candles15[n - 1].time).toISOString()}`);

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

function computeBB(closes, length, mult) {
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
  return { basis, upper, lower };
}

const closes = candles15.map(c => c.close);
const opens = candles15.map(c => c.open);
const highs = candles15.map(c => c.high);
const lows = candles15.map(c => c.low);
const nextOpens = new Float64Array(n);
const nextHighs = new Float64Array(n);
const nextLows = new Float64Array(n);
for (let i = 0; i < n - 1; i++) {
  nextOpens[i] = candles15[i + 1].open;
  nextHighs[i] = candles15[i + 1].high;
  nextLows[i] = candles15[i + 1].low;
}

const times = candles15.map(c => c.openTime || c.time);
const hours = new Int32Array(times.map(t => new Date(t).getUTCHours()));
const months = times.map(t => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
});

const ema50 = computeEMA(closes, 50);
const ema200 = computeEMA(closes, 200);
const rsi14 = computeRSI(closes, 14);

const bbLens = [20, 25, 30, 35];
const bbMults = [1.8, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5];
const bbMap = new Map();

for (const len of bbLens) {
  for (const mult of bbMults) {
    bbMap.set(`${len}_${mult}`, computeBB(closes, len, mult));
  }
}

function evaluateStrategy(bbKey, tpDist, slDist, rsiMax, startH, endH, allowShort) {
  const bb = bbMap.get(bbKey);
  const bbLower = bb.lower;
  const bbUpper = bb.upper;
  const rsiShortMin = 100 - rsiMax;

  let wins = 0;
  let totalTrades = 0;
  let rAug = 0, rSep = 0, rOct = 0;
  let inTrade = false;
  let dir = 0;
  let tpPrice = 0;
  let currentSL = 0;
  let entryMonth = '';

  let cumR = 0, peakR = 0, maxDD = 0;

  for (let i = 200; i < n - 1; i++) {
    if (inTrade) {
      let exited = false;
      let pnl = 0;

      if (dir === 1) {
        if (nextHighs[i - 1] >= tpPrice) { // nextBar of bar where trade entered or continued
          pnl = tpDist;
          exited = true;
        } else if (nextLows[i - 1] <= currentSL) {
          pnl = -slDist;
          exited = true;
        }
      } else {
        if (nextLows[i - 1] <= tpPrice) {
          pnl = tpDist;
          exited = true;
        } else if (nextHighs[i - 1] >= currentSL) {
          pnl = -slDist;
          exited = true;
        }
      }

      if (exited) {
        const profitR = pnl / slDist;
        totalTrades++;
        if (pnl > 0) wins++;

        if (entryMonth === '2026-08') rAug += profitR;
        else if (entryMonth === '2026-09') rSep += profitR;
        else if (entryMonth === '2026-10') rOct += profitR;

        cumR += profitR;
        if (cumR > peakR) peakR = cumR;
        if (peakR - cumR > maxDD) maxDD = peakR - cumR;

        inTrade = false;
      }
    }

    if (!inTrade) {
      const h = hours[i];
      if (h < startH || h > endH) continue;

      const c = closes[i];
      const o = opens[i];
      const l = lows[i];
      const hBar = highs[i];
      const e200 = ema200[i];
      const r = rsi14[i];

      const longCond = c > e200 && l <= bbLower[i] && c > o && r < rsiMax;
      const shortCond = allowShort && c < e200 && ema50[i] < e200 && hBar >= bbUpper[i] && c < o && r > rsiShortMin;

      if (longCond) {
        inTrade = true;
        dir = 1;
        const entryPrice = nextOpens[i];
        currentSL = entryPrice - slDist;
        tpPrice = entryPrice + tpDist;
        entryMonth = months[i + 1];
      } else if (shortCond) {
        inTrade = true;
        dir = -1;
        const entryPrice = nextOpens[i];
        currentSL = entryPrice + slDist;
        tpPrice = entryPrice - tpDist;
        entryMonth = months[i + 1];
      }
    }
  }

  if (totalTrades < 30) return null;

  const wr = (wins / totalTrades) * 100;
  const calmar = maxDD > 0 ? (cumR / maxDD) : 99;

  return {
    bbKey, tpDist, slDist, rsiMax, startH, endH, allowShort,
    totalTrades,
    wins,
    losses: totalTrades - wins,
    winRate: wr,
    netR: cumR,
    maxDD,
    calmar,
    rAug,
    rSep,
    rOct
  };
}

console.log('Running fast precomputed parameter search...');

const tpDists = [14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0];
const slDists = [10.0, 12.0, 13.0, 14.0, 15.0];
const rsiMaxs = [48, 50, 52, 54, 55];
const startHours = [0, 1, 2];
const endHours = [19, 20, 21, 22];

const winners = [];

for (const [bbKey] of bbMap.entries()) {
  for (const tpDist of tpDists) {
    for (const slDist of slDists) {
      for (const rsiMax of rsiMaxs) {
        for (const startH of startHours) {
          for (const endH of endHours) {
            for (const allowShort of [true, false]) {
              const res = evaluateStrategy(bbKey, tpDist, slDist, rsiMax, startH, endH, allowShort);
              if (!res) continue;

              if (res.winRate >= 80.0 && res.rAug >= 10.0 && res.rSep >= 10.0 && res.rOct >= 8.0) {
                winners.push(res);
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${winners.length} candidate configurations meeting ALL user requirements!\n`);

winners.sort((a, b) => (b.calmar * b.netR) - (a.calmar * a.netR));

for (let i = 0; i < Math.min(20, winners.length); i++) {
  const w = winners[i];
  console.log(`Rank #${i + 1}: BB(${w.bbKey}) | TP: $${w.tpDist} / SL: $${w.slDist} (R:R ${(w.tpDist / w.slDist).toFixed(2)}) | RSI<${w.rsiMax} | Hours ${w.startH}-${w.endH} | Short:${w.allowShort}`);
  console.log(`   Trades: ${w.totalTrades} | WR: ${w.winRate.toFixed(2)}% (${w.wins}W/${w.losses}L) | Net: +${w.netR.toFixed(2)}R | MaxDD: ${w.maxDD.toFixed(2)}R | Calmar: ${w.calmar.toFixed(2)}`);
  console.log(`   Monthly R: Aug=+${w.rAug.toFixed(2)}R, Sep=+${w.rSep.toFixed(2)}R, Oct=+${w.rOct.toFixed(2)}R\n`);
}
