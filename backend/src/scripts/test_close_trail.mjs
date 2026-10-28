import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

const testScript = `//@version=6
strategy("Champion_5M_Valid_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

tpPips = 35.0
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
            lookLong := false
            strategy.entry("Long", strategy.long)
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=math.min(s, low - syminfo.mintick))

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
            lookShort := false
            strategy.entry("Short", strategy.short)
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=math.max(s, high + syminfo.mintick))

// Trailing Management
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    initDist = math.abs(entryP - initSL)
    closeGain = dir == 1 ? (close - entryP) : (entryP - close)
    
    // Tier 1: Positive Breakeven ONLY when close is past BE
    if not isBE and closeGain >= initDist * 0.40
        newSL = dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        if (dir == 1 and close > newSL) or (dir == -1 and close < newSL)
            slP := newSL
            isBE := true
    
    // Tier 2: Lock 1 ONLY when close is past lock price
    if not isLock1 and closeGain >= initDist * 0.80
        newSL = dir == 1 ? (entryP + initDist * 0.60) : (entryP - initDist * 0.60)
        if (dir == 1 and close > newSL) or (dir == -1 and close < newSL)
            slP := newSL
            isLock1 := true
        
    // Tier 3: Lock 2 ONLY when close is past lock price
    if not isLock2 and closeGain >= initDist * 1.40
        newSL = dir == 1 ? (entryP + initDist * 1.20) : (entryP - initDist * 1.20)
        if (dir == 1 and close > newSL) or (dir == -1 and close < newSL)
            slP := newSL
            isLock2 := true

    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=slP)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=slP)
`;

async function run() {
  const p = new PineTS(c5, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(testScript);
  const s = res.strategy;
  console.log('Result with close-confirmed trailing:');
  console.log('Total trades:', s.closedtrades?.length);
  console.log('Wins:', s.wintrades);
  console.log('Losses:', s.losstrades);
  console.log('Even:', s.eventrades);
  console.log('Net Profit: +$' + s.netprofit?.toFixed(2));
  if (s.wintrades + s.losstrades > 0) {
    console.log('Win Rate:', ((s.wintrades / (s.wintrades + s.losstrades)) * 100).toFixed(1) + '%');
  }
}
run().catch(console.error);
