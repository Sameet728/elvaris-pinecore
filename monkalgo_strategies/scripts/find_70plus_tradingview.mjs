import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');
const nas = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'nas100_15m.json'), 'utf8'));
const xau = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m.json'), 'utf8'));
const spx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'spx500_15m.json'), 'utf8'));

function computeATR(candles, period = 14) {
  const atrs = new Float64Array(candles.length);
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    atrs[i] = (atrs[i - 1] * (period - 1) + tr) / period;
  }
  return atrs;
}

function computeEMA(candles, period = 50) {
  const emas = new Float64Array(candles.length);
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += candles[i].close;
  emas[period - 1] = s / period;
  for (let i = period; i < candles.length; i++) emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
  return emas;
}

function computeRSI(candles, period = 14) {
  const rsi = new Float64Array(candles.length);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = 100 - (100 / (1 + (avgGain / (avgLoss || 1e-9))));
  }
  return rsi;
}

function backtestSignals(candles, signals, tpR, slMult) {
  let trades = 0, wins = 0, losses = 0, totalR = 0;
  let inTrade = false, active = null, lastExit = -999;
  let peak = 0, maxDD = 0, curEq = 0;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    if (inTrade) {
      const t = active;
      let exitR = null;
      if (t.dir === 1) {
        if (c.close >= c.open) {
          if (c.low <= t.sl) exitR = -1.0;
          else if (c.high >= t.tp) exitR = tpR;
        } else {
          if (c.high >= t.tp) exitR = tpR;
          else if (c.low <= t.sl) exitR = -1.0;
        }
      } else {
        if (c.close <= c.open) {
          if (c.high >= t.sl) exitR = -1.0;
          else if (c.low <= t.tp) exitR = tpR;
        } else {
          if (c.low <= t.tp) exitR = tpR;
          else if (c.high >= t.sl) exitR = -1.0;
        }
      }
      if (exitR === null && (i - t.entryBar >= 30)) {
        exitR = t.dir === 1 ? (c.close - t.entry) / t.risk : (t.entry - c.close) / t.risk;
      }
      if (exitR !== null) {
        trades++;
        totalR += exitR;
        curEq += exitR;
        if (curEq > peak) peak = curEq;
        if (peak - curEq > maxDD) maxDD = peak - curEq;
        if (exitR > 0) wins++; else losses++;
        inTrade = false;
        active = null;
        lastExit = i;
        continue;
      }
    }

    if (!inTrade && signals[i] && i > lastExit + 2) {
      const entry = c.close;
      const sl = signals[i].sl;
      const risk = Math.abs(entry - sl);
      if (risk > 0) {
        const tp = signals[i].dir === 1 ? entry + risk * tpR : entry - risk * tpR;
        inTrade = true;
        active = { dir: signals[i].dir, entry, sl, tp, risk, entryBar: i };
      }
    }
  }
  const wr = trades ? ((wins / trades) * 100).toFixed(1) : 0;
  const pf = losses > 0 ? (wins * tpR / losses).toFixed(2) : 99;
  return { trades, wins, losses, wr: Number(wr), pf: Number(pf), maxDD: Number(maxDD.toFixed(1)), netR: Number(totalR.toFixed(1)) };
}

// Search for 70%+ Win Rate across multiple concepts
const candidates = [];

for (const [assetName, data] of Object.entries({ NAS100: nas, XAUUSD: xau, SPX500: spx })) {
  const atrs = computeATR(data, 14);
  const ema50 = computeEMA(data, 50);
  const ema200 = computeEMA(data, 200);
  const rsi = computeRSI(data, 14);

  // Concept 1: Mean Reversion / Liquidity Sweep at RSI Extreme
  for (const rsiThresh of [25, 30, 35]) {
    for (const tpR of [0.6, 0.8, 1.0, 1.2]) {
      const sigs = new Array(data.length).fill(null);
      for (let i = 10; i < data.length - 20; i++) {
        const c = data[i], prev = data[i - 1];
        // Oversold bounce above EMA200
        if (rsi[i - 1] < rsiThresh && rsi[i] > rsiThresh && c.close > c.open && c.close > ema200[i]) {
          sigs[i] = { dir: 1, sl: Math.min(c.low, prev.low) - atrs[i] * 0.2 };
        } else if (rsi[i - 1] > (100 - rsiThresh) && rsi[i] < (100 - rsiThresh) && c.close < c.open && c.close < ema200[i]) {
          sigs[i] = { dir: -1, sl: Math.max(c.high, prev.high) + atrs[i] * 0.2 };
        }
      }
      const res = backtestSignals(data, sigs, tpR, 0.2);
      if (res.trades >= 25 && res.wr >= 68) {
        candidates.push({ asset: assetName, concept: `RSI_${rsiThresh}_Trend`, tpR, ...res });
      }
    }
  }

  // Concept 2: High-Displacement FVG + Trend
  for (const fvgMult of [0.5, 0.7, 0.9, 1.2]) {
    for (const tpR of [0.6, 0.8, 1.0]) {
      const sigs = new Array(data.length).fill(null);
      for (let i = 3; i < data.length - 20; i++) {
        const c0 = data[i - 2], c2 = data[i];
        if (c2.low - c0.high > atrs[i] * fvgMult && c2.close > ema50[i] && c2.close > ema200[i] && (c2.close - c2.open) > atrs[i] * 0.5) {
          sigs[i] = { dir: 1, sl: c0.high - atrs[i] * 0.15 };
        } else if (c0.low - c2.high > atrs[i] * fvgMult && c2.close < ema50[i] && c2.close < ema200[i] && (c2.open - c2.close) > atrs[i] * 0.5) {
          sigs[i] = { dir: -1, sl: c0.low + atrs[i] * 0.15 };
        }
      }
      const res = backtestSignals(data, sigs, tpR, 0.15);
      if (res.trades >= 25 && res.wr >= 68) {
        candidates.push({ asset: assetName, concept: `Displacement_FVG_${fvgMult}`, tpR, ...res });
      }
    }
  }

  // Concept 3: Institutional 3-Candle Swing Failure (Sweep & Reversal)
  for (const tpR of [0.6, 0.7, 0.8, 1.0]) {
    const sigs = new Array(data.length).fill(null);
    for (let i = 15; i < data.length - 20; i++) {
      let h15 = -Infinity, l15 = Infinity;
      for (let k = i - 15; k < i - 1; k++) {
        h15 = Math.max(h15, data[k].high);
        l15 = Math.min(l15, data[k].low);
      }
      const prev = data[i - 1], c = data[i];
      // Bullish sweep: prev bar wicked below l15, current bar closes firmly back above l15 and above prev high
      if (prev.low < l15 && c.close > l15 && c.close > prev.high && c.close > ema50[i]) {
        sigs[i] = { dir: 1, sl: prev.low - atrs[i] * 0.15 };
      } else if (prev.high > h15 && c.close < h15 && c.close < prev.low && c.close < ema50[i]) {
        sigs[i] = { dir: -1, sl: prev.high + atrs[i] * 0.15 };
      }
    }
    const res = backtestSignals(data, sigs, tpR, 0.15);
    if (res.trades >= 25 && res.wr >= 68) {
      candidates.push({ asset: assetName, concept: `SwingFailurePattern`, tpR, ...res });
    }
  }
}

candidates.sort((a, b) => b.wr - a.wr);
console.log('=== CANDIDATES ACHIEVING >= 68% WIN RATE IN TRADINGVIEW ===');
console.table(candidates.slice(0, 15));

