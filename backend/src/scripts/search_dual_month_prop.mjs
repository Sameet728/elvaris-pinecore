import fs from 'fs';
import { runBacktestOnTimeframe } from './multi_tf_engine.mjs';

const candles1m = JSON.parse(fs.readFileSync('data/xauusd_1m_tv.json', 'utf8'));
const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const candles15m = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

console.log(`Loaded authentic data:`);
console.log(`- 1M: ${candles1m.length} bars (${new Date(candles1m[0].openTime || candles1m[0].time).toISOString()} -> ${new Date(candles1m[candles1m.length-1].openTime || candles1m[candles1m.length-1].time).toISOString()})`);
console.log(`- 5M: ${candles5m.length} bars (${new Date(candles5m[0].openTime || candles5m[0].time).toISOString()} -> ${new Date(candles5m[candles5m.length-1].openTime || candles5m[candles5m.length-1].time).toISOString()})`);
console.log(`- 15M: ${candles15m.length} bars (${new Date(candles15m[0].openTime || candles15m[0].time).toISOString()} -> ${new Date(candles15m[candles15m.length-1].openTime || candles15m[candles15m.length-1].time).toISOString()})`);

function generatePineScript(config) {
  const {
    name,
    swingLen = 7,
    rrRatio = 2.4,
    minTpPips = 24.0,
    maxTpPips = 38.0,
    atrMult = 0.4,
    expireBars = 35,
    maxDailyTrades = 2,
    sessionMode = 'LON_NY', // 'ALL', 'LON_NY', 'CORE_NY'
    useEmaFilter = false,
    emaLen = 50
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
indicator("${name}", overlay=true, max_boxes_count=300, max_lines_count=300, max_labels_count=300)

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
var float currentConsWinR = 0.0
var float maxConsWinR = 0.0
var float currentConsLossR = 0.0
var float maxConsLossR = 0.0

var int currentDay = -1
var int dailyTradeCount = 0

if dayofmonth != currentDay
    currentDay := dayofmonth
    dailyTradeCount := 0

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
                        currentConsLossR := 0.0
                        currentConsWinR += rOutcome
                        if currentConsWinR > maxConsWinR
                            maxConsWinR := currentConsWinR
                        cumulativeR += rOutcome
                        if cumulativeR > peakR
                            peakR := cumulativeR
                    else if finalRes == -1
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1)
                        array.set(monthR, idx, array.get(monthR, idx) - 1.0)
                        currentConsWinR := 0.0
                        currentConsLossR += 1.0
                        if currentConsLossR > maxConsLossR
                            maxConsLossR := currentConsLossR
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

canTradeToday = maxTradesPerDay <= 0 or dailyTradeCount < maxTradesPerDay

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

async function runGrid() {
  const results = [];
  console.log(`\nStarting systematic exploration across 5M, 15M, and 1M...`);

  // Target: Calmar > 4.0, Prop Passed (DD <= 3.5R), Sep >= 10R or Oct >= 10R (Total 20R+), Avg TP 20-40 pips

  // Phase 1: High-conviction 5M grid
  console.log(`\n>>> PHASE 1: Exploring 5M Timeframe (5,520 authentic bars) <<<`);
  const sw5 = [4, 5, 6, 7, 8, 9, 10];
  const rr5 = [2.0, 2.2, 2.4, 2.5, 2.7, 3.0];
  const sess5 = ['LON_NY', 'ALL', 'CORE_NY'];
  const dl5 = [0, 1, 2];
  const ema5 = [false, true];

  for (const sw of sw5) {
    for (const rr of rr5) {
      for (const sess of sess5) {
        for (const dl of dl5) {
          for (const ema of ema5) {
            const cfg = {
              name: `DualMonth_M5_Sw${sw}_RR${rr}_DL${dl}_${sess}_EMA${ema?1:0}`,
              tfCode: '5',
              tfName: '5M',
              data: candles5m,
              swingLen: sw,
              rrRatio: rr,
              minTpPips: 24.0,
              maxTpPips: 38.0,
              atrMult: 0.42,
              expireBars: 35,
              maxDailyTrades: dl,
              sessionMode: sess,
              useEmaFilter: ema,
              emaLen: 50
            };
            const code = generatePineScript(cfg);
            try {
              const res = await runBacktestOnTimeframe(cfg.data, cfg.tfCode, code);
              if (res.closed >= 6 && res.avgTpPips >= 20.0 && res.avgTpPips <= 40.0) {
                const item = {
                  name: cfg.name,
                  tf: cfg.tfName,
                  closed: res.closed,
                  winRate: res.winRate,
                  totalR: res.cumulativeR,
                  sepR: res.sepR,
                  octR: res.octR,
                  maxDD: res.maxDrawdown,
                  calmar: res.calmarRatio,
                  avgTp: res.avgTpPips,
                  mcSurvival: res.monteCarlo?.survivalRate ?? 0,
                  config: cfg,
                  code: code
                };
                results.push(item);
                if (res.calmarRatio >= 4.0 && res.maxDrawdown <= 3.5 && (res.sepR >= 6.0 || res.octR >= 6.0)) {
                  console.log(`⭐ [CHAMPION CANDIDATE 5M] ${cfg.name} | Trades: ${res.closed} | WR: ${res.winRate}% | Tot: +${res.cumulativeR}R (Sep: +${res.sepR}R, Oct: +${res.octR}R) | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | TP: ${res.avgTpPips.toFixed(1)}pips`);
                }
              }
            } catch (e) {}
          }
        }
      }
    }
  }

  // Phase 2: High-conviction 1M grid with daily limits to prevent drawdown
  console.log(`\n>>> PHASE 2: Exploring 1M Timeframe (37,441 authentic bars) with Daily Trade Limits <<<`);
  const sw1 = [6, 7, 8, 10];
  const rr1 = [2.2, 2.4, 2.6];
  const sess1 = ['LON_NY', 'CORE_NY'];
  const dl1 = [1, 2];
  const ema1 = [false, true];

  for (const sw of sw1) {
    for (const rr of rr1) {
      for (const sess of sess1) {
        for (const dl of dl1) {
          for (const ema of ema1) {
            const cfg = {
              name: `DualMonth_M1_Sw${sw}_RR${rr}_DL${dl}_${sess}_EMA${ema?1:0}`,
              tfCode: '1',
              tfName: '1M',
              data: candles1m,
              swingLen: sw,
              rrRatio: rr,
              minTpPips: 24.0,
              maxTpPips: 36.0,
              atrMult: 0.42,
              expireBars: 45,
              maxDailyTrades: dl,
              sessionMode: sess,
              useEmaFilter: ema,
              emaLen: 50
            };
            const code = generatePineScript(cfg);
            try {
              const res = await runBacktestOnTimeframe(cfg.data, cfg.tfCode, code);
              if (res.closed >= 10 && res.avgTpPips >= 20.0 && res.avgTpPips <= 40.0) {
                const item = {
                  name: cfg.name,
                  tf: cfg.tfName,
                  closed: res.closed,
                  winRate: res.winRate,
                  totalR: res.cumulativeR,
                  sepR: res.sepR,
                  octR: res.octR,
                  maxDD: res.maxDrawdown,
                  calmar: res.calmarRatio,
                  avgTp: res.avgTpPips,
                  mcSurvival: res.monteCarlo?.survivalRate ?? 0,
                  config: cfg,
                  code: code
                };
                results.push(item);
                if (res.calmarRatio >= 3.5 && res.maxDrawdown <= 4.0) {
                  console.log(`⭐ [CHAMPION CANDIDATE 1M] ${cfg.name} | Trades: ${res.closed} | WR: ${res.winRate}% | Tot: +${res.cumulativeR}R (Sep: +${res.sepR}R, Oct: +${res.octR}R) | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | TP: ${res.avgTpPips.toFixed(1)}pips`);
                }
              }
            } catch (e) {}
          }
        }
      }
    }
  }

  // Sort candidates by prop firm score:
  // Must have: Calmar > 4.0, Max DD <= 3.5R, High monthly R (Sep & Oct), WR >= 55%
  results.sort((a, b) => {
    const minMonthA = Math.min(a.sepR, a.octR);
    const minMonthB = Math.min(b.sepR, b.octR);
    const scoreA = (a.calmar * 3) + (a.totalR * 2) + (minMonthA * 4) - (a.maxDD * 4) + (a.winRate > 55 ? 15 : 0) + (a.closed >= 10 ? 10 : 0);
    const scoreB = (b.calmar * 3) + (b.totalR * 2) + (minMonthB * 4) - (b.maxDD * 4) + (b.winRate > 55 ? 15 : 0) + (b.closed >= 10 ? 10 : 0);
    return scoreB - scoreA;
  });

  console.log(`\n===============================================================`);
  console.log(`🏆 TOP 10 BALANCED DUAL-MONTH PROP FIRM STRATEGIES DISCOVERED 🏆`);
  console.log(`===============================================================`);
  const top10 = results.slice(0, 10);
  for (let i = 0; i < top10.length; i++) {
    const s = top10[i];
    console.log(`#${i+1}: ${s.name} (TF: ${s.tf})`);
    console.log(`    Calmar: ${s.calmar} | Total: +${s.totalR}R (Sep: +${s.sepR}R, Oct: +${s.octR}R)`);
    console.log(`    Max DD: -${s.maxDD}R | Win Rate: ${s.winRate}% | Trades: ${s.closed} | Avg TP: ${s.avgTp.toFixed(1)} pips | MC: ${s.mcSurvival}%`);
  }

  if (top10.length > 0) {
    fs.writeFileSync('data/best_dual_month_prop.json', JSON.stringify(top10[0], null, 2));
    console.log(`\nSaved best strategy details to data/best_dual_month_prop.json`);
  }
}

runGrid();
