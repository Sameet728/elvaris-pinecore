import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test clean native orders in PineTS:
const cleanStrategy = `//@version=6
strategy("Champion_5M_Precision_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

tpPips = 30.0
swingLen = 4
majSwingLen = 6
emaLen = 50
atrMult = 0.22

atr = ta.atr(14)
ema = ta.ema(close, emaLen)
tpDist = tpPips / 10.0

sH = ta.pivothigh(high, swingLen, swingLen)
sL = ta.pivotlow(low, swingLen, swingLen)
var float bsl = na
var float ssl = na
if not na(sH)
    bsl := sH
if not na(sL)
    ssl := sL

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

// Entry (Only when position_size == 0 to prevent accidental market flips)
if lookLong and strategy.position_size == 0 and not isCooldown and not na(bfTop) and bfBar > setupBar
    if low <= bfTop and close > bfBot
        e = close
        s = bfBot - atr * atrMult
        if (e - s) > 0.4 and (e - s) < 2.5
            entryP := e
            initSL := s
            slP := s
            tpP := e + tpDist
            isBE := false
            isLock1 := false
            isLock2 := false
            lookLong := false
            strategy.entry("Long", strategy.long)

if lookShort and strategy.position_size == 0 and not isCooldown and not na(sfBot) and sfBar > setupBar
    if high >= sfBot and close < sfTop
        e = close
        s = sfTop + atr * atrMult
        if (s - e) > 0.4 and (s - e) < 2.5
            entryP := e
            initSL := s
            slP := s
            tpP := e - tpDist
            isBE := false
            isLock1 := false
            isLock2 := false
            lookShort := false
            strategy.entry("Short", strategy.short)

// Active Position Management on EVERY bar
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    initDist = math.abs(entryP - initSL)
    gain = dir == 1 ? (high - entryP) : (entryP - low)

    // Tier 1: Positive Breakeven at +0.35R
    if not isBE and gain >= initDist * 0.35
        slP := dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        isBE := true

    // Tier 2: Lock 1 at +0.80R -> +0.60R
    if not isLock1 and gain >= initDist * 0.80
        slP := dir == 1 ? (entryP + initDist * 0.60) : (entryP - initDist * 0.60)
        isLock1 := true

    // Tier 3: Lock 2 at +1.40R -> +1.20R
    if not isLock2 and gain >= initDist * 1.40
        slP := dir == 1 ? (entryP + initDist * 1.20) : (entryP - initDist * 1.20)
        isLock2 := true

    // Call exit on every bar so bracket stop is always up to date
    exitComment = isLock2 ? "LOCK 2 WIN" : isLock1 ? "LOCK 1 WIN" : isBE ? "BREAKEVEN" : "SL HIT"
    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=slP, comment_profit="TP HIT", comment_loss=exitComment)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=slP, comment_profit="TP HIT", comment_loss=exitComment)
`;

const p = new PineTS(c5, 'XAUUSD', '5');
await p.ready();
const res = await p.run(cleanStrategy);
const s = res.strategy;
console.log('Clean Strategy Results:');
console.log('Total closed:', s.closedtrades?.length);
console.log('Wins:', s.wintrades);
console.log('Losses:', s.losstrades);
console.log('Even:', s.eventrades);
console.log('Net Profit: +$' + s.netprofit?.toFixed(2));
console.log('Max Drawdown %:', s.max_drawdown_percent_value);
if (s.wintrades + s.losstrades > 0) {
  console.log('Win Rate:', ((s.wintrades / (s.wintrades + s.losstrades)) * 100).toFixed(1) + '%');
}
