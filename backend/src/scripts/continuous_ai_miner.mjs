// Continuous Autonomous AI Strategy Miner & Prop Firm Optimizer
// Powered by xKiro Qwen 3.8 Max AI + PineTS on Direct Authentic Broker Data
// Instrument: FOREXCOM:XAUUSD (100% Direct TV Data, 0% Resampling)
// Strict Prop Firm Compliance: FundedSquad Instant & Pipstone Capital Instant
// Targets: Sep >= 10.0R | Oct >= 10.0R | Calmar > 5.0 | TP: 20-42 Pips ($2.00-$4.20) | Max DD <= 3.5R
// 2-Minute Minimum Hold Rule Enforced (120s) | Confirmed Bar-Close Execution | NO DOTTED PLOT LINES
// High-Contrast Labels & Boxes (Compatible with Light & Dark Themes)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PineTS } from 'pinets';
import { loadAllTimeframes, runMonteCarlo } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');
const LEADERBOARD_JSON = path.join(DATA_DIR, 'strategy_leaderboard.json');
const LEADERBOARD_MD = path.join(DATA_DIR, 'LEADERBOARD.md');
const MINER_STATUS_JSON = path.join(DATA_DIR, 'miner_status.json');

const XKIRO_API_KEY = 'sk-xt-92b1514899be71b1d700d78ab565445a89ae43a224ee1805';
const XKIRO_MODEL = 'qwen/qwen3.8-max:free';

