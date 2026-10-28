import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/btcusdt_15m_tv.json', 'utf8'));
const p = new PineTS(candles, 'BTCUSDT', '15');
await p.ready();

console.log('--- Testing BTC 15M for Dual-Month 10R+ (Sep >= 10R & Oct >= 10R) with 75-80% WR & Calmar > 4 ---');

const results = [];

// Grid search over sessions, BB params, SL, RR
for (const sStart of [0, 1, 6, 7, 8]) {
  for (const sEnd of [19, 20, 21, 22, 23]) {
    for (const bLen of [20, 24, 26, 28, 30]) {
      for (const bMult of [2.1, 2.2, 2.25, 2.3, 2.35, 2.4]) {
        for (const rsiF of [50, 52, 54, 55, 56]) {
          for (const wick of [0.0, 0.05, 0.10]) {
            for (const offset of [0, 25, 50]) {
              for (const sl of [250, 300, 350, 400]) {
                for (const rr of [1.5, 1.75, 2.0]) {
                  const tp = Math.round(sl * rr);
                  const wickStrLong = wick > 0 ? ` and (math.min(open, close) - low) >= (math.abs(close - open) * ${wick})` : '';
                  const wickStrShort = wick > 0 ? ` and (high - math.max(open, close)) >= (math.abs(close - open) * ${wick})` : '';

                  const code = `//@version=5
strategy("Dual10R", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bLen})
dev = ${bMult} * ta.stdev(close, ${bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)
utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${sStart} and utcHour <= ${sEnd})
longSig = inActiveSession and close > (ema200 + ${offset}) and low <= lower and close > open and rsi < ${rsiF}${wickStrLong} and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${rsiF})${wickStrShort} and strategy.position_size == 0
var float ep = na
var float currSL = na
var float tpP = na
if longSig
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)
if shortSig
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;
                  // Fast pre-filter in simulation or run in PineTS?
                  // To be fast, let's run in PineTS only if candidate passes
                }
              }
            }
          }
        }
      }
    }
  }
}
