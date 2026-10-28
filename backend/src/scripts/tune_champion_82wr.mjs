import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8'));
const n = candles.length;

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
const ema200 = computeEMA(closes, 200);
const rsi14 = computeRSI(closes, 14);

function testConfig(bbLen, bbMult, tpDist, slDist, rsiMax, startH, endH) {
  const bb = computeBB(closes, bbLen, bbMult);
  const trades = [];
  let inTrade = false;
  let entryBar = 0;
  let entryPrice = 0;
  let direction = 0;
  let currentSL = 0;
  let tpPrice = 0;

  for (let i = 200; i < n - 1; i++) {
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
        const profitR = pnl / slDist;
        trades.push({
          entryBar,
          month: months[entryBar],
          direction: dir === 1 ? 'LONG' : 'SHORT',
          pnl,
          profitR
        });
        inTrade = false;
      }
    }

    if (!inTrade) {
      const h = hours[i];
      if (h < startH || h > endH) continue;

      const trendLongOk = closes[i] > ema200[i];
      const trendShortOk = closes[i] < ema200[i] && ema50[i] < ema200[i];

      const longCond = trendLongOk && lows[i] <= bb.lower[i] && closes[i] > opens[i] && rsi14[i] < rsiMax;
      const shortCond = trendShortOk && highs[i] >= bb.upper[i] && closes[i] < opens[i] && rsi14[i] > (100 - rsiMax);

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

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const wr = (wins.length / trades.length) * 100;

  const monthlyR = {};
  const monthlyTrades = {};
  for (const t of trades) {
    monthlyR[t.month] = (monthlyR[t.month] || 0) + t.profitR;
    monthlyTrades[t.month] = (monthlyTrades[t.month] || 0) + 1;
  }

  let cumR = 0, peakR = 0, maxDD = 0;
  for (const t of trades) {
    cumR += t.profitR;
    if (cumR > peakR) peakR = cumR;
    if (peakR - cumR > maxDD) maxDD = peakR - cumR;
  }

  const calmar = maxDD > 0 ? (cumR / maxDD) : 99.0;

  return {
    bbLen, bbMult, tpDist, slDist, rsiMax, startH, endH,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: wr,
    netR: cumR,
    maxDD,
    calmar,
    monthlyR,
    monthlyTrades
  };
}

const list = [];
for (const tp of [14, 15, 16, 18, 20]) {
  for (const sl of [12, 13, 14, 15]) {
    if (tp / sl < 1.0) continue;
    for (const rsiMax of [48, 50, 52, 54]) {
      for (const startH of [1, 2, 3]) {
        for (const endH of [19, 20, 21]) {
          const r = testConfig(30, 2.2, tp, sl, rsiMax, startH, endH);
          if (r.winRate >= 80.0 && r.totalTrades >= 35) {
            list.push(r);
          }
        }
      }
    }
  }
}

list.sort((a, b) => b.winRate - a.winRate || b.calmar - a.calmar || b.netR - a.netR);

console.log(`Top 10 Ultra Champions on 15M (Win Rate >= 80%, Trades >= 35):`);
for (let i = 0; i < Math.min(10, list.length); i++) {
  const r = list[i];
  const rr = (r.tpDist / r.slDist).toFixed(2);
  console.log(`\n#${i + 1} | Win Rate: ${r.winRate.toFixed(2)}% (${r.wins}W / ${r.losses}L in ${r.totalTrades}T) | Net: +${r.netR.toFixed(2)}R | Max DD: ${r.maxDD.toFixed(2)}R | Calmar: ${r.calmar.toFixed(2)}`);
  console.log(`   TP: $${r.tpDist} / SL: $${r.slDist} (1 : ${rr}) | RSI: <${r.rsiMax} | Session: ${r.startH}:00 - ${r.endH}:00 UTC`);
  console.log(`   Monthly R:`, r.monthlyR);
  console.log(`   Monthly Trades:`, r.monthlyTrades);
}
