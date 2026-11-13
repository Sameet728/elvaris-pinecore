function calculateSMA(data, period) {
  const result = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result[i] = sum / period;
  }
  return result;
}

function calculateEMA(data, period) {
  const result = new Array(data.length).fill(NaN);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function calculateRMA(data, period) {
  const result = new Array(data.length).fill(NaN);
  const alpha = 1 / period;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  result[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * alpha + result[i - 1] * (1 - alpha);
  }
  return result;
}

function calculateATR(highs, lows, closes, period = 14) {
  const tr = new Array(closes.length).fill(NaN);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < closes.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  return calculateRMA(tr, period);
}

function calculateRSI(closes, period = 14) {
  const gains = new Array(closes.length).fill(0);
  const losses = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains[i] = diff;
    else losses[i] = -diff;
  }
  const avgGains = calculateRMA(gains, period);
  const avgLosses = calculateRMA(losses, period);
  const rsi = new Array(closes.length).fill(NaN);
  for (let i = period; i < closes.length; i++) {
    if (avgLosses[i] === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGains[i] / avgLosses[i];
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

function calculateBollingerBands(closes, period, mult) {
  const sma = calculateSMA(closes, period);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSquares = 0;
    for (let j = 0; j < period; j++) {
      const diff = closes[i - j] - sma[i];
      sumSquares += diff * diff;
    }
    const stdev = Math.sqrt(sumSquares / period);
    upper[i] = sma[i] + mult * stdev;
    lower[i] = sma[i] - mult * stdev;
  }
  return { sma, upper, lower };
}

console.log("Functions defined successfully.");

