import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

async function analyze() {
  const results = [];

  for (const sw of [2, 3, 4, 5, 6]) {
    for (const rr of [2.0, 2.4, 2.6, 2.8, 3.0, 3.2]) {
      for (const atr of [0.35, 0.42, 0.5]) {
        for (const sess of ['ALL', 'LON_NY']) {
          const sessClause = sess === 'LON_NY' ? '((hour >= 7 and hour < 12) or (hour >= 13 and hour < 20))' : 'true';
          const pine = `//@version=6
indicator("test", overlay=true)
swingLen = ${sw}
rr = ${rr}
atr = ta.atr(14)
inSess = ${sessClause}
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

var int[] sDir = array.new_int()
var float[] sEn = array.new_float()
var float[] sSL = array.new_float()
var float[] sTP = array.new_float()
var int[] sRes = array.new_int()
var int[] sBar = array.new_int()
var float[] sR = array.new_float()
var string[] mKeys = array.new_string()
var int[] mWins = array.new_int()
var int[] mLosses = array.new_int()
var float[] mR = array.new_float()
var float cumR = 0.0
var float peakR = 0.0
var float maxDrawdown = 0.0

nS = array.size(sDir)
if nS > 0
    for i = 0 to nS - 1
        if array.get(sRes, i) == 0
            d = array.get(sDir, i), tp = array.get(sTP, i), sl = array.get(sSL, i)
            age = bar_index - array.get(sBar, i)
            done = false
            if age >= 100
                array.set(sRes, i, 2), done := true
            else if d == 1
                if high >= tp
                    array.set(sRes, i, 1), done := true
                else if low <= sl
                    array.set(sRes, i, -1), done := true
            else
                if low <= tp
                    array.set(sRes, i, 1), done := true
                else if high >= sl
                    array.set(sRes, i, -1), done := true
            if done
                rRes = array.get(sRes, i)
                if rRes == 1 or rRes == -1
                    mStr = str.tostring(year(time)) + "-" + (month(time) < 10 ? "0" : "") + str.tostring(month(time))
                    idx = array.indexof(mKeys, mStr)
                    if idx == -1
                        array.push(mKeys, mStr), array.push(mWins, 0), array.push(mLosses, 0), array.push(mR, 0.0)
                        idx := array.size(mKeys) - 1
                    if rRes == 1
                        array.set(mWins, idx, array.get(mWins, idx) + 1)
                        array.set(mR, idx, array.get(mR, idx) + rr)
                        cumR += rr
                        if cumR > peakR
                            peakR := cumR
                    else
                        array.set(mLosses, idx, array.get(mLosses, idx) + 1)
                        array.set(mR, idx, array.get(mR, idx) - 1.0)
                        cumR -= 1.0
                        dd = peakR - cumR
                        if dd > maxDrawdown
                            maxDrawdown := dd

hasOp = false
if array.size(sRes) > 0
    for i = 0 to array.size(sRes) - 1
        if array.get(sRes, i) == 0
            hasOp := true

var bool lLong = false
var bool lShort = false
var int sbL = 0
var int sbS = 0
var float slL = 0.0
var float slS = 0.0

if array.size(ssl) > 0 and inSess and not hasOp
    for i = 0 to array.size(ssl) - 1
        lvl = array.get(ssl, i)
        if low < lvl and close > lvl
            lLong := true, lShort := false, sbL := bar_index, slL := low - atr * ${atr}
if array.size(bsl) > 0 and inSess and not hasOp
    for i = 0 to array.size(bsl) - 1
        lvl = array.get(bsl, i)
        if high > lvl and close < lvl
            lShort := true, lLong := false, sbS := bar_index, slS := high + atr * ${atr}

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
                            array.push(sDir, 1), array.push(sEn, en), array.push(sSL, slL), array.push(sTP, en + tpD)
                            array.push(sRes, 0), array.push(sBar, bar_index), array.push(sR, rr)
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
                            array.push(sDir, -1), array.push(sEn, en), array.push(sSL, slS), array.push(sTP, en - tpD)
                            array.push(sRes, 0), array.push(sBar, bar_index), array.push(sR, rr)
                            lShort := false
                            break
`;
          try {
            const res = await runBacktestOnTimeframe(c5, '5', pine);
            if (res && res.closed >= 5) {
              results.push({ sw, rr, atr, sess, sep: res.sepR, oct: res.octR, calmar: res.calmarRatio, dd: res.maxDrawdown, wr: res.winRate, trades: res.closed });
            }
          } catch(e) {}
        }
      }
    }
  }

  results.sort((a, b) => (Math.min(b.sep, b.oct) - Math.min(a.sep, a.oct)) || (b.calmar - a.calmar));
  console.log('\nTop 10 Most Balanced Monthly Strategies (Max min-month):');
  results.slice(0, 10).forEach(r => console.log(' ->', JSON.stringify(r)));

  results.sort((a, b) => b.oct - a.oct);
  console.log('\nTop 5 Highest October Strategies:');
  results.slice(0, 5).forEach(r => console.log(' ->', JSON.stringify(r)));
}

analyze().catch(console.error);
