import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

function getPine(emaLen, swMin, swMaj, tpPips, atrMult, beTrig, l1Trig, l1Val, coolBars) {
  return `//@version=6
strategy("Opt_5M", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

tpPips = ${tpPips.toFixed(1)}
swingLen = ${swMin}
majSwingLen = ${swMaj}
emaLen = ${emaLen}
atrMult = ${atrMult.toFixed(2)}

atr = ta.atr(14)
ema = ta.ema(close, emaLen)
tpDist = tpPips / 10.0

sH = ta.pivothigh(high, swingLen, swingLen)
sL = ta.pivotlow(low, swingLen, swingLen)
sH2 = ta.pivothigh(high, majSwingLen, majSwingLen)
sL2 = ta.pivotlow(low, majSwingLen, majSwingLen)

var float bsl = na
var float ssl = na
if not na(sH)
    bsl := sH
if not na(sH2)
    bsl := sH2
if not na(sL)
    ssl := sL
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
var int consecLosses = 0

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

// Entry
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

// Trailing Management
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    initDist = math.abs(entryP - initSL)
    gain = dir == 1 ? (high - entryP) : (entryP - low)

    // Positive Breakeven
    if not isBE and gain >= initDist * ${beTrig.toFixed(2)}
        slP := dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
        isBE := true

    // Lock 1
    if not isLock1 and gain >= initDist * ${l1Trig.toFixed(2)}
        slP := dir == 1 ? (entryP + initDist * ${l1Val.toFixed(2)}) : (entryP - initDist * ${l1Val.toFixed(2)})
        isLock1 := true

    // Lock 2
    if not isLock2 and gain >= initDist * 1.40
        slP := dir == 1 ? (entryP + initDist * 1.20) : (entryP - initDist * 1.20)
        isLock2 := true

    exitComment = isLock2 ? "LOCK 2 WIN" : isLock1 ? "LOCK 1 WIN" : isBE ? "BREAKEVEN" : "SL HIT"
    if dir == 1
        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=slP, comment_profit="TP HIT", comment_loss=exitComment)
    else
        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=slP, comment_profit="TP HIT", comment_loss=exitComment)
`;
}

async function main() {
  const p = new PineTS(c5, 'XAUUSD', '5');
  await p.ready();

  const results = [];
  const emas = [50, 100, 120];
  const swings = [[2, 4], [3, 5], [4, 6], [5, 10]];
  const tps = [25, 30, 35, 40];
  const atrs = [0.18, 0.22];
  const bes = [0.30, 0.35, 0.40];
  const locks = [
    { l1: 0.70, v1: 0.50 },
    { l1: 0.80, v1: 0.60 },
    { l1: 1.00, v1: 0.80 }
  ];

  console.log('Sweeping for >= 75% Win Rate configurations in PineTS...');

  for (const ema of emas) {
    for (const [sMin, sMaj] of swings) {
      for (const tp of tps) {
        for (const atr of atrs) {
          for (const be of bes) {
            for (const { l1, v1 } of locks) {
              const code = getPine(ema, sMin, sMaj, tp, atr, be, l1, v1, 6);
              const res = await p.run(code);
              const s = res.strategy;
              const w = s.wintrades || 0;
              const l = s.losstrades || 0;
              const tot = w + l;
              const wr = tot > 0 ? (w / tot * 100) : 0;
              if (wr >= 75.0 && tot >= 25) {
                const item = {
                  ema, sMin, sMaj, tp, atr, be, l1, v1,
                  tot, w, l, wr: wr.toFixed(1) + '%', profit: s.netprofit?.toFixed(2)
                };
                results.push(item);
                console.log('QUALIFIED:', item);
              }
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => parseFloat(b.wr) - parseFloat(a.wr));
  console.log('\nTop 5 Results:');
  console.log(results.slice(0, 5));
  fs.writeFileSync('data/top_pinets_champions.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
