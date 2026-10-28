import fs from 'fs';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const candles1m = JSON.parse(fs.readFileSync('data/xauusd_1m_tv.json', 'utf8'));

function makePine(sw, rr, dl, sess) {
  let sessStr = '((hour >= 7 and hour < 12) or (hour >= 13 and hour < 19))';
  if (sess === 'CORE_NY') sessStr = '(hour >= 13 and hour < 18)';
  if (sess === 'LONDON') sessStr = '(hour >= 7 and hour < 12)';
  if (sess === 'ALL') sessStr = 'true';

  return `//@version=6
indicator("Test_M1_DL", overlay=true)
swingLen = ${sw}
rrRatio = ${rr.toFixed(1)}
minTpPts = 2.4
maxTpPts = 3.8
atrMult = 0.42
expireBars = 45
maxTradesPerDay = ${dl}

var string[] monthKeys = array.new_string()
var int[] monthWins = array.new_int()
var int[] monthLosses = array.new_int()
var float[] monthR = array.new_float()
var float maxDrawdown = 0.0
var float peakR = 0.0
var float cumulativeR = 0.0

var int currentDay = -1
var int dailyTradeCount = 0

if dayofmonth != currentDay
    currentDay := dayofmonth
    dailyTradeCount := 0

canTradeToday = maxTradesPerDay <= 0 or dailyTradeCount < maxTradesPerDay
inSession = ${sessStr}

atr = ta.atr(14)
swingH = ta.pivothigh(high, swingLen, swingLen)
swingL = ta.pivotlow(low, swingLen, swingLen)

var float[] bslLvls = array.new_float()
var bool[] bslSwept = array.new_bool()
var float[] sslLvls = array.new_float()
var bool[] sslSwept = array.new_bool()

if not na(swingH)
    array.push(bslLvls, swingH)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 8
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(swingL)
    array.push(sslLvls, swingL)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 8
        array.shift(sslLvls)
        array.shift(sslSwept)

bullFVG = low > high[2]
bearFVG = high < low[2]
var float[] bFvgTop = array.new_float()
var float[] bFvgBot = array.new_float()
var int[] bFvgBar = array.new_int()
var float[] sFvgTop = array.new_float()
var float[] sFvgBot = array.new_float()
var int[] sFvgBar = array.new_int()

if bullFVG
    array.push(bFvgTop, low)
    array.push(bFvgBot, high[2])
    array.push(bFvgBar, bar_index)
if bearFVG
    array.push(sFvgTop, low[2])
    array.push(sFvgBot, high)
    array.push(sFvgBar, bar_index)

while array.size(bFvgTop) > 25
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 25
    array.shift(sFvgTop)
    array.shift(sFvgBot)
    array.shift(sFvgBar)

sslSweep = false
bslSweep = false
sweepLow = 0.0
sweepHigh = 0.0

if array.size(sslLvls) > 0
    for i = 0 to array.size(sslLvls) - 1
        if not array.get(sslSwept, i)
            lvl = array.get(sslLvls, i)
            if low < lvl and close > lvl
                array.set(sslSwept, i, true)
                sslSweep := true
                sweepLow := low

if array.size(bslLvls) > 0
    for i = 0 to array.size(bslLvls) - 1
        if not array.get(bslSwept, i)
            lvl = array.get(bslLvls, i)
            if high > lvl and close < lvl
                array.set(bslSwept, i, true)
                bslSweep := true
                sweepHigh := high

var int[] sigDir = array.new_int()
var float[] sigEntry = array.new_float()
var float[] sigSL = array.new_float()
var float[] sigTP = array.new_float()
var int[] sigResult = array.new_int()
var int[] sigBar = array.new_int()
var float[] sigRVal = array.new_float()

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d = array.get(sigDir, i)
            tp = array.get(sigTP, i)
            sl = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            resolved = false
            if age >= expireBars * 3
                array.set(sigResult, i, 2)
                resolved := true
            else if d == 1
                if high >= tp
                    array.set(sigResult, i, 1)
                    resolved := true
                else if low <= sl
                    array.set(sigResult, i, -1)
                    resolved := true
            else
                if low <= tp
                    array.set(sigResult, i, 1)
                    resolved := true
                else if high >= sl
                    array.set(sigResult, i, -1)
                    resolved := true
            if resolved
                int finalRes = array.get(sigResult, i)
                float rOutcome = array.get(sigRVal, i)
                if finalRes == 1 or finalRes == -1
                    string mStr = str.tostring(year(time)) + "-" + (month(time) < 10 ? "0" : "") + str.tostring(month(time))
                    int idx = array.indexof(monthKeys, mStr)
                    if idx == -1
                        array.push(monthKeys, mStr)
                        array.push(monthWins, 0)
                        array.push(monthLosses, 0)
                        array.push(monthR, 0.0)
                        idx := array.size(monthKeys) - 1
                    if finalRes == 1
                        array.set(monthWins, idx, array.get(monthWins, idx) + 1)
                        array.set(monthR, idx, array.get(monthR, idx) + rOutcome)
                        cumulativeR += rOutcome
                        if cumulativeR > peakR
                            peakR := cumulativeR
                    else if finalRes == -1
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1)
                        array.set(monthR, idx, array.get(monthR, idx) - 1.0)
                        cumulativeR -= 1.0
                        float dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool lookLong = false
var bool lookShort = false
var int setupBarL = 0
var int setupBarS = 0
var float setupSLL = 0.0
var float setupSLS = 0.0

if sslSweep and inSession and not hasOpen and canTradeToday
    lookLong := true
    lookShort := false
    setupBarL := bar_index
    setupSLL := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen and canTradeToday
    lookShort := true
    lookLong := false
    setupBarS := bar_index
    setupSLS := sweepHigh + atr * atrMult

if not inSession or not canTradeToday
    lookLong := false
    lookShort := false

if lookLong and (bar_index - setupBarL) > expireBars
    lookLong := false
if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

if lookLong and not hasOpen and canTradeToday
    nf = array.size(bFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(bFvgBar, i) > setupBarL
                fTop = array.get(bFvgTop, i)
                fBot = array.get(bFvgBot, i)
                if low <= fTop and close > fBot
                    entryP = close
                    slP = setupSLL
                    slDist = entryP - slP
                    if slDist > 0
                        tpP = entryP + slDist * rrRatio
                        tpDist = tpP - entryP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, rrRatio)
                            dailyTradeCount += 1
                            lookLong := false
                            break

if lookShort and not hasOpen and canTradeToday
    nf = array.size(sFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(sFvgBar, i) > setupBarS
                fTop = array.get(sFvgTop, i)
                fBot = array.get(sFvgBot, i)
                if high >= fBot and close < fTop
                    entryP = close
                    slP = setupSLS
                    slDist = slP - entryP
                    if slDist > 0
                        tpP = entryP - slDist * rrRatio
                        tpDist = entryP - tpP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, rrRatio)
                            dailyTradeCount += 1
                            lookShort := false
                            break
`;
}

async function runTest() {
  console.log('Testing 1M combinations with Daily Limits...');
  for (const sw of [6, 7, 8, 9, 10]) {
    for (const dl of [1, 2]) {
      for (const rr of [2.2, 2.4, 2.6]) {
        for (const sess of ['LON_NY', 'CORE_NY']) {
          const code = makePine(sw, rr, dl, sess);
          try {
            const res = await runBacktestOnTimeframe(candles1m, '1', code);
            if (res.closed >= 10 && res.maxDrawdown <= 4.0) {
              console.log(`[1M HIT] Sw${sw} RR${rr} DL${dl} ${sess} -> Closed: ${res.closed} | WR: ${res.winRate}% | Tot: +${res.cumulativeR}R (Sep: +${res.sepR}R, Oct: +${res.octR}R) | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | TP: ${res.avgTpPips.toFixed(1)}p`);
              if (res.sepR >= 8.0 && res.octR >= 8.0) {
                console.log(`🔥 [DUAL 8R+ ON 1M!] Sep: +${res.sepR}R, Oct: +${res.octR}R | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio}`);
              }
            }
          } catch(e) {}
        }
      }
    }
  }
}

runTest();