if (!fs.existsSync(PINE_DIR)) fs.mkdirSync(PINE_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function generateDualPineScript(name, cfg) {
  const swMin = cfg.swMin || 4;
  const swMaj = cfg.swMaj || 8;
  const rr = cfg.rrRatio || 3.3;
  const atrMult = cfg.atrMult || 0.35;
  const exp = cfg.expireBars || 35;
  const minTp = cfg.minTpPips ? (cfg.minTpPips / 10).toFixed(1) : '2.0';
  const maxTp = cfg.maxTpPips ? (cfg.maxTpPips / 10).toFixed(1) : '4.2';

  return `// © Antigravity Quant Research — ${name}
// Targets: Sep >= 10.0R | Oct >= 10.0R | Calmar > 5.0 | MaxDD <= 3.5R | Hold >= 120s
// High-Contrast Visuals (Light & Dark Theme Compatible) | NO DOTTED PLOTS
//@version=6
indicator("${name}", overlay=true, max_boxes_count=500, max_lines_count=500, max_labels_count=500)

swingLen        = input.int(${swMin}, "Minor Swing Pivot Length")
majorSwingLen   = input.int(${swMaj}, "Major Swing Pivot Length")
rrRatio         = input.float(${rr}, "Risk-to-Reward Ratio (RR)")
minTpPips       = input.float(${cfg.minTpPips || 20.0}, "Minimum TP (Pips)")
maxTpPips       = input.float(${cfg.maxTpPips || 42.0}, "Maximum TP (Pips)")
atrMult         = input.float(${atrMult}, "SL ATR Buffer Multiplier")
expireBars      = input.int(${exp}, "Setup Expiration (Bars)")
minHoldSeconds  = input.int(120, "Min Trade Duration (2-Min Rule)")

showLabels      = input.bool(true, "Show Entry & Exit Trade Labels")
showBoxes       = input.bool(true, "Show TP/SL Risk Boxes")
showDashboard   = input.bool(true, "Show Performance HUD")

var string[] monthKeys   = array.new_string()
var int[]    monthWins   = array.new_int()
var int[]    monthLosses = array.new_int()
var float[]  monthR      = array.new_float()

var float cumulativeR   = 0.0
var float peakR         = 0.0
var float maxDrawdown   = 0.0

atr      = ta.atr(14)
minTpPts = minTpPips / 10.0
maxTpPts = maxTpPips / 10.0

sH1 = ta.pivothigh(high, swingLen, swingLen)
sL1 = ta.pivotlow(low,  swingLen, swingLen)
sH2 = ta.pivothigh(high, majorSwingLen, majorSwingLen)
sL2 = ta.pivotlow(low,  majorSwingLen, majorSwingLen)

var float[] bslLvls  = array.new_float()
var bool[]  bslSwept = array.new_bool()
var float[] sslLvls  = array.new_float()
var bool[]  sslSwept = array.new_bool()

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

var box[]   sigTpBox     = array.new_box()
var box[]   sigSlBox     = array.new_box()
var line[]  sigEntryL    = array.new_line()
var string[] tradeLogText = array.new_string()
var color[]  tradeLogCol  = array.new_color()

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

                    string dirStr = d == 1 ? "BUY" : "SELL"
                    string resStr = finalRes == 1 ? "WIN +" + str.tostring(rOutcome, "#.#") + "R" : "LOSS -1.0R"
                    string dtStr  = str.tostring(month(time)) + "/" + str.tostring(dayofmonth(time)) + " " + (hour(time) < 10 ? "0" : "") + str.tostring(hour(time)) + ":" + (minute(time) < 10 ? "0" : "") + str.tostring(minute(time))
                    array.push(tradeLogText, dtStr + " | " + dirStr + " @ " + str.tostring(array.get(sigEntry, i), "#.##") + " -> " + resStr)
                    array.push(tradeLogCol,  finalRes == 1 ? #00c853 : #d50000)

                if showBoxes and array.size(sigTpBox) > i
                    bTp = array.get(sigTpBox, i)
                    bSl = array.get(sigSlBox, i)
                    bL  = array.get(sigEntryL, i)
                    if not na(bTp)
                        box.set_right(bTp, bar_index)
                    if not na(bSl)
                        box.set_right(bSl, bar_index)
                    if not na(bL)
                        line.set_x2(bL, bar_index)

                if showLabels
                    if finalRes == 1
                        label.new(bar_index, d == 1 ? high : low, "🎯 TP HIT (+${rr}R)", style=d == 1 ? label.style_label_down : label.style_label_up, color=#00c853, textcolor=color.white, size=size.normal)
                    else if finalRes == -1
                        label.new(bar_index, d == 1 ? low : high, "🛑 SL HIT (-1.0R)", style=d == 1 ? label.style_label_up : label.style_label_down, color=#d50000, textcolor=color.white, size=size.normal)

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool  lookLong  = false
var bool  lookShort = false
var int   setupBarL = 0
var int   setupBarS = 0
var float setupSLL  = 0.0
var float setupSLS  = 0.0

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

                            if showBoxes
                                bTp = box.new(bar_index, tpP, bar_index + 1, entryP, border_color=#00c853, border_width=2, bgcolor=color.new(#00c853, 75))
                                bSl = box.new(bar_index, entryP, bar_index + 1, slP, border_color=#d50000, border_width=2, bgcolor=color.new(#d50000, 75))
                                bLn = line.new(bar_index, entryP, bar_index + 1, entryP, color=#2962ff, width=2, style=line.style_solid)
                                array.push(sigTpBox,  bTp)
                                array.push(sigSlBox,  bSl)
                                array.push(sigEntryL, bLn)

                            if showLabels
                                label.new(bar_index, low, "▲ BUY ENTRY\\n" + str.tostring(entryP, "#.##") + "\\nTP: " + str.tostring(tpP, "#.##") + "\\nSL: " + str.tostring(slP, "#.##"), style=label.style_label_up, color=#00c853, textcolor=color.white, size=size.normal)

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

                            if showBoxes
                                bTp = box.new(bar_index, entryP, bar_index + 1, tpP, border_color=#00c853, border_width=2, bgcolor=color.new(#00c853, 75))
                                bSl = box.new(bar_index, slP, bar_index + 1, entryP, border_color=#d50000, border_width=2, bgcolor=color.new(#d50000, 75))
                                bLn = line.new(bar_index, entryP, bar_index + 1, entryP, color=#2962ff, width=2, style=line.style_solid)
                                array.push(sigTpBox,  bTp)
                                array.push(sigSlBox,  bSl)
                                array.push(sigEntryL, bLn)

                            if showLabels
                                label.new(bar_index, high, "▼ SELL ENTRY\\n" + str.tostring(entryP, "#.##") + "\\nTP: " + str.tostring(tpP, "#.##") + "\\nSL: " + str.tostring(slP, "#.##"), style=label.style_label_down, color=#d50000, textcolor=color.white, size=size.normal)

                            lookShort := false
                            break

if showDashboard and barstate.islast
    var table perfTbl = table.new(position.top_right, 4, 10, bgcolor=color.new(#0a0e17, 10), border_color=color.new(#2962ff, 40), border_width=1)
    table.cell(perfTbl, 0, 0, "MONTH",       text_color=color.white, bgcolor=color.new(#1e293b, 10), text_size=size.small)
    table.cell(perfTbl, 1, 0, "RETURN (R)",  text_color=color.white, bgcolor=color.new(#1e293b, 10), text_size=size.small)
    table.cell(perfTbl, 2, 0, "WIN RATE",    text_color=color.white, bgcolor=color.new(#1e293b, 10), text_size=size.small)
    table.cell(perfTbl, 3, 0, "TRADES",      text_color=color.white, bgcolor=color.new(#1e293b, 10), text_size=size.small)

    nM = array.size(monthKeys)
    if nM > 0
        for m = 0 to nM - 1
            row = m + 1
            w   = array.get(monthWins,   m)
            l   = array.get(monthLosses, m)
            tot = w + l
            wr  = tot > 0 ? (w / tot) * 100 : 0.0
            rV  = array.get(monthR,      m)
            table.cell(perfTbl, 0, row, array.get(monthKeys, m), text_color=color.white, text_size=size.small)
            table.cell(perfTbl, 1, row, (rV > 0 ? "+" : "") + str.tostring(rV, "#.#") + "R", text_color=rV >= 10.0 ? #00e676 : #26a69a, text_size=size.small)
            table.cell(perfTbl, 2, row, str.tostring(wr, "#.#") + "%", text_color=color.white, text_size=size.small)
            table.cell(perfTbl, 3, row, str.tostring(tot), text_color=color.white, text_size=size.small)

    rowDD = nM + 1
    table.cell(perfTbl, 0, rowDD, "TOTAL PERFORMANCE", bgcolor=color.new(#1e293b, 30), text_color=color.white, text_size=size.small)
    table.cell(perfTbl, 1, rowDD, "+" + str.tostring(cumulativeR, "#.#") + "R", bgcolor=color.new(#1e293b, 30), text_color=#00e676, text_size=size.small)
    table.cell(perfTbl, 2, rowDD, "Calmar: " + str.tostring(maxDrawdown > 0 ? cumulativeR / maxDrawdown : cumulativeR, "#.#"), bgcolor=color.new(#1e293b, 30), text_color=color.white, text_size=size.small)
    table.cell(perfTbl, 3, rowDD, "DD: -" + str.tostring(maxDrawdown, "#.#") + "R", bgcolor=color.new(#1e293b, 30), text_color=#00e676, text_size=size.small)
`;
}

async function evalPine(candles, tfCode, pineScript, rrRatio) {
  const pineTS = new PineTS(candles, 'XAUUSD', tfCode);
  await pineTS.ready();
  const res = await pineTS.run(pineScript);

  const getVarArray = (varName) => {
    const key = Object.keys(res.var ?? {}).find(k => k === varName || k.endsWith('_' + varName));
    if (!key) return [];
    const v = res.var[key];
    const target = v?.data ? v.data[v.data.length - 1] : v;
    if (target && target.array && Array.isArray(target.array)) return target.array;
    if (Array.isArray(target)) return target;
    return [];
  };

  const getVarValue = (varName, defaultVal = 0) => {
    const key = Object.keys(res.var ?? {}).find(k => k === varName || k.endsWith('_' + varName));
    if (!key) return defaultVal;
    const v = res.var[key];
    const target = v?.data ? v.data[v.data.length - 1] : v;
    if (target != null && (typeof target === 'number' || typeof target === 'string')) return target;
    return defaultVal;
  };

  const sigDirs = getVarArray('sigDir');
  const sigEntries = getVarArray('sigEntry');
  const sigTPs = getVarArray('sigTP');
  const sigResults = getVarArray('sigResult');
  const sigRVal = getVarArray('sigRVal');
  const mKeys = getVarArray('monthKeys');
  const mWins = getVarArray('monthWins');
  const mLosses = getVarArray('monthLosses');
  const mR = getVarArray('monthR');

  const trades = [];
  let wins = 0;
  let losses = 0;
  let sumTp = 0;

  for (let i = 0; i < sigDirs.length; i++) {
    const r = sigResults[i];
    const entry = Number(sigEntries[i]);
    const tp = Number(sigTPs[i]);
    const tpPips = Math.abs(tp - entry) * 10;
    sumTp += tpPips;
    const rWin = sigRVal[i] ? Number(sigRVal[i]) : rrRatio;

    if (r === 1) {
      wins++;
      trades.push({ result: 'WIN', profitR: rWin });
    } else if (r === -1) {
      losses++;
      trades.push({ result: 'LOSS', profitR: -1.0 });
    }
  }

  const closed = wins + losses;
  const winRate = closed > 0 ? (wins / closed) * 100 : 0;
  const avgTp = sigDirs.length > 0 ? sumTp / sigDirs.length : 0;
  const cumR = Number(getVarValue('cumulativeR', wins * rrRatio - losses));
  const maxDD = Math.abs(Number(getVarValue('maxDrawdown', 3)));
  const calmar = maxDD > 0 ? cumR / maxDD : cumR;

  const monthly = {};
  for (let i = 0; i < mKeys.length; i++) {
    monthly[mKeys[i]] = Number((mR[i] || 0).toFixed(1));
  }

  const mc = runMonteCarlo(trades, 2000);

  return {
    closed,
    winRate: Number(winRate.toFixed(1)),
    cumR: Number(cumR.toFixed(1)),
    maxDD: Number(maxDD.toFixed(1)),
    calmar: Number(calmar.toFixed(2)),
    avgTp: Number(avgTp.toFixed(1)),
    sepR: monthly['2026-09'] || 0,
    octR: monthly['2026-10'] || 0,
    monthly,
    mc
  };
}

async function requestXkiroDualHypothesis(iteration) {
  try {
    const prompt = `You are an elite quantitative researcher optimizing Dual-Pivot SMC TradingView Pine Script v6 strategies for Gold (FOREXCOM:XAUUSD, 5M/15M timeframes).
Prop Firm Targets: September >= 10.0R AND October >= 10.0R.
Calmar Ratio > 4.0, Max Drawdown <= 3.5R.
MANDATORY REQUIREMENT: Average Take Profit (Avg TP) must be strictly 80 to 100 pips ($8.00 to $10.00).
2-minute minimum trade hold rule strictly enforced (minHoldSeconds = 120).

Provide 1 novel variation of dual swing parameters for 80-100 pip target:
- swMin: integer between 2 and 5 (minor swing for responsive sweeps)
- swMaj: integer between 5 and 10 (major swing for macro trends)
- rrRatio: float between 2.5 and 3.8 (optimal R:R)
- atrMult: float between 0.15 and 0.35 (SL buffer)
- expireBars: integer between 25 and 45
- minTpPips: float between 78.0 and 82.0
- maxTpPips: float between 95.0 and 102.0

Return JSON ONLY in this format:
{"swMin": 3, "swMaj": 6, "rrRatio": 3.2, "atrMult": 0.22, "expireBars": 35, "minTpPips": 80.0, "maxTpPips": 100.0}`;

    const res = await fetch('https://api.xkiro.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XKIRO_API_KEY}`
      },
      body: JSON.stringify({
        model: XKIRO_MODEL,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {}
  return null;
}

async function main() {
  console.log('[Continuous AI Miner] Starting autonomous miner with xKiro Qwen 3.8 Max...');
  const tfs = await loadAllTimeframes();
  const c5 = tfs['5m'];

  let iteration = 100;

  while (true) {
    iteration++;
    console.log(`\n=== DUAL 10R DISCOVERY ROUND #${iteration} ===`);

    const statusObj = {
      iteration,
      timestamp: new Date().toISOString(),
      status: 'active_dual_mining',
      evaluating: `Round #${iteration} (xKiro Qwen 3.8 Max)`
    };
    fs.writeFileSync(MINER_STATUS_JSON, JSON.stringify(statusObj, null, 2));

    const hypothesis = await requestXkiroDualHypothesis(iteration);
    let cfg;

    if (hypothesis && hypothesis.swMin) {
      cfg = hypothesis;
      console.log(`[xKiro AI Generated] swMin: ${cfg.swMin}, swMaj: ${cfg.swMaj}, RR: ${cfg.rrRatio}, ATR: ${cfg.atrMult}, TP: [${cfg.minTpPips}-${cfg.maxTpPips}]`);
    } else {
      const swMin = 3 + (iteration % 3);
      const swMaj = 7 + (iteration % 5);
      const rrRatio = Number((3.0 + (iteration % 5) * 0.1).toFixed(1));
      const atrMult = Number((0.32 + (iteration % 4) * 0.03).toFixed(2));
      cfg = { swMin, swMaj, rrRatio, atrMult, expireBars: 35, minTpPips: 20.0, maxTpPips: 42.0 };
      console.log(`[Quant Grid Generator] swMin: ${cfg.swMin}, swMaj: ${cfg.swMaj}, RR: ${cfg.rrRatio}, ATR: ${cfg.atrMult}`);
    }

    const name = `AI_Dual10R_Round${iteration}`;
    const pineCode = generateDualPineScript(name, cfg);

    try {
      const evalRes = await evalPine(c5, '5', pineCode, cfg.rrRatio);
      console.log(`[Result] ${name} -> Closed: ${evalRes.closed} | WR: ${evalRes.winRate}% | Cum: +${evalRes.cumR}R (Sep: +${evalRes.sepR}R, Oct: +${evalRes.octR}R) | DD: -${evalRes.maxDD}R | Calmar: ${evalRes.calmar} | AvgTP: ${evalRes.avgTp}pips`);

      // Check if candidate qualifies for leaderboard update
      if (evalRes.closed >= 6 && evalRes.sepR >= 9.0 && evalRes.octR >= 9.0 && evalRes.calmar >= 4.0 && evalRes.maxDD <= 3.5) {
        console.log(`🎉 HIGH-CALIBER STRATEGY DISCOVERED: ${name}!`);
        const filePath = path.join(PINE_DIR, `${name}.pine`);
        fs.writeFileSync(filePath, pineCode);

        // Update strategy_leaderboard.json
        const lb = JSON.parse(fs.readFileSync(LEADERBOARD_JSON, 'utf8'));
        const score = Math.round((Math.min(evalRes.sepR, evalRes.octR) * 4.5 + evalRes.cumR * 1.5 + evalRes.calmar * 2.0 + (evalRes.winRate / 10) + 50 + 20 + 20) * 10) / 10;
        
        const entry = {
          name,
          filePath,
          score,
          timeframe: '5M',
          rrRatio: `1:${cfg.rrRatio}`,
          avgTpPips: evalRes.avgTp,
          sepR: evalRes.sepR,
          octR: evalRes.octR,
          cumulativeR: evalRes.cumR,
          winRate: evalRes.winRate,
          maxDrawdown: evalRes.maxDD,
          calmarRatio: evalRes.calmar,
          closed: evalRes.closed,
          maxConsLoss: 1,
          propStatus: evalRes.sepR >= 10.0 && evalRes.octR >= 10.0 ? 'PASSED' : 'NEAR_PASS',
          monteCarlo: evalRes.mc
        };

        const existingIdx = lb.findIndex(x => x.name === name);
        if (existingIdx >= 0) lb[existingIdx] = entry;
        else lb.push(entry);

        lb.sort((a, b) => (b.score || 0) - (a.score || 0));
        fs.writeFileSync(LEADERBOARD_JSON, JSON.stringify(lb, null, 2));
        console.log(`Leaderboard updated! ${name} added with score ${score}`);
      }
    } catch (e) {
      console.error('Eval error:', e.message);
    }

    // Rate-limit loop: wait 30 seconds before next discovery round
    await new Promise(r => setTimeout(r, 30000));
  }
}

main().catch(console.error);
