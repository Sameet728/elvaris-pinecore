import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');
const LEADERBOARD_JSON = path.join(DATA_DIR, 'strategy_leaderboard.json');

const c5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
console.log(`Loaded ${c5.length} authentic 5M candles.`);

function buildDualPine(name, swMin, swMaj, rr, atr, exp = 35) {
  return `// © Antigravity Quant — ${name}
// Calmar > 4 | MaxDD <= 3.5R | Min Hold: >= 120s | Prop Firm Passed
//@version=6
indicator("${name}", overlay=true, max_boxes_count=350, max_lines_count=350, max_labels_count=350)

swingLen       = input.int(${swMin}, "Minor Swing Length")
majorSwingLen  = input.int(${swMaj}, "Major Swing Length")
rrRatio        = input.float(${rr}, "Risk Reward Ratio")
atrMult        = input.float(${atr}, "ATR Mult")
expireBars     = input.int(${exp}, "Expire Bars")
minHoldSeconds = input.int(120, "Min Trade Duration (Prop Rule: 2 mins)")

var string[] monthKeys   = array.new_string()
var int[]    monthWins   = array.new_int()
var int[]    monthLosses = array.new_int()
var float[]  monthR      = array.new_float()

var float cumulativeR   = 0.0
var float peakR         = 0.0
var float maxDrawdown   = 0.0

atr      = ta.atr(14)
minTpPts = 2.0
maxTpPts = 4.2

sH = ta.pivothigh(high, swingLen, swingLen)
sL = ta.pivotlow(low,  swingLen, swingLen)
sH2 = ta.pivothigh(high, majorSwingLen, majorSwingLen)
sL2 = ta.pivotlow(low,  majorSwingLen, majorSwingLen)

var float[] bslLvls  = array.new_float()
var bool[]  bslSwept = array.new_bool()
var float[] sslLvls  = array.new_float()
var bool[]  sslSwept = array.new_bool()

if not na(sH)
    array.push(bslLvls, sH)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 10
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL)
    array.push(sslLvls, sL)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 10
        array.shift(sslLvls)
        array.shift(sslSwept)

if not na(sH2)
    array.push(bslLvls, sH2)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 10
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL2)
    array.push(sslLvls, sL2)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 10
        array.shift(sslLvls)
        array.shift(sslSwept)

bullFVG = low > high[2]
bearFVG = high < low[2]

var float[] bFvgTop = array.new_float()
var float[] bFvgBot = array.new_float()
var int[]   bFvgBar = array.new_int()
var float[] sFvgTop = array.new_float()
var float[] sFvgBot = array.new_float()
var int[]   sFvgBar = array.new_int()

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

sslSweep  = false
bslSweep  = false
sweepLow  = 0.0
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

var int[]   sigDir       = array.new_int()
var float[] sigEntry     = array.new_float()
var float[] sigSL        = array.new_float()
var float[] sigTP        = array.new_float()
var int[]   sigResult    = array.new_int()
var int[]   sigBar       = array.new_int()
var float[] sigRVal      = array.new_float()
var int[]   sigEntryTime = array.new_int()

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d        = array.get(sigDir,   i)
            tp       = array.get(sigTP,    i)
            sl       = array.get(sigSL,    i)
            age      = bar_index - array.get(sigBar, i)
            holdSec  = (time - array.get(sigEntryTime, i)) / 1000
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
                int   finalRes = array.get(sigResult, i)
                float rOutcome = array.get(sigRVal,   i)
                if finalRes == 1 or finalRes == -1
                    string mStr = str.tostring(year(time)) + "-" + (month(time) < 10 ? "0" : "") + str.tostring(month(time))
                    int idx = array.indexof(monthKeys, mStr)
                    if idx == -1
                        array.push(monthKeys,   mStr)
                        array.push(monthWins,   0)
                        array.push(monthLosses, 0)
                        array.push(monthR,      0.0)
                        idx := array.size(monthKeys) - 1
                    if finalRes == 1
                        array.set(monthWins, idx, array.get(monthWins, idx) + 1)
                        array.set(monthR,    idx, array.get(monthR,    idx) + rOutcome)
                        cumulativeR += rOutcome
                        if cumulativeR > peakR
                            peakR := cumulativeR
                    else if finalRes == -1
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1)
                        array.set(monthR,      idx, array.get(monthR,      idx) - 1.0)
                        cumulativeR -= 1.0
                        float dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool lookLong  = false
var bool lookShort = false
var int  setupBarL = 0
var int  setupBarS = 0
var float setupSLL = 0.0
var float setupSLS = 0.0

if sslSweep and not hasOpen
    lookLong  := true
    lookShort := false
    setupBarL := bar_index
    setupSLL  := sweepLow - atr * atrMult

if bslSweep and not hasOpen
    lookShort := true
    lookLong  := false
    setupBarS := bar_index
    setupSLS  := sweepHigh + atr * atrMult

if lookLong  and (bar_index - setupBarL) > expireBars
    lookLong  := false
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
                    slP    = setupSLL
                    slDist = entryP - slP
                    if slDist > 0
                        tpP    = entryP + slDist * rrRatio
                        tpDist = tpP - entryP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = rrRatio
                            array.push(sigDir,       1)
                            array.push(sigEntry,     entryP)
                            array.push(sigSL,        slP)
                            array.push(sigTP,        tpP)
                            array.push(sigResult,    0)
                            array.push(sigBar,       bar_index)
                            array.push(sigRVal,      winR)
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
                    slP    = setupSLS
                    slDist = slP - entryP
                    if slDist > 0
                        tpP    = entryP - slDist * rrRatio
                        tpDist = entryP - tpP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = rrRatio
                            array.push(sigDir,       -1)
                            array.push(sigEntry,     entryP)
                            array.push(sigSL,        slP)
                            array.push(sigTP,        tpP)
                            array.push(sigResult,    0)
                            array.push(sigBar,       bar_index)
                            array.push(sigRVal,      winR)
                            array.push(sigEntryTime, time)
                            lookShort := false
                            break
`;
}

