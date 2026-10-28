import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeATR, simulateDualPivot } from './fast_evaluator.mjs';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');
const LEADERBOARD_JSON = path.join(DATA_DIR, 'strategy_leaderboard.json');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const atr14 = computeATR(c5, 14);

console.log(`Starting Fast Dual 10R Optimizer across 5520 bars...`);

const swMinVals = [2, 3, 4, 5];
const swMajVals = [5, 6, 7, 8, 9, 10, 11, 12];
const rrVals = [2.6, 2.7, 2.8, 2.9, 3.0, 3.1, 3.2, 3.3];
const atrMultVals = [0.35, 0.38, 0.40, 0.42, 0.45, 0.48, 0.50];
const expireVals = [25, 30, 35, 40, 45];
const minTpVals = [2.0, 2.2];
const maxTpVals = [3.8, 4.0, 4.2];

let totalCombos = swMinVals.length * swMajVals.length * rrVals.length * atrMultVals.length * expireVals.length * minTpVals.length * maxTpVals.length;
console.log(`Total parameter combinations to evaluate: ${totalCombos}`);

const candidates = [];
const tStart = Date.now();
let evaluated = 0;

for (const swMin of swMinVals) {
  for (const swMaj of swMajVals) {
    if (swMaj <= swMin) continue;
    for (const rr of rrVals) {
      for (const atrMult of atrMultVals) {
        for (const expireBars of expireVals) {
          for (const minTp of minTpVals) {
            for (const maxTp of maxTpVals) {
              evaluated++;
              const res = simulateDualPivot(c5, atr14, {
                swMin, swMaj, rr, atrMult, expireBars, minTp, maxTp, minHoldSeconds: 120
              });

              if (res.closed >= 6 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
                // Check if both months are >= 10.0R
                if (res.sepR >= 10.0 && res.octR >= 10.0) {
                  candidates.push({
                    swMin, swMaj, rr, atrMult, expireBars, minTp, maxTp,
                    ...res
                  });
                  console.log(`\n🎉 TARGET HIT BOTH >= 10R! [Combo #${evaluated}]`);
                  console.log(` -> SwMin: ${swMin}, SwMaj: ${swMaj}, RR: ${rr}, ATR: ${atrMult}, Exp: ${expireBars}, MinTP: ${minTp}, MaxTP: ${maxTp}`);
                  console.log(` -> Sep: +${res.sepR}R | Oct: +${res.octR}R | Total: +${res.cumulativeR}R | Calmar: ${res.calmarRatio} | MaxDD: -${res.maxDrawdown}R | WR: ${res.winRate.toFixed(1)}% | Trades: ${res.closed} | AvgTP: ${res.avgTpPips}pips`);
                }
              }
            }
          }
        }
      }
    }
  }
}

const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(1);
console.log(`\nEvaluated ${evaluated} combinations in ${elapsedSec} seconds!`);
console.log(`Total strategies hitting BOTH Sep >= 10R AND Oct >= 10R: ${candidates.length}`);

