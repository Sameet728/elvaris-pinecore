import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

const testCode = (onlyLong, onlyShort, alignEMAs) => `//@version=6
strategy("Diagnostic", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0)

tpDist = 14.0
atr = ta.atr(14)
ema200 = ta.ema(close, 200)
ema50 = ta.ema(close, 50)
basis = ta.sma(close, 25)
dev = 2.0 * ta.stdev(close, 25)
upper = basis + dev
lower = basis - dev

${alignEMAs ? `
longCond = ${onlyShort ? 'false' : 'true'} and close > ema200 and ema50 > ema200 and low <= lower and close > open and strategy.position_size == 0
shortCond = ${onlyLong ? 'false' : 'true'} and close < ema200 and ema50 < ema200 and high >= upper and close < open and strategy.position_size == 0
` : `
longCond = ${onlyShort ? 'false' : 'true'} and close > ema200 and low <= lower and close > open and strategy.position_size == 0
shortCond = ${onlyLong ? 'false' : 'true'} and close < ema200 and high >= upper and close < open and strategy.position_size == 0
`}

var float ep = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    currSL := low - atr * 1.2
    tpP := ep + tpDist
    isBE := false
    strategy.entry("L", strategy.long)
    strategy.exit("XL", "L", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := high + atr * 1.2
    tpP := ep - tpDist
    isBE := false
    strategy.entry("S", strategy.short)
    strategy.exit("XS", "S", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(ep - (dir == 1 ? (ep - (tpDist/1.5)) : (ep + (tpDist/1.5))))
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    if not isBE and currentGain >= tpDist * 0.5
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true

    strategy.exit(dir == 1 ? "XL" : "XS", dir == 1 ? "L" : "S", limit=tpP, stop=currSL)
`;

async function test() {
  console.log('--- DIAGNOSTIC: LONG VS SHORT BREAKDOWN ---');
  for (const [name, l, s, ema] of [
    ['Both Directions (Base)', false, false, false],
    ['Longs Only', true, false, false],
    ['Shorts Only', false, true, false],
    ['Both Directions + EMA50/200 Trend Alignment', false, false, true],
    ['Longs Only + EMA50/200 Trend Alignment', true, false, true]
  ]) {
    const p = new PineTS(candles, 'XAUUSD', '60');
    await p.ready();
    const res = await p.run(testCode(l, s, ema));
    const st = res.strategy;
    const trades = st.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0);
    const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    console.log(`${name} -> Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${trades.length - wins.length} | WR: ${wr.toFixed(2)}% | Net: $${st.netprofit.toFixed(2)} | DD: $${st.max_drawdown?.toFixed(2)}`);
  }
}

test().catch(console.error);