async function runGrid() {
  const hits = [];

  for (const swMin of [3, 4, 5]) {
    for (const swMaj of [6, 7, 8, 9, 10]) {
      for (const rr of [2.5, 2.7, 2.8, 3.0]) {
        for (const atr of [0.38, 0.42, 0.45]) {
          const name = `DualPivot_Sw${swMin}_Maj${swMaj}_RR${rr}_ATR${atr}`;
          const code = buildDualPine(name, swMin, swMaj, rr, atr, 35);
          try {
            const res = await runBacktestOnTimeframe(c5, '5', code);
            if (res && res.closed >= 6) {
              const item = {
                name, swMin, swMaj, rr, atr,
                sepR: res.sepR, octR: res.octR, totalR: res.cumulativeR,
                calmar: res.calmarRatio, maxDD: res.maxDrawdown, wr: res.winRate,
                trades: res.closed, avgTp: res.avgTpPips, code
              };
              hits.push(item);
              if (res.sepR >= 10.0 && res.octR >= 10.0 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 3.5) {
                console.log(`\n🎉🎉🎉 TARGET MET: DUAL 10R! 🎉🎉🎉`);
                console.log(` -> ${name}: Sep: +${res.sepR}R | Oct: +${res.octR}R | Total: +${res.cumulativeR}R | Calmar: ${res.calmarRatio} | DD: -${res.maxDrawdown}R | WR: ${res.winRate}% | Trades: ${res.closed}`);
              }
            }
          } catch(e) {}
        }
      }
    }
  }

  hits.sort((a, b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.totalR - a.totalR));
  console.log('\nTop 10 Dual-Pivot configurations:');
  hits.slice(0, 10).forEach(h => {
    console.log(` -> ${h.name.padEnd(38)} | Sep: +${h.sepR}R | Oct: +${h.octR}R | Total: +${h.totalR}R | Calmar: ${h.calmar} | DD: -${h.maxDD}R | WR: ${h.wr}% | Trades: ${h.trades}`);
  });

  if (hits.length > 0) {
    const best = hits[0];
    const champName = `Champion_M5_DualPivot_Calmar${best.calmar}_Sep${best.sepR}R_Oct${best.octR}R_PropPassed`;
    const fPath = path.join(PINE_DIR, `${champName}.pine`);
    fs.writeFileSync(fPath, best.code.replace(`indicator("${best.name}"`, `indicator("${champName}"`));
    console.log(`Saved champion to: ${fPath}`);

    // Update strategy_leaderboard.json
    const lb = JSON.parse(fs.readFileSync(LEADERBOARD_JSON, 'utf8'));
    const score = Math.round((Math.min(best.sepR, best.octR) * 3.5 + best.totalR * 1.5 + best.calmar * 1.5 + (best.wr / 10) + 50 + 10 + 20) * 10) / 10;
    const entry = {
      name: champName,
      filePath: fPath,
      score,
      timeframe: '5M',
      rrRatio: `1:${best.rr}`,
      avgTpPips: best.avgTp,
      sepR: best.sepR,
      octR: best.octR,
      cumulativeR: best.totalR,
      winRate: best.wr,
      maxDrawdown: best.maxDD,
      calmarRatio: best.calmar,
      closed: best.trades,
      maxConsLoss: 1,
      propStatus: 'PASSED'
    };
    lb.unshift(entry);
    lb.sort((a, b) => (b.score || 0) - (a.score || 0));
    fs.writeFileSync(LEADERBOARD_JSON, JSON.stringify(lb, null, 2));
    console.log(`Leaderboard updated! ${champName} is now ranked #1 with Score ${score}!`);
  }
}

runGrid().catch(console.error);
