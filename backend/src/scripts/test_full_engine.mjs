import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test complete strategy with clean persistent exit and position_size == 0
const fullCode = `//@version=6
strategy("Champion_5M_Sovereign_STRATEGY", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0,
         commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpPips = input.float(30.0, "Take Profit (Pips)")
swingLen = input.int(4, "Minor Swing Pivot")
majSwingLen = input.int(6, "Major Swing Pivot")
emaLen = input.int(50, "Trend EMA Filter")
atrMult = input.float(0.22, "FVG Protective SL Buffer")
beTriggerR = input.float(0.40, "Positive Breakeven Trigger (+R)")
lock1TriggerR = input.float(0.80, "Profit Lock 1 Trigger (+R)")
lock1ValR = input.float(0.60, "Lock 1 Secured Profit (+R)")
lock2TriggerR = input.float(1.40, "Runner Lock 2 Trigger (+R)")
lock2ValR = input.float(1.20, "Lock 2 Secured Profit (+R)")
cooldownBars = input.int(6, "Cooldown Duration (Bars)")

atr = ta.atr(14)
ema = ta.ema(close, emaLen)
tpDist = tpPips / 10.0

sH1 = ta.pivothigh(high, swingLen, swingLen)
sL1 = ta.pivotlow(low,  swingLen, swingLen)
sH2 = ta.pivothigh(high, majSwingLen, majSwingLen)
sL2 = ta.pivotlow(low,  majSwingLen, majSwingLen)

var float bsl = na
var float ssl = na
if not na(sH1)
    bsl := sH1
if not na(sH2)
    bsl := sH2
if not na(sL1)
    ssl := sL1
if not na(sL2)
    ssl := sL2

sslSweep = not na(ssl) and low < ssl and close > ssl
bslSweep = not na(bsl) and high > bsl and close < bsl

bFvg = low > high[2]
sFvg = high < low[2]
var float bfTop = na
var float bfBot = na
var int   bfBar = 0
var float sfTop = na
var float sfBot = na
var int   sfBar = 0

if bFvg
    bfTop := low
    bfBot := high[2]
    bfBar := bar_index
if sFvg
    sfTop := low[2]
    sfBot := high
    sfBar := bar_index

var bool lookLong = false
var bool lookShort = false
var int setupBar = 0
var int cooldownUntil = 0

isCooldown = bar_index < cooldownUntil

// Sweep triggers - ONLY when flat!
if sslSweep and close > ema and strategy.position_size == 0 and not isCooldown
    lookLong := true
    lookShort := false
    setupBar := bar_index

if bslSweep and close < ema and strategy.position_size == 0 and not isCooldown
    lookShort := true
    lookLong := false
    setupBar := bar_index

if lookLong and (bar_index - setupBar) > 25
    lookLong := false
if lookShort and (bar_index - setupBar) > 25
    lookShort := false

var float entryP = na
var float slP = na
var float tpP = na
var float initSL = na
var bool isBE = false
var bool isLock1 = false
var bool isLock2 = false
var int entryBar = 0

// Entry Evaluation - STRICTLY strategy.position_size == 0
if lookLong and strategy.position_size == 0 and not isCooldown and not na(bfTop) and bfBar > setupBar
    if low <= bfTop and close > bfBot
        e = close
        s = bfBot - atr * atrMult
        slDist = e - s
        if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
            entryP := e
            initSL := s
            slP := s
            tpP := e + tpDist
            isBE := false
            isLock1 := false
            isLock2 := false
            entryBar := bar_index
            lookLong := false
            strategy.entry("Long", strategy.long, comment="▶ LONG")

if lookShort and strategy.position_size == 0 and not isCooldown and not na(sfBot) and sfBar > setupBar
    if high >= sfBot and close < sfTop
        e = close
        s = sfTop + atr * atrMult
        slDist = s - e
        if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
            entryP := e
            initSL := s
            slP := s
            tpP := e - tpDist
            isBE := false
            isLock1 := false
            isLock2 := false
            entryBar := bar_index
            lookShort := false
            strategy.entry("Short", strategy.short, comment="▶ SHORT")

// Active Position Trailing and Persistent Orders
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    initDist = math.abs(entryP - initSL)
    gain = dir == 1 ? (high - entryP) : (entryP - low)

    // Tier 1: Positive Breakeven at +0.40R (+5 ticks profit guarantee in TV!)
    if not isBE and gain >= initDist * beTriggerR
        slP := dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        isBE := true

    // Tier 2: Lock 1 at +0.80R -> +0.60R
    if not isLock1 and gain >= initDist * lock1TriggerR
        slP := dir == 1 ? (entryP + initDist * lock1ValR) : (entryP - initDist * lock1ValR)
        isLock1 := true

    // Tier 3: Lock 2 at +1.40R -> +1.20R
    if not isLock2 and gain >= initDist * lock2TriggerR
        slP := dir == 1 ? (entryP + initDist * lock2ValR) : (entryP - initDist * lock2ValR)
        isLock2 := true

    // Timeout check (45 bars = 3.75 hours)
    if (bar_index - entryBar) >= 45
        strategy.close_all(comment="Timeout Exit")
    else
        exitComment = isLock2 ? "LOCK 2 WIN" : isLock1 ? "LOCK 1 WIN" : isBE ? "BREAKEVEN" : "SL HIT"
        if dir == 1
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=slP, comment_profit="TP HIT", comment_loss=exitComment)
        else
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=slP, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function run() {
  const p = new PineTS(c5, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(fullCode);
  const s = res.strategy;
  console.log('Complete Strategy Results:');
  console.log('Total closed:', s.closedtrades?.length);
  console.log('Wins:', s.wintrades);
  console.log('Losses:', s.losstrades);
  console.log('Even:', s.eventrades);
  console.log('Net Profit: +$' + s.netprofit?.toFixed(2));
  console.log('Max Drawdown %:', s.max_drawdown_percent_value);
  if (s.wintrades + s.losstrades > 0) {
    console.log('Win Rate:', ((s.wintrades / (s.wintrades + s.losstrades)) * 100).toFixed(1) + '%');
  }
}
run().catch(console.error);
