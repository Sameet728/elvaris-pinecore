import fs from 'fs';
import { PineTS } from 'pinets';

const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

function analyzeStrategy(res) {
  const s = res.strategy;
  const trades = s.closedtrades || [];
  if (trades.length === 0) return null;

  const wins = trades.filter(t => t.profit > 0);
  const wr = (wins.length / trades.length) * 100;
  
  const monthlyProfit = {};
  trades.forEach(t => {
    const d = new Date(t.entry_time);
    const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyProfit[mKey] = (monthlyProfit[mKey] || 0) + t.profit;
  });

  let maxLoss = 0;
  trades.forEach(t => {
    if (t.profit < 0 && Math.abs(t.profit) > maxLoss) maxLoss = Math.abs(t.profit);
  });

  return {
    trades: trades.length,
    wins: wins.length,
    losses: trades.length - wins.length,
    wr: wr.toFixed(1),
    net: s.netprofit.toFixed(2),
    dd: s.max_drawdown ? s.max_drawdown.toFixed(2) : 0,
    ddPct: (s.max_drawdown_percent_value * 100).toFixed(2),
    maxLoss: maxLoss.toFixed(2),
    monthly: monthlyProfit
  };
}

// 1. Mean Reversion + Trend Filter (Paradigm A)
const codeMeanReversion = (len, mult, rsiLen, rsiThresh, tpR, slPips) => `//@version=6
strategy("MeanReversion_5M", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${len})
dev = ${mult} * ta.stdev(close, ${len})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, ${rsiLen})

slDist = ${slPips} / 10.0
tpDist = slDist * ${tpR}

// Trend-aligned pullbacks:
// Buy when in uptrend (close > ema200) and price touches lower band with RSI oversold
longSig = close > ema200 and low <= lower and rsi < ${rsiThresh} and strategy.position_size == 0
// Short when in downtrend (close < ema200) and price touches upper band with RSI overbought
shortSig = close < ema200 and high >= upper and rsi > ${100 - rsiThresh} and strategy.position_size == 0

if longSig
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=close + tpDist, stop=close - slDist)

if shortSig
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=close - tpDist, stop=close + slDist)
`;

// 2. SuperTrend / Volatility Trend Following (Paradigm B)
const codeSuperTrend = (atrPeriod, factor, trailType) => `//@version=6
strategy("SuperTrend_5M", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
[st, dir] = ta.supertrend(${factor}, ${atrPeriod})

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)

longCond = ta.crossover(dir, 0) and close > ema200 and strategy.position_size == 0
shortCond = ta.crossunder(dir, 0) and close < ema200 and strategy.position_size == 0

var float entryP = na
var float slP = na

if longCond
    entryP := close
    slP := st
    strategy.entry("L", strategy.long)

if shortCond
    entryP := close
    slP := st
    strategy.entry("S", strategy.short)

if strategy.position_size > 0
    if ta.crossunder(dir, 0) or close < st
        strategy.close("L", comment="Exit L")

if strategy.position_size < 0
    if ta.crossover(dir, 0) or close > st
        strategy.close("S", comment="Exit S")
`;

