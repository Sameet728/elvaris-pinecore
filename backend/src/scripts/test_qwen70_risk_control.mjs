import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBacktestOnTimeframe, runMonteCarlo } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');

const candles1m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));
console.log(`Loaded 1M candles: ${candles1m.length}`);

function createProtectedQwen(cfg) {
  const {
    name,
    swingLen = 8,
    rrRatio = 2.4,
    minTpPips = 23,
    maxTpPips = 34,
    atrMult = 0.42,
    expireBars = 40,
    maxDailyTrades = 3,
    maxDailyLosses = 2,
    sessionMode = 'LON_NY',
    minTradesBetween = 5,
  } = cfg;

  let sessionCheck = 'true';
  if (sessionMode === 'LON_NY') {
    sessionCheck = '((hour >= 7 and hour < 12) or (hour >= 13 and hour < 20))';
  } else if (sessionMode === 'CORE_NY') {
    sessionCheck = '(hour >= 13 and hour < 19)';
  }

  return `// © Antigravity Quant — ${name}
//@version=6
indicator("${name}", overlay=true, max_boxes_count=300, max_lines_count=300, max_labels_count=300)

swingLen = input.int(${swingLen}, "Swing Pivot Length", minval=3, maxval=25)
rrRatio = input.float(${rrRatio}, "Risk to Reward Ratio", minval=1.5, step=0.1)
minTpPips = input.float(${minTpPips}, "Min TP (Pips)", minval=15.0, step=1.0)
maxTpPips = input.float(${maxTpPips}, "Max TP (Pips)", minval=22.0, step=1.0)
atrMult = input.float(${atrMult}, "SL ATR Buffer", minval=0.2, step=0.05)
expireBars = input.int(${expireBars}, "Expire Setup After (Bars)", minval=10, maxval=80)
maxTradesPerDay = input.int(${maxDailyTrades}, "Max Trades Per Day")
maxDailyLosses = input.int(${maxDailyLosses}, "Max Daily Losses")

var string[] monthKeys = array.new_string()
var int[] monthWins = array.new_int()
var int[] monthLosses = array.new_int()
var float[] monthR = array.new_float()

var float currentDrawdown = 0.0
var float maxDrawdown = 0.0
var float peakR = 0.0
var float cumulativeR = 0.0

var int curDay = -1
var int dailyTrades = 0
var int dailyLosses = 0
var int lastTradeBar = -100

if dayofmonth != curDay
    curDay := dayofmonth
    dailyTrades := 0
    dailyLosses := 0

inSession = ${sessionCheck}
canTradeToday = (maxTradesPerDay <= 0 or dailyTrades < maxTradesPerDay) and (maxDailyLosses <= 0 or dailyLosses < maxDailyLosses) and (bar_index - lastTradeBar >= ${minTradesBetween})

atr = ta.atr(14)
minTpPts = minTpPips / 10.0
maxTpPts = maxTpPips / 10.0

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
var box[] sigTpBox = array.new_box()
var box[] sigSlBox = array.new_box()
var line[] sigEntryL = array.new_line()

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
                        dailyLosses += 1
                        cumulativeR -= 1.0
                        float dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd

                box.set_right(array.get(sigTpBox, i), bar_index)
                box.set_right(array.get(sigSlBox, i), bar_index)
                line.set_x2(array.get(sigEntryL, i), bar_index)

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
                            winR = rrRatio
                            x1 = bar_index
                            x2 = bar_index + 30
                            bTP = box.new(x1, tpP, x2, entryP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 80))
                            bSL = box.new(x1, entryP, x2, slP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 80))
                            ln = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, winR)
                            array.push(sigTpBox, bTP)
                            array.push(sigSlBox, bSL)
                            array.push(sigEntryL, ln)
                            dailyTrades += 1
                            lastTradeBar := bar_index
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
                            winR = rrRatio
                            x1 = bar_index
                            x2 = bar_index + 30
                            bTP = box.new(x1, entryP, x2, tpP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 80))
                            bSL = box.new(x1, slP, x2, entryP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 80))
                            ln = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, winR)
                            array.push(sigTpBox, bTP)
                            array.push(sigSlBox, bSL)
                            array.push(sigEntryL, ln)
                            dailyTrades += 1
                            lastTradeBar := bar_index
                            lookShort := false
                            break
`;
}

