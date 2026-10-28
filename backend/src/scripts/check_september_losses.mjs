import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function checkSepLosses() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("Candidate51", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)
atr = ta.atr(14)

inActiveSession = (hour >= 1 and hour <= 20)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 48 and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 14.0
    tpP := ep + 18.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 14.0
    tpP := ep - 18.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

  const res = await p.run(code);
  const trades = res.strategy.closedtrades || [];

  // Compute indicators manually to verify values on signal bars
  const n = candles.length;
  const closes = candles.map(c => c.close);
  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

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

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);

  const candleMap = new Map();
  for (let i = 0; i < n; i++) {
    candleMap.set(candles[i].openTime || candles[i].time, i);
  }

  console.log(`\n=== DETAILED ANALYSIS OF ALL 11 LOSSES ===`);
  for (const t of trades.filter(tr => tr.profit <= 0)) {
    const entryIdx = candleMap.get(t.entry_time);
    const sigIdx = entryIdx - 1;
    const d = new Date(t.entry_time);
    const rsiVal = rsi14[sigIdx];
    const cVal = closes[sigIdx];
    const e200Val = ema200[sigIdx];
    const e50Val = ema50[sigIdx];
    const dist200 = cVal - e200Val;
    const dist50 = cVal - e50Val;

    console.log(`${t.entry_id.padEnd(5)} | ${d.toISOString().substring(0, 16)} (H:${d.getUTCHours()}) | Close:$${cVal.toFixed(2)} | RSI:${rsiVal.toFixed(1)} | DistEMA200:$${dist200.toFixed(2)} | DistEMA50:$${dist50.toFixed(2)}`);
  }
}

checkSepLosses().catch(console.error);