// If not found in strict dual pivot, let's sort all evaluated by min(sepR, octR)
if (candidates.length === 0) {
  console.log('\nSearching for closest candidates to Dual 10R...');
  const closeList = [];
  for (const swMin of swMinVals) {
    for (const swMaj of swMajVals) {
      if (swMaj <= swMin) continue;
      for (const rr of rrVals) {
        for (const atrMult of atrMultVals) {
          for (const expireBars of expireVals) {
            const res = simulateDualPivot(c5, atr14, {
              swMin, swMaj, rr, atrMult, expireBars, minTp: 2.2, maxTp: 4.0, minHoldSeconds: 120
            });
            if (res.closed >= 6 && res.maxDrawdown <= 3.5 && res.calmarRatio >= 4.0) {
              closeList.push({ swMin, swMaj, rr, atrMult, expireBars, ...res });
            }
          }
        }
      }
    }
  }
  closeList.sort((a, b) => Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR) || b.cumulativeR - a.cumulativeR);
  console.log('Top 10 closest:');
  closeList.slice(0, 10).forEach(c => {
    console.log(`SwMin:${c.swMin} Maj:${c.swMaj} RR:${c.rr} ATR:${c.atrMult} Exp:${c.expireBars} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}%`);
  });
} else {
  // Sort candidates by highest balanced score
  candidates.sort((a, b) => (b.cumulativeR * 1.5 + b.calmarRatio * 2) - (a.cumulativeR * 1.5 + a.calmarRatio * 2));
  console.log('\nTop 5 Champions:');
  candidates.slice(0, 5).forEach((c, idx) => {
    console.log(`#${idx + 1}: SwMin:${c.swMin} Maj:${c.swMaj} RR:${c.rr} ATR:${c.atrMult} Exp:${c.expireBars} -> Sep:+${c.sepR}R Oct:+${c.octR}R Total:+${c.cumulativeR}R Calmar:${c.calmarRatio} DD:-${c.maxDrawdown}R WR:${c.winRate.toFixed(1)}% AvgTP:${c.avgTpPips}pips`);
  });

  // Verify top candidate on PineTS to confirm 100% exact match
  const best = candidates[0];
  console.log('\nVerifying #1 Champion on PineTS engine...');
  const pineCode = `//@version=6
indicator("Champion_Dual10R_Verified", overlay=true)
swingLen = ${best.swMin}
majorSwingLen = ${best.swMaj}
rrRatio = ${best.rr}
atrMult = ${best.atrMult}
expireBars = ${best.expireBars}
minHoldSeconds = 120
minTpPts = ${best.minTp}
maxTpPts = ${best.maxTp}

var string[] monthKeys = array.new_string()
var int[] monthWins = array.new_int()
var int[] monthLosses = array.new_int()
var float[] monthR = array.new_float()
var float cumulativeR = 0.0
var float peakR = 0.0
var float maxDrawdown = 0.0

atr = ta.atr(14)
sH1 = ta.pivothigh(high, swingLen, swingLen)
sL1 = ta.pivotlow(low, swingLen, swingLen)
sH2 = ta.pivothigh(high, majorSwingLen, majorSwingLen)
sL2 = ta.pivotlow(low, majorSwingLen, majorSwingLen)

var float[] bslLvls = array.new_float()
var bool[] bslSwept = array.new_bool()
var float[] sslLvls = array.new_float()
var bool[] sslSwept = array.new_bool()

if not na(sH1)
    array.push(bslLvls, sH1)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 12
        array.shift(bslLvls)
        array.shift(bslSwept)
if not na(sL1)
    array.push(sslLvls, sL1)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 12
        array.shift(sslLvls)
        array.shift(sslSwept)
if not na(sH2)
    array.push(bslLvls, sH2)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 12
        array.shift(bslLvls)
        array.shift(bslSwept)
if not na(sL2)
    array.push(sslLvls, sL2)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 12
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

while array.size(bFvgTop) > 30
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 30
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
var int[] sigEntryTime = array.new_int()

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d = array.get(sigDir, i)
            tp = array.get(sigTP, i)
            sl = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            holdSec = (time - array.get(sigEntryTime, i)) / 1000
            resolved = false

            if age >= expireBars * 3
                array.set(sigResult, i, 2)
                resolved := true
            else if holdSec >= minHoldSeconds
                if d == 1
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

if sslSweep and not hasOpen
    lookLong := true
    lookShort := false
    setupBarL := bar_index
    setupSLL := sweepLow - atr * atrMult

if bslSweep and not hasOpen
    lookShort := true
    lookLong := false
    setupBarS := bar_index
    setupSLS := sweepHigh + atr * atrMult

if lookLong and (bar_index - setupBarL) > expireBars
    lookLong := false
if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

if lookLong and not hasOpen
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
                            winR = rrRatio
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, winR)
                            array.push(sigEntryTime, time)
                            lookLong := false
                            break

if lookShort and not hasOpen
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
                            winR = rrRatio
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, winR)
                            array.push(sigEntryTime, time)
                            lookShort := false
                            break
`;

  runBacktestOnTimeframe(c5, '5', pineCode).then(ptRes => {
    console.log('PineTS Verification Result:');
    console.log(` -> Sep: +${ptRes.sepR}R | Oct: +${ptRes.octR}R | Total: +${ptRes.cumulativeR}R | Calmar: ${ptRes.calmarRatio} | DD: -${ptRes.maxDrawdown}R | WR: ${ptRes.winRate}% | Trades: ${ptRes.closed}`);
  }).catch(console.error);
}
