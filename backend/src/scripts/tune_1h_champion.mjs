import fs from 'fs';
import { PineTS } from 'pinets';

const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Test fine-tuning the 1H strategy with UI and risk mechanics
const codeTune1H = (tpPips, slMult, len, mult, useBE, beR) => `//@version=6
strategy("Champion_1H_Pure_Sovereign", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpDist = ${tpPips} / 10.0
atr = ta.atr(14)
basis = ta.sma(close, ${len})
dev = ${mult} * ta.stdev(close, ${len})
upper = basis + dev
lower = basis - dev
ema200 = ta.ema(close, 200)

// Trend-aligned mean reversion / volatility boundary bounce
longCond = close > ema200 and low <= lower and close > open and strategy.position_size == 0
shortCond = close < ema200 and high >= upper and close < open and strategy.position_size == 0

var float ep = na
var float initSL = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    initSL := low - atr * ${slMult}
    currSL := initSL
    tpP := ep + tpDist
    isBE := false
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    initSL := high + atr * ${slMult}
    currSL := initSL
    tpP := ep - tpDist
    isBE := false
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(ep - initSL)
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${useBE ? `
    if not isBE and currentGain >= slDistInit * ${beR}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function test() {
  console.log('--- TUNING 1H SOVEREIGN STRATEGY ---');
  for (const tp of [100, 120, 140, 150]) {
    for (const slMult of [1.0, 1.2, 1.5]) {
      for (const len of [20, 25, 30]) {
        for (const mult of [1.8, 2.0, 2.2]) {
          for (const useBE of [false, true]) {
            const code = codeTune1H(tp, slMult, len, mult, useBE, 0.5);
            const p = new PineTS(candles1h, 'XAUUSD', '60');
            await p.ready();
            const res = await p.run(code);
            const s = res.strategy;
            const trades = s.closedtrades || [];
            if (trades.length < 10) continue;
            const wins = trades.filter(t => t.profit > 0);
            const wr = (wins.length / trades.length) * 100;
            if (wr >= 75.0 && s.netprofit > 50.0) {
              const m = {};
              trades.forEach(t => {
                const d = new Date(t.entry_time);
                const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
                m[mKey] = (m[mKey] || 0) + t.profit;
              });
              let maxLoss = 0;
              trades.forEach(t => { if (t.profit < 0 && Math.abs(t.profit) > maxLoss) maxLoss = Math.abs(t.profit); });
              console.log(`TP:${tp}p SL:${slMult} len:${len} mult:${mult} BE:${useBE} -> Trades:${trades.length} | WR:${wr.toFixed(1)}% | Net:$${s.netprofit.toFixed(2)} | DD:$${s.max_drawdown?.toFixed(2)} | MaxLoss:-$${maxLoss.toFixed(2)} | Monthly:`, m);
            }
          }
        }
      }
    }
  }
}

test().catch(console.error);
