import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

const code = `//@version=6
strategy("Champion_1H_Pure_Sovereign_STRATEGY", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpPips = 120.0
tpDist = tpPips / 10.0 // $12.00
atr = ta.atr(14)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 20)
dev = 2.0 * ta.stdev(close, 20)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

maxSLCap = 35.0
slAtrMult = 1.0
beTriggerR = 0.40

// Authentically confirmed bar close
longCond = close > ema200 and low <= lower and close > open and rsi < 50 and strategy.position_size == 0
shortCond = close < ema200 and high >= upper and close < open and rsi > 50 and strategy.position_size == 0

var float ep = na
var float initSL = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    rawSL = low - atr * slAtrMult
    slDist = ep - rawSL
    if slDist <= maxSLCap
        initSL := rawSL
        currSL := initSL
        tpP := ep + tpDist
        isBE := false
        strategy.entry("Long", strategy.long)
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    rawSL = high + atr * slAtrMult
    slDist = rawSL - ep
    if slDist <= maxSLCap
        initSL := rawSL
        currSL := initSL
        tpP := ep - tpDist
        isBE := false
        strategy.entry("Short", strategy.short)
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(ep - initSL)
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    if not isBE and currentGain >= slDistInit * beTriggerR
        targetBE = dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        if (dir == 1 and close > targetBE) or (dir == -1 and close < targetBE)
            currSL := targetBE
            isBE := true

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function verify() {
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  console.log('\n=== EXACT 1H CHAMPION VERIFICATION (10,568 CANDLES) ===');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${((wins.length / trades.length) * 100).toFixed(2)}%`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(2)}%)`);

  // Year & Month breakdown
  const monthly = {};
  trades.forEach(t => {
    const d = new Date(t.entry_time);
    const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthly[mKey] = (monthly[mKey] || 0) + t.profit;
  });
  console.log('\n--- MONTHLY BREAKDOWN ---');
  Object.keys(monthly).sort().forEach(k => {
    console.log(`${k}: $${monthly[k].toFixed(2)}`);
  });
}

verify().catch(console.error);
