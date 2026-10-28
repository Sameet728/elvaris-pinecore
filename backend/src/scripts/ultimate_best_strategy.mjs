import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');

import { runBacktestOnTimeframe, runMonteCarlo } from './multi_tf_engine.mjs';

// Load all TF data
const candles1m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));
const candles5m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

let m15Candles = [], m30Candles = [], h1Candles = [], h4Candles = [];
try { m15Candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8')); } catch(e) {}
try { m30Candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_30m_tv.json'), 'utf8')); } catch(e) {}
try { h1Candles  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1h_tv.json'),  'utf8')); } catch(e) {}
try { h4Candles  = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_4h_tv.json'),  'utf8')); } catch(e) {}

console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
console.log(`║     ULTIMATE BEST STRATEGY FINDER — Prop Firm Edition       ║`);
console.log(`║  Target: Calmar > 4 | MaxDD ≤ 3.5R | TP: 20-40 pips        ║`);
console.log(`║  Each Month ≥ 10R | Sep+Oct both profitable                 ║`);
console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
console.log(`Data loaded: 1M=${candles1m.length} | 5M=${candles5m.length} | 15M=${m15Candles.length} | 30M=${m30Candles.length} | 1H=${h1Candles.length} | 4H=${h4Candles.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// Pine generator: SMC Liquidity Sweep + FVG + session + optional EMA/RSI filter
// ─────────────────────────────────────────────────────────────────────────────
function generatePine(cfg) {
  const {
    name,
    swingLen      = 5,
    rrRatio       = 2.5,
    minTpPips     = 22.0,
    maxTpPips     = 38.0,
    atrMult       = 0.42,
    expireBars    = 35,
    maxDailyTrades= 2,
    sessionMode   = 'LON_NY',
    useEmaFilter  = false,
    emaLen        = 50,
    useRsiFilter  = false,
    rsiLen        = 14,
    fvgMinGap     = 0.0,    // min gap size in pts for FVG (0 = any)
    breakeven     = false,  // BE at 1R
    strategy      = 'SMC',  // SMC or TREND_BREAK or ENGULF
  } = cfg;

  let sessionCheck = 'true';
  if (sessionMode === 'LON_NY')   sessionCheck = '((hour >= 7 and hour < 12) or (hour >= 13 and hour < 19))';
  else if (sessionMode === 'CORE_NY') sessionCheck = '(hour >= 13 and hour < 19)';
  else if (sessionMode === 'LONDON')  sessionCheck = '(hour >= 7 and hour < 13)';
  else if (sessionMode === 'ASIA_LON') sessionCheck = '((hour >= 1 and hour < 6) or (hour >= 7 and hour < 12))';
  else if (sessionMode === 'NY_CLOSE') sessionCheck = '(hour >= 16 and hour < 20)';

  const emaCode = useEmaFilter ? `
emaFilter = ta.ema(close, ${emaLen})
longTrendOk = close > emaFilter
shortTrendOk = close < emaFilter
` : `
longTrendOk = true
shortTrendOk = true
`;

  const rsiCode = useRsiFilter ? `
rsiVal = ta.rsi(close, ${rsiLen})
longRsiOk  = rsiVal < 70
shortRsiOk = rsiVal > 30
` : `
longRsiOk  = true
shortRsiOk = true
`;

  const beCode = breakeven ? `
// Breakeven management
nSigBE = array.size(sigDir)
if nSigBE > 0
    for i = 0 to nSigBE - 1
        if array.get(sigResult, i) == 0 and array.get(sigBE, i) == false
            d = array.get(sigDir, i)
            entryP2 = array.get(sigEntry, i)
            rrV = array.get(sigRVal, i)
            slOld = array.get(sigSL, i)
            tpP2 = array.get(sigTP, i)
            if d == 1 and high >= entryP2 + (tpP2 - entryP2) * 0.6
                array.set(sigSL, i, entryP2 + 0.2)
                array.set(sigBE, i, true)
            else if d == -1 and low <= entryP2 - (entryP2 - tpP2) * 0.6
                array.set(sigSL, i, entryP2 - 0.2)
                array.set(sigBE, i, true)
` : '';

  return `// © UltimatePropFinder — ${name}
//@version=6
indicator("${name}", overlay=true, max_boxes_count=300, max_lines_count=300, max_labels_count=300)

swingLen      = input.int(${swingLen},          "Swing Length")
rrRatio       = input.float(${rrRatio.toFixed(1)}, "Risk Reward")
minTpPips     = input.float(${minTpPips.toFixed(1)}, "Min TP Pips")
maxTpPips     = input.float(${maxTpPips.toFixed(1)}, "Max TP Pips")
atrMult       = input.float(${atrMult.toFixed(2)}, "ATR Mult")
expireBars    = input.int(${expireBars},        "Expire Bars")
maxTradesPerDay = input.int(${maxDailyTrades},  "Max Trades Per Day")

var string[] monthKeys  = array.new_string()
var int[]    monthWins  = array.new_int()
var int[]    monthLosses= array.new_int()
var float[]  monthR     = array.new_float()

var float cumulativeR  = 0.0
var float peakR        = 0.0
var float maxDrawdown  = 0.0
var int   currentDay   = -1
var int   dailyTradeCount = 0
var float dailyLossCount  = 0.0

if dayofmonth != currentDay
    currentDay        := dayofmonth
    dailyTradeCount   := 0
    dailyLossCount    := 0.0

inSession   = ${sessionCheck}
${emaCode}
${rsiCode}
atr         = ta.atr(14)
minTpPts    = minTpPips / 10.0
maxTpPts    = maxTpPips / 10.0

swingH = ta.pivothigh(high, swingLen, swingLen)
swingL = ta.pivotlow(low,  swingLen, swingLen)

var float[] bslLvls    = array.new_float()
var bool[]  bslSwept   = array.new_bool()
var float[] sslLvls    = array.new_float()
var bool[]  sslSwept   = array.new_bool()

if not na(swingH)
    array.push(bslLvls, swingH)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 10
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(swingL)
    array.push(sslLvls, swingL)
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

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()
var float[] sigRVal   = array.new_float()
var box[]   sigTpBox  = array.new_box()
var box[]   sigSlBox  = array.new_box()
var line[]  sigEntryL = array.new_line()
var bool[]  sigBE     = array.new_bool()

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d   = array.get(sigDir,   i)
            tp  = array.get(sigTP,    i)
            sl  = array.get(sigSL,    i)
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
                int   finalRes  = array.get(sigResult, i)
                float rOutcome  = array.get(sigRVal,   i)
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
                        dailyLossCount += 1.0
                        cumulativeR -= 1.0
                        float dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd
                box.set_right(array.get(sigTpBox,  i), bar_index)
                box.set_right(array.get(sigSlBox,  i), bar_index)
                line.set_x2(array.get(sigEntryL, i), bar_index)

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

canTradeToday = (maxTradesPerDay <= 0 or dailyTradeCount < maxTradesPerDay) and dailyLossCount < 2.0

if sslSweep and inSession and not hasOpen and canTradeToday and longTrendOk and longRsiOk
    lookLong  := true
    lookShort := false
    setupBarL := bar_index
    setupSLL  := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen and canTradeToday and shortTrendOk and shortRsiOk
    lookShort := true
    lookLong  := false
    setupBarS := bar_index
    setupSLS  := sweepHigh + atr * atrMult

if not inSession or not canTradeToday
    lookLong  := false
    lookShort := false

if lookLong  and (bar_index - setupBarL) > expireBars
    lookLong  := false
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
                    slP    = setupSLL
                    slDist = entryP - slP
                    if slDist > 0
                        tpP    = entryP + slDist * rrRatio
                        tpDist = tpP - entryP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = rrRatio
                            x1 = bar_index
                            x2 = bar_index + 30
                            bTP = box.new(x1, tpP, x2, entryP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 80))
                            bSL = box.new(x1, entryP, x2, slP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 80))
                            ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir,    1)
                            array.push(sigEntry,  entryP)
                            array.push(sigSL,     slP)
                            array.push(sigTP,     tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar,    bar_index)
                            array.push(sigRVal,   winR)
                            array.push(sigTpBox,  bTP)
                            array.push(sigSlBox,  bSL)
                            array.push(sigEntryL, ln)
                            array.push(sigBE,     false)
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
                    slP    = setupSLS
                    slDist = slP - entryP
                    if slDist > 0
                        tpP    = entryP - slDist * rrRatio
                        tpDist = entryP - tpP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = rrRatio
                            x1 = bar_index
                            x2 = bar_index + 30
                            bTP = box.new(x1, entryP, x2, tpP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 80))
                            bSL = box.new(x1, slP, x2, entryP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 80))
                            ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir,    -1)
                            array.push(sigEntry,  entryP)
                            array.push(sigSL,     slP)
                            array.push(sigTP,     tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar,    bar_index)
                            array.push(sigRVal,   winR)
                            array.push(sigTpBox,  bTP)
                            array.push(sigSlBox,  bSL)
                            array.push(sigEntryL, ln)
                            array.push(sigBE,     false)
                            dailyTradeCount += 1
                            lookShort := false
                            break
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score function (emphasizes balanced months)
// ─────────────────────────────────────────────────────────────────────────────
function scoreResult(res) {
  if (!res || !res.success) return -999;
  const sepR  = res.sepR  || 0;
  const octR  = res.octR  || 0;
  const calmar= res.calmarRatio || 0;
  const dd    = res.maxDrawdown || 99;
  const wr    = res.winRate || 0;
  const tp    = res.avgTpPips || 0;
  const trades= res.closed || 0;

  // Hard constraints
  if (dd > 3.5) return -1;
  if (calmar < 4.0) return -1;
  if (tp < 20 || tp > 42) return -1;
  if (trades < 8) return -1;

  // Score = weighted balanced monthly R
  const minMonth = Math.min(sepR, octR);
  const totalR   = res.cumulativeR;
  
  // bonus for both months ≥ 10
  const dualBonus = (sepR >= 10 && octR >= 10) ? 100 : (sepR >= 8 && octR >= 8) ? 30 : 0;

  return minMonth * 3 + totalR * 1 + calmar * 0.5 + wr * 0.1 + dualBonus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main search
// ─────────────────────────────────────────────────────────────────────────────
const allResults = [];
let tested = 0;
let best = null;
let bestScore = -999;

function printTopN(results, n = 5) {
  const sorted = [...results].sort((a, b) => b.score - a.score).slice(0, n);
  console.log(`\n══════════════ TOP ${n} CANDIDATES SO FAR ══════════════`);
  for (const r of sorted) {
    const { cfg, res, score } = r;
    const dualTag = (res.sepR >= 10 && res.octR >= 10) ? '🎯DUAL10R' : '📊';
    console.log(`  ${dualTag} [${r.tf}] ${cfg.name}`);
    console.log(`       Sep: +${res.sepR}R | Oct: +${res.octR}R | Total: +${res.cumulativeR}R | Calmar: ${res.calmarRatio} | WR: ${res.winRate}% | Trades: ${res.closed} | AvgTP: ${res.avgTpPips}pips | DD: -${res.maxDrawdown}R | Score: ${score.toFixed(1)}`);
  }
  console.log(`${'═'.repeat(60)}\n`);
}

async function testCfg(cfg, candles, tf, tfLabel) {
  const code = generatePine(cfg);
  try {
    const res = await runBacktestOnTimeframe(candles, tf, code);
    tested++;
    const score = scoreResult(res);
    if (score > 0) {
      const entry = { cfg, res, score, tf: tfLabel, code };
      allResults.push(entry);
      allResults.sort((a, b) => b.score - a.score);

      const isNewBest = score > bestScore;
      if (isNewBest) {
        bestScore = score;
        best = entry;
        const dualTag = (res.sepR >= 10 && res.octR >= 10) ? '🎯 NEW CHAMPION — DUAL 10R!' : '⭐ New Best';
        console.log(`${dualTag} [${tfLabel}] ${cfg.name} | Sep: +${res.sepR}R | Oct: +${res.octR}R | Total: +${res.cumulativeR}R | Calmar: ${res.calmarRatio} | WR: ${res.winRate}% | Trades: ${res.closed} | AvgTP: ${res.avgTpPips}pips | DD: -${res.maxDrawdown}R`);
      }

      // Live stream to ultimate_best_strategy.json
      if (isNewBest || tested % 25 === 0) {
        try {
          const streamOut = {
            summary: { testedTotal: tested, bestScore },
            dualMonthHits: allResults.filter(r => r.res.sepR >= 10 && r.res.octR >= 10).slice(0, 20).map(r => ({
              tf: r.tf, name: r.cfg.name,
              sepR: r.res.sepR, octR: r.res.octR,
              totalR: r.res.cumulativeR, calmar: r.res.calmarRatio,
              winRate: r.res.winRate, trades: r.res.closed,
              avgTpPips: r.res.avgTpPips, maxDD: r.res.maxDrawdown,
              score: r.score, cfg: r.cfg
            })),
            top20: allResults.slice(0, 20).map(r => ({
              tf: r.tf, name: r.cfg.name,
              sepR: r.res.sepR, octR: r.res.octR,
              totalR: r.res.cumulativeR, calmar: r.res.calmarRatio,
              winRate: r.res.winRate, trades: r.res.closed,
              avgTpPips: r.res.avgTpPips, maxDD: r.res.maxDrawdown,
              score: r.score, cfg: r.cfg
            }))
          };
          fs.writeFileSync(path.join(DATA_DIR, 'ultimate_best_strategy.json'), JSON.stringify(streamOut, null, 2));
        } catch(err) {}
      }
    }
  } catch (e) {
    // silent
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid definitions
// ─────────────────────────────────────────────────────────────────────────────
const swVals       = [3, 4, 5, 6, 7, 8, 9, 10];
const rrVals       = [2.2, 2.4, 2.5, 2.6, 2.8, 3.0, 3.2, 3.5];
const sessVals     = ['ALL', 'LON_NY', 'CORE_NY', 'LONDON', 'ASIA_LON'];
const dlVals       = [0, 1, 2, 3];
const emaVals      = [false, true];
const atrVals      = [0.3, 0.42, 0.55, 0.7];
const expVals      = [25, 35, 50];
const minTpVals    = [20, 22, 25];
const maxTpVals    = [35, 38, 42];

async function searchTimeframe(label, candles, tf, swArr, rrArr, sessArr, dlArr, emaArr, atrArr, expArr, minTpArr, maxTpArr) {
  let count = 0;
  const total = swArr.length * rrArr.length * sessArr.length * dlArr.length * emaArr.length * atrArr.length;
  console.log(`\n>>> SEARCHING [${label}] — ${total} combinations <<<`);

  for (const sw of swArr) {
    for (const rr of rrArr) {
      for (const sess of sessArr) {
        for (const dl of dlArr) {
          for (const ema of emaArr) {
            for (const atr of atrArr) {
              count++;
              const cfg = {
                name: `${label}_Sw${sw}_RR${rr}_${sess}_DL${dl}_EMA${ema?1:0}_ATR${atr}`,
                swingLen: sw,
                rrRatio: rr,
                minTpPips: 22.0,
                maxTpPips: 38.0,
                atrMult: atr,
                expireBars: 35,
                maxDailyTrades: dl,
                sessionMode: sess,
                useEmaFilter: ema,
                emaLen: 50,
                useRsiFilter: false,
              };
              await testCfg(cfg, candles, tf, label);
              if (count % 50 === 0) {
                console.log(`  [${label}] Progress: ${count}/${total} | Best so far score=${bestScore.toFixed(1)}`);
                if (allResults.length > 0) printTopN(allResults, 3);
              }
            }
          }
        }
      }
    }
  }
  console.log(`  [${label}] Done: ${count} combos tested.`);
}

async function main() {
  const startTime = Date.now();

  // ── Phase 1: 5M (fastest, broadest) ────────────────────────────────────────
  await searchTimeframe(
    'M5', candles5m, '5',
    [3,4,5,6,7,8,9,10],          // swing
    [2.2, 2.5, 2.8, 3.0, 3.2],   // rr
    ['ALL', 'LON_NY', 'CORE_NY', 'LONDON'],  // session
    [0, 1, 2, 3],                 // daily limit
    [false, true],                // ema
    [0.3, 0.42, 0.55]             // atr
  );

  // ── Phase 2: 15M ────────────────────────────────────────────────────────────
  if (m15Candles.length > 0) {
    await searchTimeframe(
      'M15', m15Candles, '15',
      [3,4,5,6,7,8],
      [2.2, 2.5, 2.8, 3.0],
      ['ALL', 'LON_NY', 'CORE_NY'],
      [0, 1, 2],
      [false, true],
      [0.3, 0.42, 0.55]
    );
  }

  // ── Phase 3: 30M ────────────────────────────────────────────────────────────
  if (m30Candles.length > 0) {
    await searchTimeframe(
      'M30', m30Candles, '30',
      [3,4,5,6,7],
      [2.2, 2.5, 2.8, 3.0],
      ['ALL', 'LON_NY', 'CORE_NY'],
      [0, 1, 2],
      [false, true],
      [0.3, 0.42, 0.55]
    );
  }

  // ── Phase 4: 1H ─────────────────────────────────────────────────────────────
  if (h1Candles.length > 0) {
    await searchTimeframe(
      'H1', h1Candles, '60',
      [2,3,4,5,6],
      [2.0, 2.5, 3.0],
      ['ALL', 'LON_NY'],
      [0, 1],
      [false],
      [0.3, 0.42]
    );
  }

  // ── Phase 5: 1M (slow, careful) ─────────────────────────────────────────────
  console.log(`\n>>> SEARCHING [M1] — Large grid with 37K bars <<<`);
  const m1configs = [];
  for (const sw of [4, 5, 6, 7, 8, 9]) {
    for (const rr of [2.2, 2.5, 2.8, 3.0]) {
      for (const sess of ['LON_NY', 'CORE_NY', 'LONDON']) {
        for (const dl of [1, 2, 3]) {
          for (const atr of [0.3, 0.42, 0.55]) {
            m1configs.push({
              name: `M1_Sw${sw}_RR${rr}_${sess}_DL${dl}_ATR${atr}`,
              swingLen: sw,
              rrRatio: rr,
              minTpPips: 22.0,
              maxTpPips: 38.0,
              atrMult: atr,
              expireBars: 40,
              maxDailyTrades: dl,
              sessionMode: sess,
              useEmaFilter: false,
            });
          }
        }
      }
    }
  }

  let m1count = 0;
  console.log(`  [M1] Testing ${m1configs.length} combinations...`);
  for (const cfg of m1configs) {
    await testCfg(cfg, candles1m, '1', 'M1');
    m1count++;
    if (m1count % 30 === 0) {
      console.log(`  [M1] Progress: ${m1count}/${m1configs.length}`);
      if (allResults.length > 0) printTopN(allResults, 3);
    }
  }

  // ── Phase 6: 4H ─────────────────────────────────────────────────────────────
  if (h4Candles.length > 0) {
    await searchTimeframe(
      'H4', h4Candles, '240',
      [2,3,4,5],
      [2.0, 2.5, 3.0],
      ['ALL'],
      [0],
      [false],
      [0.3, 0.42]
    );
  }

  // ── Final Results ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`SEARCH COMPLETE — ${tested} strategies tested in ${elapsed} minutes`);
  console.log(`${'═'.repeat(70)}`);

  allResults.sort((a, b) => b.score - a.score);

  const dualHits = allResults.filter(r => r.res.sepR >= 10 && r.res.octR >= 10);
  console.log(`\n🎯 EXACT DUAL 10R HITS (Sep ≥ 10R AND Oct ≥ 10R): ${dualHits.length}`);
  for (const r of dualHits.slice(0, 10)) {
    console.log(`  ✅ [${r.tf}] ${r.cfg.name}`);
    console.log(`     Sep: +${r.res.sepR}R | Oct: +${r.res.octR}R | Total: +${r.res.cumulativeR}R | Calmar: ${r.res.calmarRatio} | WR: ${r.res.winRate}% | Trades: ${r.res.closed} | AvgTP: ${r.res.avgTpPips}pips | DD: -${r.res.maxDrawdown}R`);
    // Monte Carlo
    const mc = r.res.monteCarlo;
    if (mc) {
      console.log(`     MC: P95 MaxDD=${mc.worstDrawdownR}R | P(DD<4R)=${mc.probDrawdownUnder4R}% | P(Profit)=${mc.probProfitable}%`);
    }
  }

  printTopN(allResults, 10);

  // Save results
  const output = {
    summary: {
      testedTotal: tested,
      elapsedMinutes: parseFloat(elapsed),
      dualHits: dualHits.length,
      bestScore: bestScore,
    },
    dualMonthHits: dualHits.slice(0, 20).map(r => ({
      tf: r.tf, name: r.cfg.name,
      sepR: r.res.sepR, octR: r.res.octR,
      totalR: r.res.cumulativeR,
      calmar: r.res.calmarRatio,
      winRate: r.res.winRate,
      trades: r.res.closed,
      avgTpPips: r.res.avgTpPips,
      maxDD: r.res.maxDrawdown,
      monteCarlo: r.res.monteCarlo,
      score: r.score,
      cfg: r.cfg,
    })),
    top20: allResults.slice(0, 20).map(r => ({
      tf: r.tf, name: r.cfg.name,
      sepR: r.res.sepR, octR: r.res.octR,
      totalR: r.res.cumulativeR,
      calmar: r.res.calmarRatio,
      winRate: r.res.winRate,
      trades: r.res.closed,
      avgTpPips: r.res.avgTpPips,
      maxDD: r.res.maxDrawdown,
      monteCarlo: r.res.monteCarlo,
      score: r.score,
      cfg: r.cfg,
    })),
  };

  fs.writeFileSync(path.join(DATA_DIR, 'ultimate_best_strategy.json'), JSON.stringify(output, null, 2));
  console.log(`\nResults saved to data/ultimate_best_strategy.json`);

  // Save best Pine script
  if (best) {
    const pineDir = path.join(ROOT_DIR, 'pine_scripts');
    const fname   = `Champion_${best.tf}_Calmar${best.res.calmarRatio}_Sep${best.res.sepR}R_Oct${best.res.octR}R_BEST.pine`;
    fs.writeFileSync(path.join(pineDir, fname), best.code);
    console.log(`Best Pine script saved: pine_scripts/${fname}`);
    console.log(`\n🏆 FINAL CHAMPION: [${best.tf}] ${best.cfg.name}`);
    console.log(`   Sep: +${best.res.sepR}R | Oct: +${best.res.octR}R | Total: +${best.res.cumulativeR}R`);
    console.log(`   Calmar: ${best.res.calmarRatio} | WR: ${best.res.winRate}% | Trades: ${best.res.closed}`);
    console.log(`   AvgTP: ${best.res.avgTpPips}pips | MaxDD: -${best.res.maxDrawdown}R`);
    if (best.res.monteCarlo) {
      const mc = best.res.monteCarlo;
      console.log(`   MC(3000): P95 MaxDD=${mc.worstDrawdownR}R | P(DD<4R)=${mc.probDrawdownUnder4R}% | P(Profit)=${mc.probProfitable}%`);
    }
  } else {
    console.log(`\nNo strategy passed ALL constraints. Closest candidates:`);
    printTopN(allResults, 5);
  }
}

main().catch(console.error);