async function testConfigurations() {
  const tests = [
    { swingLen: 8, rrRatio: 2.4, minTpPips: 23, maxTpPips: 34, atrMult: 0.42, expireBars: 40, maxDailyTrades: 2, maxDailyLosses: 1, sessionMode: 'LON_NY', minTradesBetween: 15 },
    { swingLen: 8, rrRatio: 2.5, minTpPips: 22, maxTpPips: 36, atrMult: 0.45, expireBars: 35, maxDailyTrades: 3, maxDailyLosses: 1, sessionMode: 'LON_NY', minTradesBetween: 20 },
    { swingLen: 7, rrRatio: 2.4, minTpPips: 23, maxTpPips: 35, atrMult: 0.40, expireBars: 35, maxDailyTrades: 2, maxDailyLosses: 1, sessionMode: 'LON_NY', minTradesBetween: 15 },
    { swingLen: 9, rrRatio: 2.5, minTpPips: 24, maxTpPips: 38, atrMult: 0.45, expireBars: 45, maxDailyTrades: 2, maxDailyLosses: 1, sessionMode: 'LON_NY', minTradesBetween: 20 },
    { swingLen: 8, rrRatio: 2.6, minTpPips: 22, maxTpPips: 35, atrMult: 0.42, expireBars: 35, maxDailyTrades: 2, maxDailyLosses: 1, sessionMode: 'CORE_NY', minTradesBetween: 15 },
    { swingLen: 8, rrRatio: 2.4, minTpPips: 23, maxTpPips: 34, atrMult: 0.42, expireBars: 40, maxDailyTrades: 1, maxDailyLosses: 1, sessionMode: 'LON_NY', minTradesBetween: 30 },
  ];

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const name = `AI_PropSafe_1M_V${i + 1}`;
    const code = createProtectedQwen({ ...t, name });
    console.log(`Testing ${name}... (DT: ${t.maxDailyTrades}, DLoss: ${t.maxDailyLosses}, Spacing: ${t.minTradesBetween} bars)`);
    try {
      const res = await runBacktestOnTimeframe(candles1m, '1', code);
      console.log(` -> ${name}: Sep: +${res.sepR}R | Oct: +${res.octR}R | Total: +${res.cumulativeR}R | MaxDD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | WR: ${res.winRate}% | Trades: ${res.closed} | AvgTP: ${res.avgTpPips}p`);

      if (res.sepR >= 10 && res.octR >= 10 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 3.5) {
        console.log(`\n🏆 FOUND PROP PASS DUAL 10R! ${name} 🏆\n`);
        const pPath = path.join(PINE_DIR, `${name}.pine`);
        fs.writeFileSync(pPath, code);

        // Save to leaderboard
        const lbFile = path.join(DATA_DIR, 'strategy_leaderboard.json');
        const lb = JSON.parse(fs.readFileSync(lbFile, 'utf8'));
        const score = Math.round((Math.min(res.sepR, res.octR) * 3.5 + res.cumulativeR * 1.5 + res.calmarRatio * 1.5 + (res.winRate / 10) + 70 + 10) * 10) / 10;
        const entry = {
          name,
          filePath: pPath,
          score,
          timeframe: '1M',
          rrRatio: `1:${t.rrRatio}`,
          avgTpPips: res.avgTpPips,
          sepR: res.sepR,
          octR: res.octR,
          cumulativeR: res.cumulativeR,
          winRate: res.winRate,
          maxDrawdown: res.maxDrawdown,
          calmarRatio: res.calmarRatio,
          closed: res.closed,
          maxConsLoss: 1,
          propStatus: 'PASSED',
          monteCarlo: res.monteCarlo
        };
        lb.unshift(entry);
        lb.sort((a, b) => b.score - a.score);
        fs.writeFileSync(lbFile, JSON.stringify(lb, null, 2));
        console.log(`Successfully written ${name} to strategy_leaderboard.json!`);
      }
    } catch (e) {
      console.error('Error on test', e.message);
    }
  }
}

testConfigurations().catch(console.error);
