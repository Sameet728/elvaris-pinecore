import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
console.log(`Loaded ${c5.length} authentic 5M candles.`);

function buildPine(sw, rr, atr, exp, minHoldSec = 120) {
  return `//@version=6
indicator("Scan_Dual10R", overlay=true)
swingLen = ${sw}
rr = ${rr}
atrMult = ${atr}
expireBars = ${exp}
minHoldSec = ${minHoldSec}

atr = ta.atr(14)
sH = ta.pivothigh(high, swingLen, swingLen)
sL = ta.pivotlow(low, swingLen, swingLen)
var float[] bsl = array.new_float()
var float[] ssl = array.new_float()
if not na(sH)
    array.push(bsl, sH)
    if array.size(bsl) > 10
        array.shift(bsl)
if not na(sL)
    array.push(ssl, sL)
    if array.size(ssl) > 10
        array.shift(ssl)

bF = low > high[2]
sF = high < low[2]
var float[] bfT = array.new_float()
var float[] bfB = array.new_float()
var int[] bfBar = array.new_int()
var float[] sfT = array.new_float()
var float[] sfB = array.new_float()
var int[] sfBar = array.new_int()

if bF
    array.push(bfT, low), array.push(bfB, high[2]), array.push(bfBar, bar_index)
if sF
    array.push(sfT, low[2]), array.push(sfB, high), array.push(sfBar, bar_index)
while array.size(bfT) > 30
    array.shift(bfT), array.shift(bfB), array.shift(bfBar)
while array.size(sfT) > 30
    array.shift(sfT), array.shift(sfB), array.shift(sfBar)

var int[] sigDir = array.new_int()
var float[] sigEntry = array.new_float()
var float[] sigSL = array.new_float()
var float[] sigTP = array.new_float()
var int[] sigResult = array.new_int()
var int[] sigBar = array.new_int()
var float[] sigRVal = array.new_float()
var int[] sigTime = array.new_int()

var string[] monthKeys = array.new_string()
var int[] monthWins = array.new_int()
var int[] monthLosses = array.new_int()
var float[] monthR = array.new_float()
var float cumulativeR = 0.0
var float peakR = 0.0
var float maxDrawdown = 0.0

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d = array.get(sigDir, i), tp = array.get(sigTP, i), sl = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            holdMs = time - array.get(sigTime, i)
            done = false
            if age >= expireBars * 3
                array.set(sigResult, i, 2), done := true
            else if holdMs >= minHoldSec * 1000
                if d == 1
                    if high >= tp
                        array.set(sigResult, i, 1), done := true
                    else if low <= sl
                        array.set(sigResult, i, -1), done := true
                else
                    if low <= tp
                        array.set(sigResult, i, 1), done := true
                    else if high >= sl
                        array.set(sigResult, i, -1), done := true
            if done
                rRes = array.get(sigResult, i)
                if rRes == 1 or rRes == -1
                    mStr = str.tostring(year(time)) + "-" + (month(time) < 10 ? "0" : "") + str.tostring(month(time))
                    idx = array.indexof(monthKeys, mStr)
                    if idx == -1
                        array.push(monthKeys, mStr), array.push(mWins, 0), array.push(mLosses, 0), array.push(monthR, 0.0)
                        idx := array.size(monthKeys) - 1
                    if rRes == 1
                        array.set(mWins, idx, array.get(mWins, idx) + 1), array.set(monthR, idx, array.get(monthR, idx) + rr)
                        cumulativeR += rr
                        if cumulativeR > peakR
                            peakR := cumulativeR
                    else
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1), array.set(monthR, idx, array.get(monthR, idx) - 1.0)
                        cumulativeR -= 1.0
                        dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd

hasOp = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOp := true

var bool lLong = false
var bool lShort = false
var int sbL = 0
var int sbS = 0
var float slL = 0.0
var float slS = 0.0

if array.size(ssl) > 0 and not hasOp
    for i = 0 to array.size(ssl) - 1
        lvl = array.get(ssl, i)
        if low < lvl and close > lvl
            lLong := true, lShort := false, sbL := bar_index, slL := low - atr * atrMult

if array.size(bsl) > 0 and not hasOp
    for i = 0 to array.size(bsl) - 1
        lvl = array.get(bsl, i)
        if high > lvl and close < lvl
            lShort := true, lLong := false, sbS := bar_index, slS := high + atr * atrMult

if lLong and not hasOp
    if array.size(bfBar) > 0
        for i = array.size(bfBar) - 1 to 0
            if array.get(bfBar, i) > sbL
                fT = array.get(bfT, i), fB = array.get(bfB, i)
                if low <= fT and close > fB
                    en = close, slD = en - slL
                    if slD > 0
                        tpD = slD * rr
                        if tpD >= 2.0 and tpD <= 4.2
                            array.push(sigDir, 1), array.push(sigEntry, en), array.push(sigSL, slL), array.push(sigTP, en + tpD)
                            array.push(sigResult, 0), array.push(sigBar, bar_index), array.push(sigRVal, rr), array.push(sigTime, time)
                            lLong := false
                            break
if lShort and not hasOp
    if array.size(sfBar) > 0
        for i = array.size(sfBar) - 1 to 0
            if array.get(sfBar, i) > sbS
                fT = array.get(sfT, i), fB = array.get(sfB, i)
                if high >= fB and close < fT
                    en = close, slD = slS - en
                    if slD > 0
                        tpD = slD * rr
                        if tpD >= 2.0 and tpD <= 4.2
                            array.push(sigDir, -1), array.push(sigEntry, en), array.push(sigSL, slS), array.push(sigTP, en - tpD)
                            array.push(sigResult, 0), array.push(sigBar, bar_index), array.push(sigRVal, rr), array.push(sigTime, time)
                            lShort := false
                            break
`;
}

async function scan() {
  const all = [];

  for (const sw of [2, 3, 4, 5, 6, 7]) {
    for (const rr of [2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.5]) {
      for (const atr of [0.30, 0.35, 0.40, 0.45]) {
        for (const exp of [25, 35, 45]) {
          const pine = buildPine(sw, rr, atr, exp, 120);
          try {
            const res = await runBacktestOnTimeframe(c5, '5', pine);
            if (res && res.closed >= 5) {
              const sep = res.sepR;
              const oct = res.octR;
              all.push({ sw, rr, atr, exp, sep, oct, total: res.cumulativeR, calmar: res.calmarRatio, dd: res.maxDrawdown, wr: res.winRate, trades: res.closed, tp: res.avgTpPips });
              if (sep >= 9.5 && oct >= 9.5) {
                console.log(`🎯 TARGET HIT: Sw:${sw} RR:${rr} ATR:${atr} Exp:${exp} -> Sep:+${sep}R Oct:+${oct}R Calmar:${res.calmarRatio} DD:-${res.maxDrawdown}R WR:${res.winRate}%`);
              }
            }
          } catch(e) {}
        }
      }
    }
  }

  all.sort((a, b) => (Math.min(b.sep, b.oct) - Math.min(a.sep, a.oct)) || (b.total - a.total));
  console.log('\n=== TOP 10 BALANCED DUAL-MONTH STRATEGIES ===');
  all.slice(0, 10).forEach(x => console.log(' ->', JSON.stringify(x)));

  all.sort((a, b) => b.oct - a.oct);
  console.log('\n=== TOP 5 HIGHEST OCTOBER STRATEGIES ===');
  all.slice(0, 5).forEach(x => console.log(' ->', JSON.stringify(x)));
}

scan().catch(console.error);
