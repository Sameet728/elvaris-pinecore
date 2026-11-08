import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('monkalgo_strategies/data');

function loadCandles(filename) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

const nas = loadCandles('nas100_15m.json');
const spx = loadCandles('spx500_15m.json');
const xau = loadCandles('xauusd_15m.json');
const eur = loadCandles('eurusd_15m.json');

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
  for (let i = period; i < candles.length; i++) {
    emas[i] = candles[i].close * k + emas[i - 1] * (1 - k);
  }
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

// Strict TradingView bar-by-bar matching simulation
function simulateTradingView(candles, signals, tpR, beTriggerR, maxHold = 30) {
  let trades = 0, wins = 0, losses = 0, bes = 0, totalR = 0;
  let inTrade = false, active = null, lastExit = -999;
  let peak = 0, maxDD = 0, currentEq = 0;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];

    if (inTrade) {
      const t = active;
      const barsHeld = i - t.entryBar;
      let exitR = null;

      if (t.dir === 1) { // LONG
        const isGreen = c.close >= c.open;
        if (isGreen) {
          // Low occurs before High in standard green bar assumption
          if (c.low <= t.sl) {
            exitR = (t.sl - t.entry) / t.risk;
          } else {
            const gainR = (c.high - t.entry) / t.risk;
            if (gainR >= beTriggerR && !t.be) {
              t.sl = t.entry + t.risk * 0.05;
              t.be = true;
            }
            if (c.high >= t.tp) {
              exitR = tpR;
            }
          }
        } else {
          // High occurs before Low in standard red bar assumption
          const gainR = (c.high - t.entry) / t.risk;
          if (gainR >= beTriggerR && !t.be) {
            t.sl = t.entry + t.risk * 0.05;
            t.be = true;
          }
          if (c.high >= t.tp) {
            exitR = tpR;
          } else if (c.low <= t.sl) {
            exitR = (t.sl - t.entry) / t.risk;
          }
        }
      } else { // SHORT
        const isRed = c.close <= c.open;
        if (isRed) {
          // High occurs before Low in red bar
          if (c.high >= t.sl) {
            exitR = (t.entry - t.sl) / t.risk;
          } else {
            const gainR = (t.entry - c.low) / t.risk;
            if (gainR >= beTriggerR && !t.be) {
              t.sl = t.entry - t.risk * 0.05;
              t.be = true;
            }
            if (c.low <= t.tp) {
              exitR = tpR;
            }
          }
        } else {
          const gainR = (t.entry - c.low) / t.risk;
          if (gainR >= beTriggerR && !t.be) {
            t.sl = t.entry - t.risk * 0.05;
            t.be = true;
          }
          if (c.low <= t.tp) {
            exitR = tpR;
          } else if (c.high >= t.sl) {
            exitR = (t.entry - t.sl) / t.risk;
          }
        }
      }

      if (exitR === null && barsHeld >= maxHold) {
        exitR = t.dir === 1 ? (c.close - t.entry) / t.risk : (t.entry - c.close) / t.risk;
      }

      if (exitR !== null) {
        trades++;
        totalR += exitR;
        currentEq += exitR;
        if (currentEq > peak) peak = currentEq;
        if (peak - currentEq > maxDD) maxDD = peak - currentEq;

        if (exitR > 0.08) wins++;
        else if (exitR >= -0.05) bes++;
        else losses++;

        inTrade = false;
        active = null;
        lastExit = i;
        continue;
      }
    }

    if (!inTrade && signals[i] && i > lastExit + 2) {
      const sig = signals[i];
      const entry = c.close; // Filled on close of signal bar!
      const sl = sig.sl;
      const risk = Math.abs(entry - sl);
      if (risk > 0) {
        const tp = sig.dir === 1 ? entry + risk * tpR : entry - risk * tpR;
        inTrade = true;
        active = { dir: sig.dir, entry, sl, tp, risk, entryBar: i, be: false };
      }
    }
  }

  const wr = trades ? ((wins / trades) * 100).toFixed(1) : '0';
  const pf = losses > 0 ? (wins * tpR / losses).toFixed(2) : '99.0';
  return { trades, wins, losses, bes, wr: Number(wr), pf: Number(pf), netR: Number(totalR.toFixed(2)), maxDD: Number(maxDD.toFixed(2)) };
}