// 3. ICT Market Structure Shift (MSS) + FVG (Paradigm C)
const codeMSS_FVG = (swLen, tpPips, maxSL) => `//@version=6
strategy("MSS_FVG", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
tpDist = ${tpPips} / 10.0
sH = ta.pivothigh(high, ${swLen}, ${swLen})
sL = ta.pivotlow(low, ${swLen}, ${swLen})

var float lastSH = na
var float lastSL = na
if not na(sH)
    lastSH := sH
if not na(sL)
    lastSL := sL

// MSS: Candle closes above recent swing high or below recent swing low
mssBull = not na(lastSH) and ta.crossover(close, lastSH)
mssBear = not na(lastSL) and ta.crossunder(close, lastSL)

bullFVG = low > high[2]
bearFVG = high < low[2]

var bool waitBullFVG = false
var bool waitBearFVG = false
var int mssBar = 0

if mssBull and strategy.position_size == 0
    waitBullFVG := true
    waitBearFVG := false
    mssBar := bar_index

if mssBear and strategy.position_size == 0
    waitBearFVG := true
    waitBullFVG := false
    mssBar := bar_index

if waitBullFVG and (bar_index - mssBar) > 20
    waitBullFVG := false
if waitBearFVG and (bar_index - mssBar) > 20
    waitBearFVG := false

atr = ta.atr(14)
var float ep = na
var float sl = na

if waitBullFVG and bullFVG and strategy.position_size == 0
    ep := close
    sl := high[2] - atr * 0.2
    slDist = ep - sl
    if slDist > 0.4 and slDist <= ${maxSL}
        strategy.entry("L", strategy.long)
        strategy.exit("XL", "L", limit=ep + tpDist, stop=sl)
        waitBullFVG := false

if waitBearFVG and bearFVG and strategy.position_size == 0
    ep := close
    sl := low[2] + atr * 0.2
    slDist = sl - ep
    if slDist > 0.4 and slDist <= ${maxSL}
        strategy.entry("S", strategy.short)
        strategy.exit("XS", "S", limit=ep - tpDist, stop=sl)
        waitBearFVG := false
`;

async function main() {
  console.log('Testing Paradigm A: Mean Reversion on 5M');
  for (const len of [20, 50]) {
    for (const mult of [2.0, 2.5]) {
      for (const rsiThresh of [30, 35]) {
        for (const tpR of [1.0, 1.5, 2.0]) {
          for (const slPips of [15, 20, 25]) {
            const code = codeMeanReversion(len, mult, 14, rsiThresh, tpR, slPips);
            const p = new PineTS(candles5m, 'XAUUSD', '5');
            await p.ready();
            const res = await p.run(code);
            const a = analyzeStrategy(res);
            if (a && a.trades >= 10 && parseFloat(a.net) > 5) {
              console.log(`[A] len:${len} mult:${mult} rsi:${rsiThresh} tpR:${tpR} sl:${slPips} -> Trades:${a.trades} WR:${a.wr}% Net:$${a.net} DD:$${a.dd} (${a.ddPct}%) MaxLoss:-$${a.maxLoss} Monthly:`, a.monthly);
            }
          }
        }
      }
    }
  }

  console.log('\nTesting Paradigm B: SuperTrend on 5M');
  for (const atrP of [10, 14, 20]) {
    for (const f of [2.0, 2.5, 3.0, 3.5]) {
      const code = codeSuperTrend(atrP, f, 'st');
      const p = new PineTS(candles5m, 'XAUUSD', '5');
      await p.ready();
      const res = await p.run(code);
      const a = analyzeStrategy(res);
      if (a && a.trades >= 10 && parseFloat(a.net) > 5) {
        console.log(`[B] atrP:${atrP} f:${f} -> Trades:${a.trades} WR:${a.wr}% Net:$${a.net} DD:$${a.dd} (${a.ddPct}%) Monthly:`, a.monthly);
      }
    }
  }

  console.log('\nTesting Paradigm C: MSS + FVG on 5M');
  for (const sw of [3, 5]) {
    for (const tp of [25, 35, 50, 80]) {
      for (const maxSL of [2.0, 2.5, 3.0]) {
        const code = codeMSS_FVG(sw, tp, maxSL);
        const p = new PineTS(candles5m, 'XAUUSD', '5');
        await p.ready();
        const res = await p.run(code);
        const a = analyzeStrategy(res);
        if (a && a.trades >= 10 && parseFloat(a.net) > 5) {
          console.log(`[C] sw:${sw} tp:${tp}p maxSL:$${maxSL} -> Trades:${a.trades} WR:${a.wr}% Net:$${a.net} DD:$${a.dd} (${a.ddPct}%) Monthly:`, a.monthly);
        }
      }
    }
  }
}

main().catch(console.error);
