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
console.log(`Loaded 5M candles: ${c5.length}`);

function generatePine(swMaj, swMin, rr, atr, minHoldSec = 120) {
  return `//@version=6
indicator("DualPivot_SMC", overlay=true, max_boxes_count=350, max_lines_count=350, max_labels_count=350)
swMaj = ${swMaj}
swMin = ${swMin}
rr = ${rr}
atrMult = ${atr}
minHoldSec = ${minHoldSec}

atr = ta.atr(14)
sH1 = ta.pivothigh(high, swMaj, swMaj)
sL1 = ta.pivotlow(low, swMaj, swMaj)
sH2 = ta.pivothigh(high, swMin, swMin)
sL2 = ta.pivotlow(low, swMin, swMin)

var float[] bsl = array.new_float()
var float[] ssl = array.new_float()

if not na(sH1)
    array.push(bsl, sH1)
if not na(sH2)
    array.push(bsl, sH2)
while array.size(bsl) > 12
    array.shift(bsl)

if not na(sL1)
    array.push(ssl, sL1)
if not na(sL2)
    array.push(ssl, sL2)
while array.size(ssl) > 12
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
var int[] sigEntryTime = array.new_int()

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
            holdMs = time - array.get(sigEntryTime, i)
            done = false
            if age >= 80
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
                res = array.get(sigResult, i)
                if res == 1 or res == -1
                    mStr = str.tostring(year(time)) + "-" + (month(time) < 10 ? "0" : "") + str.tostring(month(time))
                    idx = array.indexof(monthKeys, mStr)
                    if idx == -1
                        array.push(monthKeys, mStr), array.push(mWins, 0), array.push(mLosses, 0), array.push(monthR, 0.0)
                        idx := array.size(monthKeys) - 1
                    if res == 1
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

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool lookL = false, var bool lookS = false
var int sBarL = 0, var int sBarS = 0
var float sSLL = 0.0, var float sSLS = 0.0

if array.size(ssl) > 0 and not hasOpen
    for i = 0 to array.size(ssl) - 1
        lvl = array.get(ssl, i)
        if low < lvl and close > lvl
            lookL := true, lookS := false, sBarL := bar_index, sSLL := low - atr * atrMult

if array.size(bsl) > 0 and not hasOpen
    for i = 0 to array.size(bsl) - 1
        lvl = array.get(bsl, i)
        if high > lvl and close < lvl
            lookS := true, lookL := false, sBarS := bar_index, sSLS := high + atr * atrMult

if lookL and not hasOpen
    if array.size(bfBar) > 0
        for i = array.size(bfBar) - 1 to 0
            if array.get(bfBar, i) > sBarL
                fT = array.get(bfT, i), fB = array.get(bfB, i)
                if low <= fT and close > fB
                    en = close, slD = en - sSLL
                    if slD > 0
                        tpD = slD * rr
                        if tpD >= 2.0 and tpD <= 4.2
                            array.push(sigDir, 1), array.push(sigEntry, en), array.push(sigSL, sSLL), array.push(sigTP, en + tpD)
                            array.push(sigResult, 0), array.push(sigBar, bar_index), array.push(sigRVal, rr), array.push(sigEntryTime, time)
                            lookL := false
                            break

if lookS and not hasOpen
    if array.size(sfBar) > 0
        for i = array.size(sfBar) - 1 to 0
            if array.get(sfBar, i) > sBarS
                fT = array.get(sfT, i), fB = array.get(sfB, i)
                if high >= fB and close < fT
                    en = close, slD = sSLS - en
                    if slD > 0
                        tpD = slD * rr
                        if tpD >= 2.0 and tpD <= 4.2
                            array.push(sigDir, -1), array.push(sigEntry, en), array.push(sigSL, sSLS), array.push(sigTP, en - tpD)
                            array.push(sigResult, 0), array.push(sigBar, bar_index), array.push(sigRVal, rr), array.push(sigEntryTime, time)
                            lookS := false
                            break
`;
}

async function run() {
  const champions = [];

  for (const swMaj of [6, 7, 8, 9, 10]) {
    for (const swMin of [3, 4, 5]) {
      for (const rr of [2.4, 2.6, 2.8, 3.0, 3.2]) {
        for (const atr of [0.35, 0.40, 0.42, 0.45]) {
          const pine = generatePine(swMaj, swMin, rr, atr, 120);
          try {
            const res = await runBacktestOnTimeframe(c5, '5', pine);
            if (res && res.closed >= 6) {
              const sep = res.sepR;
              const oct = res.octR;

              // Check if both months are >= 10R!
              if (sep >= 10.0 && oct >= 10.0 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 3.5) {
                console.log(`\n🎉 PERFECT HIT! Dual 10R Champion Found!`);
                console.log(`Maj:${swMaj} Min:${swMin} RR:${rr} ATR:${atr} -> Sep:+${sep}R Oct:+${octR}R Total:+${res.cumulativeR}R Calmar:${res.calmarRatio} MaxDD:-${res.maxDrawdown}R WR:${res.winRate}% Trades:${res.closed} TP:${res.avgTpPips}p`);
                champions.push({ swMaj, swMin, rr, atr, res, code: pine });
              } else if (sep >= 8.5 && oct >= 8.0 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 3.5) {
                console.log(`[NEAR HIT] Maj:${swMaj} Min:${swMin} RR:${rr} ATR:${atr} -> Sep:+${sep}R Oct:+${oct}R Total:+${res.cumulativeR}R Calmar:${res.calmarRatio} DD:-${res.maxDrawdown}R WR:${res.winRate}%`);
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  console.log(`\nScan finished. Total Dual 10R Champions: ${champions.length}`);
  if (champions.length > 0) {
    champions.sort((a, b) => b.res.calmarRatio - a.res.calmarRatio);
    const best = champions[0];
    const name = `Champion_M5_Dual10R_Calmar${best.res.calmarRatio}_PropPassed`;
    const fPath = path.join(PINE_DIR, `${name}.pine`);
    fs.writeFileSync(fPath, best.code.replace('indicator("DualPivot_SMC"', `indicator("${name}"`));
    console.log(`Saved champion pine script: ${fPath}`);
  }
}

run().catch(console.error);
