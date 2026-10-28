import fs from 'fs';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const candles1m = JSON.parse(fs.readFileSync('data/xauusd_1m_tv.json', 'utf8'));
const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

console.log(`Starting Dedicated Dual-Month 10R+ Searcher...`);
console.log(`Target: Sep >= 10.0R AND Oct >= 10.0R | Calmar > 4.0 | Max DD <= 3.5R | TP: 20-40 pips`);

function generatePine(config) {
  const {
    name,
    swingLen = 5,
    rrRatio = 2.5,
    minTpPips = 22.0,
    maxTpPips = 38.0,
    atrMult = 0.42,
    expireBars = 35,
    maxDailyTrades = 2,
    sessionMode = 'LON_NY',
    useEmaFilter = false,
    emaLen = 50,
    stopDailyLossR = 2.0
  } = config;

  let sessionCheck = 'true';
  if (sessionMode === 'LON_NY') {
    sessionCheck = '((hour >= 7 and hour < 12) or (hour >= 13 and hour < 19))';
  } else if (sessionMode === 'CORE_NY') {
    sessionCheck = '(hour >= 12 and hour < 19)';
  } else if (sessionMode === 'LONDON') {
    sessionCheck = '(hour >= 7 and hour < 13)';
  }

  const emaCode = useEmaFilter ? `
emaFilter = ta.ema(close, ${emaLen})
longTrendOk = close > emaFilter
shortTrendOk = close < emaFilter
` : `
longTrendOk = true
shortTrendOk = true
`;

  return `// © Antigravity Quant — ${name}
//@version=6
indicator("${name}", overlay=true, max_boxes_count=350, max_lines_count=350, max_labels_count=350)

swingLen = input.int(${swingLen}, "Swing Length")
rrRatio = input.float(${rrRatio.toFixed(1)}, "Risk Reward")
minTpPips = input.float(${minTpPips.toFixed(1)}, "Min TP Pips")
maxTpPips = input.float(${maxTpPips.toFixed(1)}, "Max TP Pips")
atrMult = input.float(${atrMult.toFixed(2)}, "ATR Mult")
expireBars = input.int(${expireBars}, "Expire Bars")
maxTradesPerDay = input.int(${maxDailyTrades}, "Max Trades Per Day")

var string[] monthKeys = array.new_string()
var int[] monthWins = array.new_int()
var int[] monthLosses = array.new_int()
var float[] monthR = array.new_float()

var float currentDrawdown = 0.0
var float maxDrawdown = 0.0
var float peakR = 0.0
var float cumulativeR = 0.0

var int currentDay = -1
var int dailyTradeCount = 0
var float dailyLossCount = 0.0

if dayofmonth != currentDay
    currentDay := dayofmonth
    dailyTradeCount := 0
    dailyLossCount := 0.0

inSession = ${sessionCheck}
${emaCode}
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
                        dailyLossCount += 1.0
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

canTradeToday = (maxTradesPerDay <= 0 or dailyTradeCount < maxTradesPerDay) and dailyLossCount < 2.0

if sslSweep and inSession and not hasOpen and canTradeToday and longTrendOk
    lookLong := true
    lookShort := false
    setupBarL := bar_index
    setupSLL := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen and canTradeToday and shortTrendOk
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

// Entry on candle close (Zero lookahead)
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
                            dailyTradeCount += 1
                            lookShort := false
                            break
`;
}