// Test #12 EASY MSS Sweep with Filter
function test12Signals(candles, emaPeriod = 50, requireVolume = true) {
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, emaPeriod);
  const signals = new Array(candles.length).fill(null);

  for (let i = 10; i < candles.length - 20; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    // Bullish MSS sweep: previous bar swept lowest low of last 5 bars, current bar closes strong above EMA50
    let minLow = Infinity;
    for (let k = i - 6; k < i - 1; k++) minLow = Math.min(minLow, candles[k].low);

    if (prev.low < minLow && c.close > c.open && c.close > emas[i] && (c.close - c.open) > atrs[i] * 0.3) {
      const sl = prev.low - atrs[i] * 0.2;
      signals[i] = { dir: 1, sl };
    }

    // Bearish MSS sweep
    let maxHigh = -Infinity;
    for (let k = i - 6; k < i - 1; k++) maxHigh = Math.max(maxHigh, candles[k].high);

    if (prev.high > maxHigh && c.close < c.open && c.close < emas[i] && (c.open - c.close) > atrs[i] * 0.3) {
      const sl = prev.high + atrs[i] * 0.2;
      signals[i] = { dir: -1, sl };
    }
  }
  return signals;
}

// Test #06 FVG with Trend and Body Filter
function test06Signals(candles, minFvgMult = 0.5) {
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const signals = new Array(candles.length).fill(null);

  for (let i = 3; i < candles.length - 20; i++) {
    const c0 = candles[i - 2], c1 = candles[i - 1], c2 = candles[i];

    // Bullish Gap + Trend Alignment + Strong Close
    if (c2.low - c0.high > atrs[i] * minFvgMult && c2.close > emas[i] && c2.close > c2.open) {
      const sl = c0.high - atrs[i] * 0.25;
      signals[i] = { dir: 1, sl };
    } else if (c0.low - c2.high > atrs[i] * minFvgMult && c2.close < emas[i] && c2.close < c2.open) {
      const sl = c0.low + atrs[i] * 0.25;
      signals[i] = { dir: -1, sl };
    }
  }
  return signals;
}

// Test #07 LIQUIDITY SWEEP (Session High/Low Sweep)
function test07Signals(candles) {
  const atrs = computeATR(candles, 14);
  const emas = computeEMA(candles, 50);
  const signals = new Array(candles.length).fill(null);

  for (let i = 20; i < candles.length - 20; i++) {
    // Look for false breakout: wick sweeps 20-bar high/low and closes back inside with strong rejection
    let h20 = -Infinity, l20 = Infinity;
    for (let k = i - 20; k < i; k++) {
      h20 = Math.max(h20, candles[k].high);
      l20 = Math.min(l20, candles[k].low);
    }
    const c = candles[i];
    // Bearish sweep of high
    if (c.high > h20 && c.close < h20 && (c.high - Math.max(c.open, c.close)) > atrs[i] * 0.4) {
      signals[i] = { dir: -1, sl: c.high + atrs[i] * 0.15 };
    }
    // Bullish sweep of low
    if (c.low < l20 && c.close > l20 && (Math.min(c.open, c.close) - c.low) > atrs[i] * 0.4) {
      signals[i] = { dir: 1, sl: c.low - atrs[i] * 0.15 };
    }
  }
  return signals;
}

console.log('=== STRICT TRADINGVIEW MATCHING BENCHMARK ===');
for (const [name, data] of Object.entries({ NAS100: nas, SPX500: spx, XAUUSD: xau, EURUSD: eur })) {
  console.log(`\n--- Asset: ${name} ---`);

  // Test 1: EASY MSS
  const sig12 = test12Signals(data);
  const res12 = simulateTradingView(data, sig12, 1.3, 0.7);
  console.log(`#12 EASY MSS Sweep: Trades: ${res12.trades}, WR: ${res12.wr}%, PF: ${res12.pf}, MaxDD: -${res12.maxDD}R, Net R: +${res12.netR}R`);

  // Test 2: FVG Trend
  const sig06 = test06Signals(data, 0.4);
  const res06 = simulateTradingView(data, sig06, 1.25, 0.7);
  console.log(`#06 FVG Trend:      Trades: ${res06.trades}, WR: ${res06.wr}%, PF: ${res06.pf}, MaxDD: -${res06.maxDD}R, Net R: +${res06.netR}R`);

  // Test 3: Liquidity Sweep
  const sig07 = test07Signals(data);
  const res07 = simulateTradingView(data, sig07, 1.3, 0.6);
  console.log(`#07 Liq Sweep:      Trades: ${res07.trades}, WR: ${res07.wr}%, PF: ${res07.pf}, MaxDD: -${res07.maxDD}R, Net R: +${res07.netR}R`);
}

