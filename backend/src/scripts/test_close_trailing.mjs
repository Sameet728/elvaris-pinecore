import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test strategy where trailing / BE is triggered ONLY when a bar CLOSES in profit!
// This eliminates 100% of intrabar ambiguity!
const testCode = `//@version=6
strategy("CloseTrailing", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

tpPips = input.float(30.0, "Take Profit (Pips)")
swingLen = input.int(4, "Minor Swing Pivot")
majSwingLen = input.int(6, "Major Swing Pivot")
emaLen = input.int(50, "Trend EMA Filter")
atrMult = input.float(0.22, "FVG Protective SL Buffer")
beTriggerR = input.float(0.40, "Positive Breakeven Trigger on Close (+R)")
lock1TriggerR = input.float(0.80, "Profit Lock 1 Trigger on Close (+R)")
lock1ValR = input.float(0.60, "Lock 1 Secured Profit (+R)")
maxHoldBars = input.int(45, "Max Hold Bars")

atr = ta.atr(14)
ema = ta.ema(close, emaLen)
tpDist = tpPips / 10.0

sH1 = ta.pivothigh(high, swingLen, swingLen)
sL1 = ta.pivotlow(low,  swingLen, swingLen)
sH2 = ta.pivothigh(high, majSwingLen, majSwingLen)
sL2 = ta.pivotlow(low,  majSwingLen, majSwingLen)

var float[] bslLvls  = array.new_float()
var bool[]  bslSwept = array.new_bool()
var float[] sslLvls  = array.new_float()
var bool[]  sslSwept = array.new_bool()

if not na(sH1)
    array.push(bslLvls, sH1)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 20
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL1)
    array.push(sslLvls, sL1)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 20
        array.shift(sslLvls)
        array.shift(sslSwept)

if not na(sH2)
    array.push(bslLvls, sH2)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 20
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL2)
    array.push(sslLvls, sL2)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 20
        array.shift(sslLvls)
        array.shift(sslSwept)

sslSweep = false
bslSweep = false

if array.size(sslLvls) > 0
    for k = 0 to array.size(sslLvls) - 1
        if not array.get(sslSwept, k)
            lvl = array.get(sslLvls, k)
            if low < lvl and close > lvl
                array.set(sslSwept, k, true)
                sslSweep := true
                break

if array.size(bslLvls) > 0
    for k = 0 to array.size(bslLvls) - 1
        if not array.get(bslSwept, k)
            lvl = array.get(bslLvls, k)
            if high > lvl and close < lvl
                array.set(bslSwept, k, true)
                bslSweep := true
                break

bullFVG = low > high[2]
bearFVG = high < low[2]

var float[] bFvgTop = array.new_float()
var float[] bFvgBot = array.new_float()
var int[]   bFvgBar = array.new_int()

var float[] sFvgTop = array.new_float()
var float[] sFvgBot = array.new_float()
var int[]   sFvgBar = array.new_int()

if bullFVG
    array.push(bFvgTop, low)
    array.push(bFvgBot, high[2])
    array.push(bFvgBar, bar_index)
    if array.size(bFvgTop) > 10
        array.shift(bFvgTop)
        array.shift(bFvgBot)
        array.shift(bFvgBar)

if bearFVG
    array.push(sFvgTop, low[2])
    array.push(sFvgBot, high)
    array.push(sFvgBar, bar_index)
    if array.size(sFvgTop) > 10
        array.shift(sFvgTop)
        array.shift(sFvgBot)
        array.shift(sFvgBar)

var bool lookLong = false
var bool lookShort = false
var int setupBarL = 0
var int setupBarS = 0

if sslSweep and close > ema and strategy.position_size == 0
    lookLong := true
    lookShort := false
    setupBarL := bar_index

if bslSweep and close < ema and strategy.position_size == 0
    lookShort := true
    lookLong := false
    setupBarS := bar_index

if lookLong and (bar_index - setupBarL) > 25
    lookLong := false
if lookShort and (bar_index - setupBarS) > 25
    lookShort := false

var float entryP = na
var float initSL = na
var float currSL = na
var float tpP = na
var bool isBE = false
var bool isLock1 = false
var int entryBar = 0

// Entry Evaluation - STRICTLY strategy.position_size == 0
if lookLong and strategy.position_size == 0 and array.size(bFvgTop) > 0
    for f = array.size(bFvgTop) - 1 to 0
        if array.get(bFvgBar, f) > setupBarL
            fTop = array.get(bFvgTop, f)
            fBot = array.get(bFvgBot, f)
            if low <= fTop and close > fBot
                e = close
                s = fBot - atr * atrMult
                slDist = e - s
                if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
                    entryP := e
                    initSL := s
                    currSL := s
                    tpP := e + tpDist
                    isBE := false
                    isLock1 := false
                    entryBar := bar_index
                    lookLong := false
                    strategy.entry("Long", strategy.long, comment="▶ LONG")
                    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss="SL HIT")
                    break

if lookShort and strategy.position_size == 0 and array.size(sFvgTop) > 0
    for f = array.size(sFvgTop) - 1 to 0
        if array.get(sFvgBar, f) > setupBarS
            fTop = array.get(sFvgTop, f)
            fBot = array.get(sFvgBot, f)
            if high >= fBot and close < fTop
                e = close
                s = fTop + atr * atrMult
                slDist = s - e
                if slDist > 0.4 and slDist < math.max(2.0, tpDist / 1.5)
                    entryP := e
                    initSL := s
                    currSL := s
                    tpP := e - tpDist
                    isBE := false
                    isLock1 := false
                    entryBar := bar_index
                    lookShort := false
                    strategy.entry("Short", strategy.short, comment="▶ SHORT")
                    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss="SL HIT")
                    break

// Position Trailing based on CONFIRMED BAR CLOSE
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(entryP - initSL)
    // CRITICAL: Gain is evaluated on CLOSE to avoid intrabar wick false trails!
    closeGain = dir == 1 ? (close - entryP) : (entryP - close)

    // Positive Breakeven at +0.40R
    if not isBE and closeGain >= slDistInit * beTriggerR
        targetBE = dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        currSL := targetBE
        isBE := true

    // Profit Lock 1 at +0.80R -> Secure +0.60R
    if not isLock1 and closeGain >= slDistInit * lock1TriggerR
        targetLock = dir == 1 ? (entryP + slDistInit * lock1ValR) : (entryP - slDistInit * lock1ValR)
        currSL := targetLock
        isLock1 := true

    // Max hold timeout
    if (bar_index - entryBar) >= maxHoldBars
        strategy.close_all(comment="Timeout Exit")
    else
        exitComment = isLock1 ? "LOCK 1 WIN" : isBE ? "BREAKEVEN" : "SL HIT"
        if dir == 1
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
        else
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_loss=exitComment)
`;

async function run() {
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(testCode);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  console.log('--- CLOSE-BASED TRAILING RESULTS ---');
  console.log('Total Closed Trades:', trades.length);
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);
  console.log('Wins:', wins.length, 'Losses:', losses.length);
  console.log('Win Rate:', ((wins.length / trades.length) * 100).toFixed(1) + '%');
  console.log('Net Profit: $' + s.netprofit.toFixed(2));
  console.log('Max Drawdown %:', (s.max_drawdown_percent_value * 100).toFixed(3) + '%');
}
run().catch(console.error);
