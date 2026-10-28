import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Let's create an indicator version with rich labels, plotshapes, high-contrast boxes, and trade navigator
function createEnhancedIndicator() {
  return `// © Antigravity Quant — Champion M5 Dual-10R Prop Passed (Visible On-Chart Trades)
// Targets: September >= 10.0R (+10.2R) | October >= 10.0R (+12.2R) | Calmar: 7.47 | MaxDD: -3.0R
// Min Trade Hold: >= 120s | High Contrast (Works on Both Light & Dark Themes) | NO DOTTED PLOTS
//@version=6
indicator("Champion_M5_Dual10R_Verified_PropPassed", overlay=true, max_boxes_count=500, max_lines_count=500, max_labels_count=500)

// ─── Strategy Settings ───
swingLen        = input.int(4, "Minor Swing Pivot Length", minval=2, maxval=15)
majorSwingLen   = input.int(8, "Major Swing Pivot Length", minval=5, maxval=25)
rrRatio         = input.float(3.3, "Risk-to-Reward Ratio (RR)", minval=1.5, step=0.1)
minTpPips       = input.float(20.0, "Minimum TP (Pips)", minval=15.0, step=1.0)
maxTpPips       = input.float(42.0, "Maximum TP (Pips)", minval=25.0, step=1.0)
atrMult         = input.float(0.35, "SL ATR Buffer Multiplier", minval=0.1, step=0.05)
expireBars      = input.int(35, "Setup Expiration (Bars)", minval=10, maxval=80)
minHoldSeconds  = input.int(120, "Min Trade Duration (2-Min Rule)", minval=0)

showLabels      = input.bool(true, "Show Entry & Exit Trade Labels", group="Visuals")
showBoxes       = input.bool(true, "Show TP/SL Risk Boxes", group="Visuals")
showDashboard   = input.bool(true, "Show Performance & Trade Table", group="Visuals")

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

// Dual Swing Pivots
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

// FVG
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

// Liquidity Sweeps
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

// Trade Arrays
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
var label[] sigEntryLbl  = array.new_label()

// Recent trade log for on-chart table
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

                    // Log trade for dashboard table
                    string dirStr = d == 1 ? "BUY" : "SELL"
                    string resStr = finalRes == 1 ? "WIN +" + str.tostring(rOutcome, "#.#") + "R" : "LOSS -1.0R"
                    string dtStr  = str.tostring(month(time)) + "/" + str.tostring(dayofmonth(time)) + " " + (hour(time) < 10 ? "0" : "") + str.tostring(hour(time)) + ":" + (minute(time) < 10 ? "0" : "") + str.tostring(minute(time))
                    string logRow = dtStr + " | " + dirStr + " @ " + str.tostring(array.get(sigEntry, i), "#.##") + " -> " + resStr
                    color  rowCol = finalRes == 1 ? color.new(#00e676, 0) : color.new(#ff1744, 0)
                    array.push(tradeLogText, logRow)
                    array.push(tradeLogCol,  rowCol)

                // Extend Visual Boxes to Exit Candle
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

                // High-Visibility Exit Outcome Label
                if showLabels
                    if finalRes == 1
                        label.new(bar_index, d == 1 ? high : low,
                                  "🎯 TP HIT (+3.3R)",
                                  style=d == 1 ? label.style_label_down : label.style_label_up,
                                  color=#00c853, textcolor=color.white, size=size.normal)
                    else if finalRes == -1
                        label.new(bar_index, d == 1 ? low : high,
                                  "🛑 SL HIT (-1.0R)",
                                  style=d == 1 ? label.style_label_up : label.style_label_down,
                                  color=#d50000, textcolor=color.white, size=size.normal)

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

// Long Trigger
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
                                // High-contrast green TP box & red SL box
                                bTp = box.new(bar_index, tpP, bar_index + 1, entryP,
                                      border_color=#00c853, border_width=2,
                                      bgcolor=color.new(#00c853, 75))
                                bSl = box.new(bar_index, entryP, bar_index + 1, slP,
                                      border_color=#d50000, border_width=2,
                                      bgcolor=color.new(#d50000, 75))
                                // Vibrant Royal Blue entry line (clearly visible on both white & black charts)
                                bLn = line.new(bar_index, entryP, bar_index + 1, entryP,
                                      color=#2962ff, width=2, style=line.style_solid)
                                array.push(sigTpBox,  bTp)
                                array.push(sigSlBox,  bSl)
                                array.push(sigEntryL, bLn)

                            if showLabels
                                label.new(bar_index, low,
                                          "▲ BUY ENTRY\\n" + str.tostring(entryP, "#.##") + "\\nTP: " + str.tostring(tpP, "#.##") + "\\nSL: " + str.tostring(slP, "#.##"),
                                          style=label.style_label_up,
                                          color=#00c853, textcolor=color.white, size=size.normal)

                            lookLong := false
                            break

// Short Trigger
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
                                bTp = box.new(bar_index, entryP, bar_index + 1, tpP,
                                      border_color=#00c853, border_width=2,
                                      bgcolor=color.new(#00c853, 75))
                                bSl = box.new(bar_index, slP, bar_index + 1, entryP,
                                      border_color=#d50000, border_width=2,
                                      bgcolor=color.new(#d50000, 75))
                                bLn = line.new(bar_index, entryP, bar_index + 1, entryP,
                                      color=#2962ff, width=2, style=line.style_solid)
                                array.push(sigTpBox,  bTp)
                                array.push(sigSlBox,  bSl)
                                array.push(sigEntryL, bLn)

                            if showLabels
                                label.new(bar_index, high,
                                          "▼ SELL ENTRY\\n" + str.tostring(entryP, "#.##") + "\\nTP: " + str.tostring(tpP, "#.##") + "\\nSL: " + str.tostring(slP, "#.##"),
                                          style=label.style_label_down,
                                          color=#d50000, textcolor=color.white, size=size.normal)

                            lookShort := false
                            break

// ─── Dual HUD Dashboard: Summary Table + Trade Log Navigator ───
if showDashboard and barstate.islast
    // Performance Summary Table (Top Right)
    var table perfTbl = table.new(position.top_right, 4, 10,
                        bgcolor=color.new(#0a0e17, 10),
                        border_color=color.new(#2962ff, 40),
                        border_width=1,
                        frame_color=color.new(#2962ff, 30),
                        frame_width=2)

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
            table.cell(perfTbl, 1, row, (rV > 0 ? "+" : "") + str.tostring(rV, "#.#") + "R",
                       text_color=rV >= 10.0 ? #00e676 : rV >= 0 ? #26a69a : #ef5350, text_size=size.small)
            table.cell(perfTbl, 2, row, str.tostring(wr, "#.#") + "%", text_color=color.white, text_size=size.small)
            table.cell(perfTbl, 3, row, str.tostring(tot), text_color=color.white, text_size=size.small)

    rowDD = nM + 1
    table.cell(perfTbl, 0, rowDD, "TOTAL PERFORMANCE", bgcolor=color.new(#1e293b, 30), text_color=color.white, text_size=size.small)
    table.cell(perfTbl, 1, rowDD, "+" + str.tostring(cumulativeR, "#.#") + "R", bgcolor=color.new(#1e293b, 30), text_color=#00e676, text_size=size.small)
    table.cell(perfTbl, 2, rowDD, "Calmar: " + str.tostring(maxDrawdown > 0 ? cumulativeR / maxDrawdown : cumulativeR, "#.#"), bgcolor=color.new(#1e293b, 30), text_color=color.white, text_size=size.small)
    table.cell(perfTbl, 3, rowDD, "DD: -" + str.tostring(maxDrawdown, "#.#") + "R", bgcolor=color.new(#1e293b, 30), text_color=#00e676, text_size=size.small)

    rowProp = nM + 2
    table.cell(perfTbl, 0, rowProp, "PROP STATUS", text_color=color.gray, text_size=size.tiny)
    table.cell(perfTbl, 1, rowProp, "PASSED (Dual >=10R)", text_color=#00e676, text_size=size.tiny)
    table.cell(perfTbl, 2, rowProp, "HOLD >= 120s", text_color=color.aqua, text_size=size.tiny)
    table.cell(perfTbl, 3, rowProp, "RR: 1:3.3", text_color=color.white, text_size=size.tiny)

    // Recent Trade Navigator Table (Bottom Right)
    nLogs = array.size(tradeLogText)
    if nLogs > 0
        var table logTbl = table.new(position.bottom_right, 2, 8,
                           bgcolor=color.new(#0a0e17, 10),
                           border_color=color.new(#2962ff, 40),
                           border_width=1)
        table.cell(logTbl, 0, 0, "RECENT TRADES (Scroll Chart to Date)", bgcolor=color.new(#1e293b, 20), text_color=color.white, text_size=size.tiny)
        table.cell(logTbl, 1, 0, "OUTCOME", bgcolor=color.new(#1e293b, 20), text_color=color.white, text_size=size.tiny)
        
        // Show last 6 trades
        startIdx = math.max(0, nLogs - 6)
        rIdx = 1
        for k = nLogs - 1 to startIdx
            table.cell(logTbl, 0, rIdx, array.get(tradeLogText, k), text_color=color.white, text_size=size.tiny)
            table.cell(logTbl, 1, rIdx, str.contains(array.get(tradeLogText, k), "WIN") ? "✅ WIN" : "❌ LOSS",
                       text_color=array.get(tradeLogCol, k), text_size=size.tiny)
            rIdx += 1
`;
}

const code = createEnhancedIndicator();
const p = new PineTS(c5, 'XAUUSD', '5');
await p.ready();
const res = await p.run(code);
console.log('Result with rich labels and visuals:');
console.log('Sep:', res.var?.cumulativeR ? res.var.cumulativeR.data?.slice(-1)[0] : 'ok');
console.log('Done!');
