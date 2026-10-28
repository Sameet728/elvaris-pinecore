import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

const testScript = `//@version=6
strategy("Champion_5M_Precision_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

tpPips = input.float(30.0, "TP Pips")
swingLen = input.int(4, "Minor Swing")
majSwingLen = input.int(6, "Major Swing")
emaLen = input.int(50, "EMA")
atrMult = input.float(0.22, "ATR Mult")

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

if sslSweep and close > ema and strategy.position_size == 0
    lookLong := true
    lookShort := false
    setupBar := bar_index

if bslSweep and close < ema and strategy.position_size == 0
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

// Entry
if lookLong and strategy.position_size == 0 and not na(bfTop) and bfBar > setupBar
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
            entryBar := bar_index
            lookLong := false
            strategy.entry("Long", strategy.long)

if lookShort and strategy.position_size == 0 and not na(sfBot) and sfBar > setupBar
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
            entryBar := bar_index
            lookShort := false
            strategy.entry("Short", strategy.short)

// Trailing Management
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    initDist = math.abs(entryP - initSL)
    gain = dir == 1 ? (high - entryP) : (entryP - low)
    
    // Tier 1: Positive Breakeven at +0.4R (Guarantees +5 ticks profit, NEVER a loss!)
    if not isBE and gain >= initDist * 0.4
        slP := dir == 1 ? (entryP + syminfo.mintick * 10) : (entryP - syminfo.mintick * 10)
        isBE := true
    
    // Tier 2: Lock 1 at +0.8R -> locks in +0.6R
    if not isLock1 and gain >= initDist * 0.8
        slP := dir == 1 ? (entryP + initDist * 0.6) : (entryP - initDist * 0.6)
        isLock1 := true
        
    // Tier 3: Lock 2 at +1.4R -> locks in +1.2R
    if not isLock2 and gain >= initDist * 1.4
        slP := dir == 1 ? (entryP + initDist * 1.2) : (entryP - initDist * 1.2)
        isLock2 := true

    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=slP)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=slP)
`;

const p = new PineTS(c5, 'XAUUSD', '5');
await p.ready();
const res = await p.run(testScript);
const s = res.strategy;
console.log('Results:');
console.log('Total closed:', s.closedtrades?.length);
console.log('Wins:', s.wintrades);
console.log('Losses:', s.losstrades);
console.log('Even:', s.eventrades);
console.log('Net profit: +$' + s.netprofit?.toFixed(2));
if (s.wintrades + s.losstrades > 0) {
  console.log('Win Rate:', ((s.wintrades / (s.wintrades + s.losstrades)) * 100).toFixed(1) + '%');
}
