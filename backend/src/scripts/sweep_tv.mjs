import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

function getPine(tpPips, beTrig, lock1Trig, lock1Val) {
  return `//@version=6
strategy("Champion_5M_Precision_STRATEGY", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

tpPips = ${tpPips.toFixed(1)}
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
var int entryBar = 0

// Entry with entry-bar wick protection
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
            entryBar := bar_index
            lookLong := false
            strategy.entry("Long", strategy.long)
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=math.min(s, low - syminfo.mintick))

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
            entryBar := bar_index
            lookShort := false
            strategy.entry("Short", strategy.short)
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=math.max(s, high + syminfo.mintick))

// Trailing Management
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    initDist = math.abs(entryP - initSL)
    gain = dir == 1 ? (high - entryP) : (entryP - low)
    
    // Tier 1: Positive Breakeven (Secures +5 ticks profit, classified as WINNER in TV!)
    if not isBE and gain >= initDist * ${beTrig.toFixed(2)}
        slP := dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        isBE := true
    
    // Tier 2: Lock 1
    if not isLock1 and gain >= initDist * ${lock1Trig.toFixed(2)}
        slP := dir == 1 ? (entryP + initDist * ${lock1Val.toFixed(2)}) : (entryP - initDist * ${lock1Val.toFixed(2)})
        isLock1 := true
        
    // Tier 3: Lock 2 at +1.4R -> +1.2R
    if not isLock2 and gain >= initDist * 1.40
        slP := dir == 1 ? (entryP + initDist * 1.20) : (entryP - initDist * 1.20)
        isLock2 := true

    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=slP)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=slP)
`;
}

async function main() {
  const p = new PineTS(c5, 'XAUUSD', '5');
  await p.ready();

  const configs = [
    { tp: 25, be: 0.35, l1: 0.70, v1: 0.50 },
    { tp: 30, be: 0.35, l1: 0.75, v1: 0.55 },
    { tp: 30, be: 0.40, l1: 0.80, v1: 0.60 },
    { tp: 35, be: 0.35, l1: 0.80, v1: 0.60 },
    { tp: 35, be: 0.40, l1: 0.80, v1: 0.60 }
  ];

  for (const c of configs) {
    const code = getPine(c.tp, c.be, c.l1, c.v1);
    const res = await p.run(code);
    const s = res.strategy;
    const w = s.wintrades || 0;
    const l = s.losstrades || 0;
    const ev = s.eventrades || 0;
    const tot = w + l + ev;
    const wr = (w + l) > 0 ? (w / (w + l) * 100).toFixed(1) : '0';
    console.log(`TP ${c.tp}p | BE ${c.be}R | Lock ${c.l1}->${c.v1}R | Total: ${tot} | Wins: ${w} | Losses: ${l} | Even: ${ev} | WR: ${wr}% | Net: +$${s.netprofit?.toFixed(2)}`);
  }
}

main().catch(console.error);