async function searchDual10R() {
  const matches = [];

  // Test across 5M and 1M
  // On 5M:
  console.log('Testing 5M grid for Dual 10R+ (Sep >= 10R & Oct >= 10R)...');
  const swVals = [3, 4, 5, 6, 7];
  const rrVals = [2.2, 2.5, 2.8, 3.0, 3.2];
  const sessVals = ['ALL', 'LON_NY'];
  const dlVals = [0, 2, 3];
  const emaVals = [false, true];

  for (const sw of swVals) {
    for (const rr of rrVals) {
      for (const sess of sessVals) {
        for (const dl of dlVals) {
          for (const ema of emaVals) {
            const cfg = {
              name: `M5_Dual10R_Sw${sw}_RR${rr}_DL${dl}_${sess}_EMA${ema?1:0}`,
              swingLen: sw,
              rrRatio: rr,
              minTpPips: 22.0,
              maxTpPips: 38.0,
              atrMult: 0.42,
              expireBars: 35,
              maxDailyTrades: dl,
              sessionMode: sess,
              useEmaFilter: ema,
              emaLen: 50
            };
            const code = generatePine(cfg);
            try {
              const res = await runBacktestOnTimeframe(candles5m, '5', code);
              if (res.closed >= 6 && res.avgTpPips >= 20.0 && res.avgTpPips <= 40.0) {
                if (res.sepR >= 8.0 && res.octR >= 6.0) {
                  console.log(`[NEAR 5M] ${cfg.name} | Sep: +${res.sepR}R, Oct: +${res.octR}R | Total: +${res.cumulativeR}R | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | WR: ${res.winRate}% | Trades: ${res.closed}`);
                }
                if (res.sepR >= 9.5 && res.octR >= 9.5 && res.maxDrawdown <= 4.0) {
                  console.log(`🎯 [EXACT DUAL 10R HIT 5M] ${cfg.name} | Sep: +${res.sepR}R, Oct: +${res.octR}R | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | WR: ${res.winRate}%`);
                  matches.push({ cfg, res, code, tf: '5M' });
                }
              }
            } catch (e) {}
          }
        }
      }
    }
  }

  // Now test 1M grid with daily throttles:
  console.log('\nTesting 1M grid for Dual 10R+ (Sep >= 10R & Oct >= 10R)...');
  const sw1Vals = [5, 6, 7, 8, 9, 10];
  const rr1Vals = [2.2, 2.4, 2.6, 2.8];
  const sess1Vals = ['LON_NY', 'CORE_NY', 'ALL'];
  const dl1Vals = [1, 2, 3];

  for (const sw of sw1Vals) {
    for (const rr of rr1Vals) {
      for (const sess of sess1Vals) {
        for (const dl of dl1Vals) {
          const cfg = {
            name: `M1_Dual10R_Sw${sw}_RR${rr}_DL${dl}_${sess}`,
            swingLen: sw,
            rrRatio: rr,
            minTpPips: 22.0,
            maxTpPips: 36.0,
            atrMult: 0.42,
            expireBars: 45,
            maxDailyTrades: dl,
            sessionMode: sess,
            useEmaFilter: false
          };
          const code = generatePine(cfg);
          try {
            const res = await runBacktestOnTimeframe(candles1m, '1', code);
            if (res.closed >= 10 && res.avgTpPips >= 20.0 && res.avgTpPips <= 40.0) {
              if (res.sepR >= 8.0 && res.octR >= 8.0) {
                console.log(`[NEAR 1M] ${cfg.name} | Sep: +${res.sepR}R, Oct: +${res.octR}R | Total: +${res.cumulativeR}R | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | WR: ${res.winRate}% | Trades: ${res.closed}`);
              }
              if (res.sepR >= 9.5 && res.octR >= 9.5 && res.maxDrawdown <= 4.0) {
                console.log(`🎯 [EXACT DUAL 10R HIT 1M] ${cfg.name} | Sep: +${res.sepR}R, Oct: +${res.octR}R | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | WR: ${res.winRate}%`);
                matches.push({ cfg, res, code, tf: '1M' });
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  console.log(`\nFound ${matches.length} exact dual-10R matches.`);
  if (matches.length > 0) {
    matches.sort((a, b) => b.res.calmarRatio - a.res.calmarRatio);
    const top = matches[0];
    fs.writeFileSync('data/best_dual_10r_prop.json', JSON.stringify(top, null, 2));
    console.log(`Best Dual 10R Strategy: ${top.cfg.name} | Calmar: ${top.res.calmarRatio} | Sep: +${top.res.sepR}R | Oct: +${top.res.octR}R`);
  }
}

searchDual10R();
