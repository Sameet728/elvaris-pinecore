import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function inspectFeatures() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const code = `//@version=5
strategy("Inspect", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.2 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)
atr = ta.atr(14)
[diplus, diminus, adx] = ta.dmi(14, 14)

inActiveSession = (hour >= 1 and hour <= 20)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > 48 and strategy.position_size == 0

// Debug plots
plot(rsi, "RSI")
plot(atr, "ATR")
plot(adx, "ADX")
plot(ema50 - ema200, "EMA_Spread")
plot(close - ema200, "Dist_EMA200")

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

  const candleMap = new Map();
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    candleMap.set(c.openTime || c.time, i);
  }

  const rsiArr = res.plots['RSI'];
  const atrArr = res.plots['ATR'];
  const adxArr = res.plots['ADX'];
  const emaSpreadArr = res.plots['EMA_Spread'];
  const distEma200Arr = res.plots['Dist_EMA200'];

  console.log(`\n--- ALL 10 LOSSES WITH INDICATORS ---`);
  for (const t of trades.filter(tr => tr.profit <= 0)) {
    const idx = candleMap.get(t.entry_time) - 1;
    const d = new Date(t.entry_time);
    console.log(`LOSS: ${t.entry_id.padEnd(5)} | ${d.toISOString().substring(0, 16)} | RSI:${rsiArr[idx]?.toFixed(1)} | ATR:${atrArr[idx]?.toFixed(2)} | ADX:${adxArr[idx]?.toFixed(1)} | EmaSpread:${emaSpreadArr[idx]?.toFixed(1)} | DistEma200:${distEma200Arr[idx]?.toFixed(1)}`);
  }

  console.log(`\n--- SAMPLE 10 WINS WITH INDICATORS ---`);
  for (const t of trades.filter(tr => tr.profit > 0).slice(0, 10)) {
    const idx = candleMap.get(t.entry_time) - 1;
    const d = new Date(t.entry_time);
    console.log(`WIN : ${t.entry_id.padEnd(5)} | ${d.toISOString().substring(0, 16)} | RSI:${rsiArr[idx]?.toFixed(1)} | ATR:${atrArr[idx]?.toFixed(2)} | ADX:${adxArr[idx]?.toFixed(1)} | EmaSpread:${emaSpreadArr[idx]?.toFixed(1)} | DistEma200:${distEma200Arr[idx]?.toFixed(1)}`);
  }
}

inspectFeatures().catch(console.error);
