import { Candle } from '../types/backtest';

/**
 * Exponential Moving Average
 */
export function calcEMA(candles: Candle[], length: number): number[] {
  const ema = new Array(candles.length).fill(NaN);
  if (candles.length < length) return ema;

  const k = 2 / (length + 1);
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += candles[i].close;
  }
  let prev = sum / length;
  ema[length - 1] = prev;

  for (let i = length; i < candles.length; i++) {
    const val = candles[i].close * k + prev * (1 - k);
    ema[i] = val;
    prev = val;
  }
  return ema;
}

/**
 * Simple Moving Average
 */
export function calcSMA(candles: Candle[], length: number): number[] {
  const sma = new Array(candles.length).fill(NaN);
  if (candles.length < length) return sma;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += candles[i].close;
  }
  sma[length - 1] = sum / length;

  for (let i = length; i < candles.length; i++) {
    sum += candles[i].close - candles[i - length].close;
    sma[i] = sum / length;
  }
  return sma;
}

/**
 * Average True Range
 */
export function calcATR(candles: Candle[], length: number = 14): number[] {
  const atr = new Array(candles.length).fill(NaN);
  if (candles.length < length) return atr;

  const tr = new Array(candles.length);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += tr[i];
  }
  atr[length - 1] = sum / length;

  for (let i = length; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (length - 1) + tr[i]) / length;
  }
  return atr;
}

/**
 * Relative Strength Index (Wilder's RSI matching Pine Script ta.rsi)
 */
export function calcRSI(candles: Candle[], length: number = 14): number[] {
  const rsi = new Array(candles.length).fill(NaN);
  if (candles.length <= length) return rsi;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  gain /= length;
  loss /= length;
  rsi[length] = 100 - (100 / (1 + (gain / (loss || 1e-10))));

  for (let i = length + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const curG = diff > 0 ? diff : 0;
    const curL = diff < 0 ? -diff : 0;
    gain = (gain * (length - 1) + curG) / length;
    loss = (loss * (length - 1) + curL) / length;
    rsi[i] = 100 - (100 / (1 + (gain / (loss || 1e-10))));
  }
  return rsi;
}

/**
 * Volatility / Standard Deviation Bands (matching Pine ta.stdev & ta.sma)
 */
export function calcVolatilityBands(
  candles: Candle[],
  length: number = 28,
  multiplier: number = 2.1
): { basis: number[]; upper: number[]; lower: number[] } {
  const basis = new Array(candles.length).fill(NaN);
  const upper = new Array(candles.length).fill(NaN);
  const lower = new Array(candles.length).fill(NaN);

  if (candles.length < length) return { basis, upper, lower };

  for (let i = length - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < length; j++) {
      sum += candles[i - j].close;
    }
    const avg = sum / length;
    basis[i] = avg;

    let varSum = 0;
    for (let j = 0; j < length; j++) {
      varSum += Math.pow(candles[i - j].close - avg, 2);
    }
    const dev = multiplier * Math.sqrt(varSum / length);
    upper[i] = avg + dev;
    lower[i] = avg - dev;
  }

  return { basis, upper, lower };
}

