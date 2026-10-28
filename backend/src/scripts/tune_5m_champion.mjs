import fs from 'fs';
import { PineTS } from 'pinets';

const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test fine-tuning the 5M strategy
const codeTune5M = (tpPips, slPips, len, mult, rsiThresh, useBE, beGain) => `//@version=6
strategy("Champion_5M_Pure_Sovereign", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpDist = ${tpPips} / 10.0
slDist = ${slPips} / 10.0

ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${len})
dev = ${mult} * ta.stdev(close, ${len})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longCond = close > ema200 and low <= lower and rsi < ${rsiThresh} and strategy.position_size == 0
shortCond = close < ema200 and high >= upper and rsi > ${100 - rsiThresh} and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    currSL := close - slDist
    tpP := close + tpDist
    isBE := false
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := close + slDist
    tpP := close - tpDist
    isBE := false
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${useBE ? `
    if not isBE and currentGain >= ${beGain}
        currSL := dir == 1 ? (ep + syminfo.mintick * 5) : (ep - syminfo.mintick * 5)
        isBE := true
    ` : ''}

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function test() {
  console.log('--- TESTING 5M HIGH CONVICTION CANDIDATES ---');
  for (const tp of [20, 30, 40, 50]) {
    for (const sl of [15, 20]) {
      for (const len of [30, 50]) {
        for (const mult of [1.8, 2.0]) {
          for (const rsiThresh of [30, 35]) {
            for (const useBE of [false, true]) {
              const code = codeTune5M(tp, sl, len, mult, rsiThresh, useBE, 1.2);
              const p = new PineTS(candles5m, 'XAUUSD', '5');
              await p.ready();
              const res = await p.run(code);
              const s = res.strategy;
              const trades = s.closedtrades || [];
              if (trades.length < 15) continue;
              const wins = trades.filter(t => t.profit > 0);
              const wr = (wins.length / trades.length) * 100;
              if (s.netprofit > 20.0 && s.max_drawdown < 15.0) {
                const m = {};
                trades.forEach(t => {
                  const d = new Date(t.entry_time);
                  const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                  m[mKey] = (m[mKey] || 0) + t.profit;
                });
                let maxLoss = 0;
                trades.forEach(t => { if (t.profit < 0 && Math.abs(t.profit) > maxLoss) maxLoss = Math.abs(t.profit); });
                console.log(`5M TP:${tp}p SL:${sl}p len:${len} mult:${mult} rsi:${rsiThresh} BE:${useBE} -> Trades:${trades.length} | WR:${wr.toFixed(1)}% | Net:$${s.netprofit.toFixed(2)} | DD:$${s.max_drawdown?.toFixed(2)} | MaxLoss:-$${maxLoss.toFixed(2)} | Monthly:`, m);
              }
            }
          }
        }
      }
    }
  }
}

test().catch(console.error);
