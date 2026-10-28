import fs from 'fs';
import { PineTS } from 'pinets';

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

// 1H Giant Target Strategy (120 - 200 pips)
// Uses swing breakout / pullbacks + EMA trend + ATR-based dynamic stops
const code1H = (tpPips, slMult, emaLen, rsiFilter) => `//@version=6
strategy("Pure1H_GiantTarget", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
tpDist = ${tpPips} / 10.0 // e.g. 150 pips = $15.00
atr = ta.atr(14)
ema = ta.ema(close, ${emaLen})
rsi = ta.rsi(close, 14)

sH = ta.pivothigh(high, 2, 2)
sL = ta.pivotlow(low, 2, 2)

var float lastH = na
var float lastL = na
if not na(sH)
    lastH := sH
if not na(sL)
    lastL := sL

// Trend continuation on 1H:
longCond = not na(lastH) and ta.crossover(close, lastH) and close > ema and rsi > 50 and strategy.position_size == 0
shortCond = not na(lastL) and ta.crossunder(close, lastL) and close < ema and rsi < 50 and strategy.position_size == 0

var float ep = na
var float sl = na

if longCond
    ep := close
    sl := close - atr * ${slMult}
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=close + tpDist, stop=sl)

if shortCond
    ep := close
    sl := close + atr * ${slMult}
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=close - tpDist, stop=sl)
`;

// 1H Mean Reversion / Channel Strategy (150-200 pips)
const code1H_Channel = (tpPips, slMult, len, mult) => `//@version=6
strategy("Pure1H_Channel", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
tpDist = ${tpPips} / 10.0
atr = ta.atr(14)
basis = ta.sma(close, ${len})
dev = ${mult} * ta.stdev(close, ${len})
upper = basis + dev
lower = basis - dev
ema200 = ta.ema(close, 200)

longCond = close > ema200 and low <= lower and close > open and strategy.position_size == 0
shortCond = close < ema200 and high >= upper and close < open and strategy.position_size == 0

var float ep = na
var float sl = na

if longCond
    ep := close
    sl := low - atr * ${slMult}
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=close + tpDist, stop=sl)

if shortCond
    ep := close
    sl := high + atr * ${slMult}
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=close - tpDist, stop=sl)
`;

async function main() {
  console.log('=== EXPLORING 1H CANDLES (522 BARS, ~1 MONTH) ===');
  
  for (const tp of [100, 120, 150, 200]) {
    for (const slMult of [1.0, 1.5, 2.0]) {
      for (const ema of [50, 100]) {
        const code = code1H(tp, slMult, ema, true);
        const p = new PineTS(candles1h, 'XAUUSD', '60');
        await p.ready();
        const res = await p.run(code);
        const a = analyzeStrategy(res);
        if (a && parseFloat(a.net) > 0) {
          console.log(`[1H Trend] tp:${tp}p slM:${slMult} ema:${ema} -> Trades:${a.trades} WR:${a.wr}% Net:$${a.net} DD:$${a.dd} (${a.ddPct}%) Monthly:`, a.monthly);
        }
      }
    }
  }

  for (const tp of [100, 120, 150, 200]) {
    for (const slMult of [0.5, 1.0, 1.5]) {
      for (const len of [20, 30]) {
        for (const mult of [1.5, 2.0]) {
          const code = code1H_Channel(tp, slMult, len, mult);
          const p = new PineTS(candles1h, 'XAUUSD', '60');
          await p.ready();
          const res = await p.run(code);
          const a = analyzeStrategy(res);
          if (a && parseFloat(a.net) > 0) {
            console.log(`[1H Channel] tp:${tp}p slM:${slMult} len:${len} mult:${mult} -> Trades:${a.trades} WR:${a.wr}% Net:$${a.net} DD:$${a.dd} (${a.ddPct}%) Monthly:`, a.monthly);
          }
        }
      }
    }
  }
}

main().catch(console.error);
