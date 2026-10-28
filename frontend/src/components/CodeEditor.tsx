import React, { useState, useEffect } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Configure Monaco to use local npm package instead of downloading from CDN
loader.config({ monaco });

import {
  Play,
  RotateCcw,
  Save,
  Bookmark,
  Sparkles,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  PanelBottom,
  PanelRight,
  Code,
} from 'lucide-react';
import type { SavedScript } from '../api/client';

export interface CodeEditorProps {
  script: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  isExecuting: boolean;
  savedScripts: SavedScript[];
  onSaveScript: (name: string) => void;
  onLoadScript: (script: SavedScript) => void;
  maxBars: number;
  onMaxBarsChange: (bars: number) => void;
  layout?: 'bottom' | 'side';
  onToggleLayout?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  onClose?: () => void;
  activeScriptName?: string;
  onScriptNameChange?: (name: string) => void;
  selectedEngine?: 'auto' | 'pinets' | 'pynecore' | 'openpinescript' | 'native';
  onSelectEngine?: (engine: 'auto' | 'pinets' | 'pynecore' | 'openpinescript' | 'native') => void;
}


export const SAMPLE_SCRIPTS: Record<string, { name: string; script: string; category?: string; source?: string; description?: string }> = {
  liquidity_sweep_signals: {
    name: 'Liquidity Sweep Signals [EVLabs]',
    script: `// This source code is subject to the terms of the Mozilla Public License 2.0
// © EVLabs
//@version=6
indicator("Liquidity Sweep Signals", shorttitle="LSS", overlay=true,
         max_labels_count=300, max_lines_count=300, max_boxes_count=300)

// ─── Inputs ───────────────────────────────────────────────────────────────────
swingLen   = input.int(10,    "Swing Length",              minval=3,  maxval=50,  group="Detection")
maxLevels  = input.int(5,     "Max Liq Levels",            minval=1,  maxval=10,  group="Detection")
atrMult    = input.float(0.5, "SL ATR Buffer",             minval=0.1, step=0.1,  group="Risk")
rrRatio    = input.float(2.0, "R:R Ratio",                 minval=0.5, step=0.1,  group="Risk")
expireBars = input.int(30,    "Expire setup after N bars", minval=3,  maxval=200, group="Risk")
statsLen   = input.int(20,    "Stats: Last N Signals",     minval=5,  maxval=100, group="Stats")
showDebug  = input.bool(true, "Show setup markers",        group="Stats")
sessionLon = input.session("0700-1200", "London Session",  group="Sessions")
sessionNY  = input.session("1330-2000", "NY Session",      group="Sessions")
longCol    = input.color(color.new(#26a69a, 0), "Long Color",  group="Visuals")
shortCol   = input.color(color.new(#ef5350, 0), "Short Color", group="Visuals")
boxWidth   = input.int(30, "Box Width after entry (bars)", minval=5, maxval=100, group="Visuals")
showMonthlyStats = input.bool(true, "Show Monthly Stats Table", group="Visuals")

var string[] monthKeys = array.new_string()
var int[]    monthWins = array.new_int()
var int[]    monthLosses = array.new_int()
var float[]  monthR = array.new_float()

var int firstBarTime = time

var float currentDrawdown = 0.0
var float maxDrawdown = 0.0
var float peakR = 0.0
var float cumulativeR = 0.0

var float currentConsWinR = 0.0
var float maxConsWinR = 0.0
var float currentConsLossR = 0.0
var float maxConsLossR = 0.0

// ─── Session ──────────────────────────────────────────────────────────────────
inLondon  = not na(time(timeframe.period, sessionLon, "Europe/Berlin"))
inNY      = not na(time(timeframe.period, sessionNY,  "America/New_York"))
inSession = inLondon or inNY

atr = ta.atr(14)

// ─── Pivots → Liquidity ───────────────────────────────────────────────────────
swingH = ta.pivothigh(high, swingLen, swingLen)
swingL = ta.pivotlow(low,  swingLen, swingLen)

var float[] bslLvls  = array.new_float()
var bool[]  bslSwept = array.new_bool()
var float[] sslLvls  = array.new_float()
var bool[]  sslSwept = array.new_bool()

f_trimLiq(float[] lvls, bool[] sw, int maxN) =>
    while array.size(lvls) > maxN
        array.shift(lvls)
        array.shift(sw)

if not na(swingH)
    array.push(bslLvls, swingH)
    array.push(bslSwept, false)
    f_trimLiq(bslLvls, bslSwept, maxLevels)

if not na(swingL)
    array.push(sslLvls, swingL)
    array.push(sslSwept, false)
    f_trimLiq(sslLvls, sslSwept, maxLevels)

// ─── FVG ──────────────────────────────────────────────────────────────────────
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

maxFvg = 20
while array.size(bFvgTop) > maxFvg
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > maxFvg
    array.shift(sFvgTop)
    array.shift(sFvgBot)
    array.shift(sFvgBar)

// ─── Sweeps ───────────────────────────────────────────────────────────────────
sslSweep  = false
bslSweep  = false
sweepLow  = 0.0
sweepHigh = 0.0

nb = array.size(sslLvls)
if nb > 0
    for i = 0 to nb - 1
        if not array.get(sslSwept, i)
            lvl = array.get(sslLvls, i)
            if low < lvl and close > lvl
                array.set(sslSwept, i, true)
                sslSweep := true
                sweepLow := low

nc = array.size(bslLvls)
if nc > 0
    for i = 0 to nc - 1
        if not array.get(bslSwept, i)
            lvl = array.get(bslLvls, i)
            if high > lvl and close < lvl
                array.set(bslSwept, i, true)
                bslSweep := true
                sweepHigh := high

// ─── Signal tracking ──────────────────────────────────────────────────────────
var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()
var box[]   sigTpBox  = array.new_box()
var box[]   sigSlBox  = array.new_box()
var line[]  sigEntryL = array.new_line()

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d        = array.get(sigDir, i)
            tp       = array.get(sigTP,  i)
            sl       = array.get(sigSL,  i)
            age      = bar_index - array.get(sigBar, i)
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
                        array.set(monthR, idx, array.get(monthR, idx) + rrRatio)
                        
                        currentConsLossR := 0.0
                        currentConsWinR += rrRatio
                        if currentConsWinR > maxConsWinR
                            maxConsWinR := currentConsWinR
                            
                        cumulativeR += rrRatio
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
                        float currentDD = peakR - cumulativeR
                        if currentDD > maxDrawdown
                            maxDrawdown := currentDD

                box.set_right(array.get(sigTpBox,  i), bar_index)
                box.set_right(array.get(sigSlBox,  i), bar_index)
                line.set_x2(array.get(sigEntryL,   i), bar_index)

hasOpen = false
nSig2 = array.size(sigResult)
if nSig2 > 0
    for i = 0 to nSig2 - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

while array.size(sigDir) > statsLen
    array.shift(sigDir)
    array.shift(sigEntry)
    array.shift(sigSL)
    array.shift(sigTP)
    array.shift(sigResult)
    array.shift(sigBar)
    array.shift(sigTpBox)
    array.shift(sigSlBox)
    array.shift(sigEntryL)

// ─── Setup state ─────────────────────────────────────────────────────────────
var bool  lookLong  = false
var bool  lookShort = false
var int   setupBarL = 0
var int   setupBarS = 0
var float setupSLL  = 0.0
var float setupSLS  = 0.0
var int   lastBias  = 0

if sslSweep and inSession and not hasOpen
    lookLong  := true
    lookShort := false
    setupBarL := bar_index
    setupSLL  := sweepLow - atr * atrMult
    lastBias  := 1
    if showDebug
        label.new(bar_index, low, "SSL▲", style=label.style_label_up,
                  color=color.new(longCol, 50), textcolor=color.white, size=size.tiny)

if bslSweep and inSession and not hasOpen
    lookShort := true
    lookLong  := false
    setupBarS := bar_index
    setupSLS  := sweepHigh + atr * atrMult
    lastBias  := -1
    if showDebug
        label.new(bar_index, high, "BSL▼", style=label.style_label_down,
                  color=color.new(shortCol, 50), textcolor=color.white, size=size.tiny)

if not inSession
    lookLong  := false
    lookShort := false

if lookLong  and (bar_index - setupBarL) > expireBars
    lookLong  := false
if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

// ─── Entry ────────────────────────────────────────────────────────────────────
newLong  = false
newShort = false

if lookLong and not hasOpen
    nf = array.size(bFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(bFvgBar, i) > setupBarL
                fTop = array.get(bFvgTop, i)
                fBot = array.get(bFvgBot, i)
                mid  = (fTop + fBot) / 2
                if low <= fTop and close > fBot
                    entryP = mid
                    slP    = setupSLL
                    slDist = entryP - slP
                    if slDist > 0
                        tpP = entryP + slDist * rrRatio
                        x1  = bar_index
                        x2  = bar_index + boxWidth
                        bTP = box.new(x1, tpP, x2, entryP,
                                      border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75),
                                      text="TP " + str.tostring(tpP, "#.#####"),
                                      text_color=color.new(color.white, 20),
                                      text_size=size.small, text_halign=text.align_right, text_valign=text.align_top)
                        bSL = box.new(x1, entryP, x2, slP,
                                      border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75),
                                      text="SL " + str.tostring(slP, "#.#####"),
                                      text_color=color.new(color.white, 20),
                                      text_size=size.small, text_halign=text.align_right, text_valign=text.align_bottom)
                        ln = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                        label.new(x1, entryP, "▶ LONG  " + str.tostring(entryP, "#.#####"),
                                  style=label.style_label_right, color=color.white, textcolor=color.black, size=size.small)
                        array.push(sigDir, 1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigTpBox, bTP)
                        array.push(sigSlBox, bSL)
                        array.push(sigEntryL, ln)
                        
                        string longJson = '{\\n  "action": "buy",\\n  "symbol": "' + syminfo.ticker + '",\\n  "entry_price": ' + str.tostring(entryP) + ',\\n  "sl": ' + str.tostring(slP) + ',\\n  "tp": ' + str.tostring(tpP) + ',\\n  "cmp": ' + str.tostring(close) + '\\n}'
                        alert(longJson, alert.freq_once_per_bar)
                        
                        lookLong := false
                        newLong  := true
                        break

if lookShort and not hasOpen
    nf = array.size(sFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(sFvgBar, i) > setupBarS
                fTop = array.get(sFvgTop, i)
                fBot = array.get(sFvgBot, i)
                mid  = (fTop + fBot) / 2
                if high >= fBot and close < fTop
                    entryP = mid
                    slP    = setupSLS
                    slDist = slP - entryP
                    if slDist > 0
                        tpP = entryP - slDist * rrRatio
                        x1  = bar_index
                        x2  = bar_index + boxWidth
                        bTP = box.new(x1, entryP, x2, tpP,
                                      border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75),
                                      text="TP " + str.tostring(tpP, "#.#####"),
                                      text_color=color.new(color.white, 20),
                                      text_size=size.small, text_halign=text.align_right, text_valign=text.align_bottom)
                        bSL = box.new(x1, slP, x2, entryP,
                                      border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75),
                                      text="SL " + str.tostring(slP, "#.#####"),
                                      text_color=color.new(color.white, 20),
                                      text_size=size.small, text_halign=text.align_right, text_valign=text.align_bottom)
                        ln = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                        label.new(x1, entryP, "▶ SHORT  " + str.tostring(entryP, "#.#####"),
                                  style=label.style_label_right, color=color.white, textcolor=color.black, size=size.small)
                        array.push(sigDir, -1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigTpBox, bTP)
                        array.push(sigSlBox, bSL)
                        array.push(sigEntryL, ln)
                        
                        string shortJson = '{\\n  "action": "sell",\\n  "symbol": "' + syminfo.ticker + '",\\n  "entry_price": ' + str.tostring(entryP) + ',\\n  "sl": ' + str.tostring(slP) + ',\\n  "tp": ' + str.tostring(tpP) + ',\\n  "cmp": ' + str.tostring(close) + '\\n}'
                        alert(shortJson, alert.freq_once_per_bar)
                        
                        lookShort := false
                        newShort  := true
                        break

// ─── Stats table ─────────────────────────────────────────────────────────────
var table tbl = table.new(position.top_right, 2, 8,
                           bgcolor=color.new(color.black, 75), border_width=1,
                           border_color=color.new(color.gray, 60))

var table mTbl = table.new(position.bottom_right, 4, 100,
                           bgcolor=color.new(color.black, 75), border_width=1,
                           border_color=color.new(color.gray, 60))

if barstate.islast
    wins   = 0
    losses = 0
    openS  = 0
    exp    = 0
    n = array.size(sigResult)
    if n > 0
        for i = 0 to n - 1
            r = array.get(sigResult, i)
            if r == 1
                wins += 1
            else if r == -1
                losses += 1
            else if r == 2
                exp += 1
            else
                openS += 1
    total = wins + losses
    wr    = total > 0 ? wins / total * 100 : 0.0
    wrCol = wr >= 50 ? color.new(#26a69a, 0) : color.new(#ef5350, 0)

    biasStr = lastBias == 1 ? "Bullish ▲" : lastBias == -1 ? "Bearish ▼" : "–"
    biasCol = lastBias == 1 ? color.new(#26a69a, 0) : lastBias == -1 ? color.new(#ef5350, 0) : color.new(color.gray, 0)

    table.cell(tbl, 0, 0, "EV LSS",   text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
    table.cell(tbl, 1, 0, "Signals",  text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
    table.cell(tbl, 0, 1, "Bias",     text_color=color.gray, text_size=size.small)
    table.cell(tbl, 1, 1, biasStr,    text_color=biasCol,    text_size=size.normal)
    table.cell(tbl, 0, 2, "Win Rate", text_color=color.gray, text_size=size.small)
    table.cell(tbl, 1, 2, str.tostring(wr, "#.0") + "%", text_color=wrCol, text_size=size.normal)
    table.cell(tbl, 0, 3, "Wins",     text_color=color.gray, text_size=size.small)
    table.cell(tbl, 1, 3, str.tostring(wins),   text_color=color.new(#26a69a, 0), text_size=size.small)
    table.cell(tbl, 0, 4, "Losses",   text_color=color.gray, text_size=size.small)
    table.cell(tbl, 1, 4, str.tostring(losses), text_color=color.new(#ef5350, 0), text_size=size.small)
    table.cell(tbl, 0, 5, "Expired",  text_color=color.gray, text_size=size.small)
    table.cell(tbl, 1, 5, str.tostring(exp),    text_color=color.gray,            text_size=size.small)
    table.cell(tbl, 0, 6, "Open",     text_color=color.gray, text_size=size.small)
    table.cell(tbl, 1, 6, str.tostring(openS),  text_color=color.white,           text_size=size.small)
    table.cell(tbl, 0, 7, "Sample",   text_color=color.gray, text_size=size.small)
    table.cell(tbl, 1, 7, str.tostring(total) + "/" + str.tostring(statsLen), text_color=color.gray, text_size=size.small)

    if showMonthlyStats
        table.cell(mTbl, 0, 0, "Month",   text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 1, 0, "Returns (R)", text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 2, 0, "Winrate", text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 3, 0, "Trades",  text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        
        int mSize = array.size(monthKeys)
        int lastRow = 0
        if mSize > 0
            int maxShow = math.min(mSize, 95)
            for i = 0 to maxShow - 1
                int mIdx = mSize - 1 - i
                string mStr = array.get(monthKeys, mIdx)
                int mWins = array.get(monthWins, mIdx)
                int mLosses = array.get(monthLosses, mIdx)
                float mR = array.get(monthR, mIdx)
                int mTrades = mWins + mLosses
                float mWr = mTrades > 0 ? (mWins * 100.0) / mTrades : 0.0
                
                color rCol = mR > 0 ? color.new(#26a69a, 0) : mR < 0 ? color.new(#ef5350, 0) : color.gray
                color wrCol = mWr >= 50 ? color.new(#26a69a, 0) : color.new(#ef5350, 0)
                
                table.cell(mTbl, 0, i + 1, mStr, text_color=color.white, text_size=size.small)
                table.cell(mTbl, 1, i + 1, str.tostring(mR, "#.##") + "R", text_color=rCol, text_size=size.small)
                table.cell(mTbl, 2, i + 1, str.tostring(mWr, "#.0") + "%", text_color=wrCol, text_size=size.small)
                table.cell(mTbl, 3, i + 1, str.tostring(mTrades), text_color=color.white, text_size=size.small)
                lastRow := i + 1
                
        table.cell(mTbl, 0, lastRow + 1, "Max Drawdown", text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 1, lastRow + 1, "-" + str.tostring(maxDrawdown, "#.##") + "R", text_color=color.new(#ef5350, 0), text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 2, lastRow + 1, "", bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 3, lastRow + 1, "", bgcolor=color.new(color.black, 50))
        
        table.cell(mTbl, 0, lastRow + 2, "Cons Win", text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 1, lastRow + 2, "+" + str.tostring(maxConsWinR, "#.##") + "R", text_color=color.new(#26a69a, 0), text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 2, lastRow + 2, "", bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 3, lastRow + 2, "", bgcolor=color.new(color.black, 50))
        
        table.cell(mTbl, 0, lastRow + 3, "Cons Loss", text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 1, lastRow + 3, "-" + str.tostring(maxConsLossR, "#.##") + "R", text_color=color.new(#ef5350, 0), text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 2, lastRow + 3, "", bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 3, lastRow + 3, "", bgcolor=color.new(color.black, 50))
        
        table.cell(mTbl, 0, lastRow + 4, "Data From", text_color=color.gray, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 1, lastRow + 4, str.format("{0,date,yyyy-MM-dd HH:mm}", firstBarTime), text_color=color.white, text_size=size.small, bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 2, lastRow + 4, "", bgcolor=color.new(color.black, 50))
        table.cell(mTbl, 3, lastRow + 4, "", bgcolor=color.new(color.black, 50))

// ─── Alerts ───────────────────────────────────────────────────────────────────
alertcondition(newLong,             "LSS Long",  "EV LSS — LONG {{ticker}} {{interval}}")
alertcondition(newShort,            "LSS Short", "EV LSS — SHORT {{ticker}} {{interval}}")
alertcondition(newLong or newShort, "LSS Any",   "EV LSS — Signal {{ticker}} {{interval}}")
`,
  },
  volumetric_order_flow: {
    name: 'Volumetric Order Flow (Vela Demo)',
    category: 'Smart Money',
    source: 'LuxAlgo (CC BY-NC-SA 4.0)',
    description: 'Tracks pivot-based liquidity zones with EMA/SMA structure overlays.',
    script: `// © LuxAlgo · CC BY-NC-SA 4.0
//@version=6
indicator("Volumetric Order Flow Structure", overlay = true,
     max_boxes_count = 500, max_lines_count = 500, max_labels_count = 500)

color BULL_COLOR = #089981
color BEAR_COLOR = #f23645
color POC_COLOR  = #ff9800

pivotLenInput         = input.int(3, "Pivot Length", minval = 1, group = "Detection")
volLookbackInput      = input.int(20, "Volume Lookback", minval = 1, group = "Detection")
maxObsInput           = input.int(5, "Max Recent Blocks", minval = 1, group = "Visuals")
showManipulationInput = input.bool(true, "Show Manipulation Bubbles", group = "Manipulation")

ph = ta.pivothigh(pivotLenInput, pivotLenInput)
pl = ta.pivotlow(pivotLenInput, pivotLenInput)

// Trend structure and dynamic levels
ema20 = ta.ema(close, 20)
sma50 = ta.sma(close, 50)
plot(ema20, "Fast EMA", color=color.orange, linewidth=2)
plot(sma50, "Trend SMA", color=color.blue, linewidth=2)
`,
  },
  smc: {
    name: 'Smart Money Concepts (LuxAlgo)',
    category: 'Smart Money',
    source: 'LuxAlgo',
    description: 'Identifies swing highs/lows, liquidity pools and equilibrium levels.',
    script: `//@version=5
indicator("Smart Money Concepts [LuxAlgo]", overlay=true)

length = input.int(5, "Swing High/Low Length")
showBOS = input.bool(true, "Show BOS & CHoCH")

hi = ta.highest(high, length)
lo = ta.lowest(low, length)
mid = (hi + lo) / 2

plot(mid, "Equilibrium", color=color.gray, linewidth=1)
plot(hi, "Swing High / Liquidity", color=color.green, linewidth=2)
plot(lo, "Swing Low / Liquidity", color=color.red, linewidth=2)
`,
  },
  ema_cross: {
    name: 'EMA 9 / 21 Cross (Alorse)',
    category: 'Trend',
    source: 'github.com/Alorse/pinescript-strategies',
    description: 'Fast/slow EMA crossover for trend direction and entry signals.',
    script: `//@version=5
// Source: Alorse/pinescript-strategies (MIT)
// Adapted from "5 EMA SMA + Cross.pine"
indicator("EMA Cross [9/21]", overlay=true)

fastLength = input.int(9,  "Fast EMA Length", minval=1)
slowLength = input.int(21, "Slow EMA Length", minval=1)

fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)

bullCross = ta.crossover(fastEMA, slowEMA)
bearCross = ta.crossunder(fastEMA, slowEMA)

plot(fastEMA, title="Fast EMA 9",  color=#3b82f6, linewidth=2)
plot(slowEMA, title="Slow EMA 21", color=#ef4444, linewidth=2)

plotshape(bullCross, title="Bullish Cross", location=location.belowbar, style=shape.triangleup,   size=size.small, color=#26a69a)
plotshape(bearCross, title="Bearish Cross", location=location.abovebar, style=shape.triangledown, size=size.small, color=#ef5350)

bgcolor(ta.crossover(fastEMA, slowEMA) ? color.new(#26a69a, 85) : ta.crossunder(fastEMA, slowEMA) ? color.new(#ef5350, 85) : na)
`,
  },
  rsi: {
    name: 'RSI + Divergence (Alorse)',
    category: 'Oscillators',
    source: 'github.com/Alorse/pinescript-strategies',
    description: 'RSI with overbought/oversold zones and divergence detection. Adapted from Alorse.',
    script: `//@version=5
// Source: Alorse/pinescript-strategies (MIT)
// Adapted from "RSI Divergence.pine"
indicator("RSI + Divergence [Alorse]", overlay=false, max_lines_count=300, max_labels_count=300)

rsiLength = input.int(14, "RSI Length", minval=1)
overbought = input.int(70, "Overbought", minval=50, maxval=100)
oversold   = input.int(30, "Oversold",   minval=0,  maxval=50)
lbR = input.int(5, "Pivot Lookback Right", minval=1)
lbL = input.int(5, "Pivot Lookback Left",  minval=1)

rsiVal = ta.rsi(close, rsiLength)
rsiEma  = ta.ema(rsiVal, 5)

// Divergence detection using pivots
plFound = not na(ta.pivotlow(rsiVal, lbL, lbR))
phFound = not na(ta.pivothigh(rsiVal, lbL, lbR))

plot(rsiVal,  title="RSI",       color=#8b5cf6, linewidth=2)
plot(rsiEma,  title="RSI EMA 5", color=#f59e0b, linewidth=1)
plot(overbought, "Overbought", color=color.new(#ef4444, 50), linewidth=1)
plot(oversold,   "Oversold",   color=color.new(#10b981, 50), linewidth=1)
plot(50, "Midline", color=color.new(color.gray, 70), linewidth=1)

bgcolor(rsiVal > overbought ? color.new(#ef4444, 90) : rsiVal < oversold ? color.new(#10b981, 90) : na)
`,
  },
  bollinger_bands: {
    name: 'Bollinger Bands + Squeeze',
    category: 'Volatility',
    source: 'Classic / Multiple repos',
    description: 'Bollinger Bands with squeeze detection and %B indicator.',
    script: `//@version=5
// Bollinger Bands with Squeeze Detection
// Inspired by: Alorse/pinescript-strategies "BB Winner.pine"
indicator("Bollinger Bands + Squeeze", overlay=true)

length    = input.int(20, "BB Length", minval=1)
mult      = input.float(2.0, "BB Multiplier", step=0.1)
keltMult  = input.float(1.5, "Keltner Multiplier (Squeeze)", step=0.1)

basis = ta.sma(close, length)
dev   = mult * ta.stdev(close, length)
upper = basis + dev
lower = basis - dev

// Keltner Channels for Squeeze
keltUpper = basis + keltMult * ta.atr(length)
keltLower = basis - keltMult * ta.atr(length)

// Squeeze = BB inside Keltner
inSqueeze = upper < keltUpper and lower > keltLower

plot(upper, "Upper Band", color=#06b6d4, linewidth=1)
plot(basis, "Basis SMA", color=#f59e0b, linewidth=2)
plot(lower, "Lower Band", color=#06b6d4, linewidth=1)

bgcolor(inSqueeze ? color.new(#f59e0b, 88) : na, title="Squeeze Zone")

barcolor(close > upper ? color.lime : close < lower ? color.red : na)
`,
  },
  macd: {
    name: 'MACD + Signal (12, 26, 9)',
    category: 'Momentum',
    source: 'Classic Pine Script v5',
    description: 'Standard MACD with MACD line, signal line, and colour-coded histogram.',
    script: `//@version=5
// MACD - Standard Implementation
// Compatible with PineTS open-source runtime (github.com/LuxAlgo/PineTS)
indicator("MACD [12, 26, 9]", overlay=false)

fastLength   = input.int(12, "Fast Length",    minval=1)
slowLength   = input.int(26, "Slow Length",    minval=1)
signalLength = input.int(9,  "Signal Length",  minval=1)

fastMA = ta.ema(close, fastLength)
slowMA = ta.ema(close, slowLength)
macdLine  = fastMA - slowMA
signalLine = ta.ema(macdLine, signalLength)
hist = macdLine - signalLine

histColor = hist >= 0 ? (hist >= hist[1] ? #26a69a : #80cbc4) : (hist <= hist[1] ? #ef5350 : #ffcdd2)

plot(macdLine,   "MACD",     color=#2962ff, linewidth=2)
plot(signalLine, "Signal",   color=#ff6d00, linewidth=2)
plot(hist,       "Histogram", color=histColor, style=plot.style_histogram, linewidth=3)
hline(0, "Zero",  color=color.new(color.gray, 60))
`,
  },
  supertrend: {
    name: 'Supertrend (Alorse)',
    category: 'Trend',
    source: 'github.com/Alorse/pinescript-strategies',
    description: 'Supertrend ATR-based trend filter with bull/bear background. Source: Alorse repo.',
    script: `//@version=5
// Source: Alorse/pinescript-strategies "SuperTrend FromScrash.pine" (MIT License)
// Adapted for PineTS v5/v6 compatibility
indicator("Supertrend [Alorse]", overlay=true)

atrPeriod  = input.int(10,  "ATR Period",     minval=1)
multiplier = input.float(3.0,"ATR Multiplier", step=0.1)

atr = ta.atr(atrPeriod)
src = hl2

// Supertrend calculation
upperBand = src + multiplier * atr
lowerBand = src - multiplier * atr

var float prevUpperBand = na
var float prevLowerBand = na
var int   trendDir      = 1

prevUpperBand := na(prevUpperBand) ? upperBand : (upperBand < prevUpperBand or close[1] > prevUpperBand) ? upperBand : prevUpperBand
prevLowerBand := na(prevLowerBand) ? lowerBand : (lowerBand > prevLowerBand or close[1] < prevLowerBand) ? lowerBand : prevLowerBand

trendDir := close > prevUpperBand ? 1 : close < prevLowerBand ? -1 : trendDir

supertrendLine = trendDir == 1 ? prevLowerBand : prevUpperBand

plot(supertrendLine, "Supertrend", color=trendDir == 1 ? #26a69a : #ef5350, linewidth=2)
bgcolor(trendDir ==  1 ? color.new(#26a69a, 92) : color.new(#ef5350, 92))
plotshape(trendDir != trendDir[1] and trendDir ==  1, title="Bull Signal", location=location.belowbar, style=shape.triangleup,   size=size.normal, color=#26a69a)
plotshape(trendDir != trendDir[1] and trendDir == -1, title="Bear Signal", location=location.abovebar, style=shape.triangledown, size=size.normal, color=#ef5350)
`,
  },
  vwap: {
    name: 'VWAP + Standard Deviations',
    category: 'Volume',
    source: 'Classic Pine Script v5 / technicalindicators npm',
    description: 'Volume-Weighted Average Price with ±1σ and ±2σ deviation bands.',
    script: `//@version=5
// VWAP with Standard Deviation Bands
// Uses ta.vwap for compatibility with PineTS (LuxAlgo/PineTS)
indicator("VWAP + StdDev Bands", overlay=true)

showBands = input.bool(true, "Show Deviation Bands")

vwapVal  = ta.vwap(hlc3)
dev      = ta.stdev(close, 20)

upper2 = vwapVal + 2 * dev
upper1 = vwapVal + 1 * dev
lower1 = vwapVal - 1 * dev
lower2 = vwapVal - 2 * dev

plot(vwapVal, "VWAP",     color=#ff9800, linewidth=2)
plot(showBands ? upper2 : na, "VWAP +2σ", color=color.new(#ef5350, 40), linewidth=1)
plot(showBands ? upper1 : na, "VWAP +1σ", color=color.new(#ef5350, 70), linewidth=1)
plot(showBands ? lower1 : na, "VWAP -1σ", color=color.new(#26a69a, 70), linewidth=1)
plot(showBands ? lower2 : na, "VWAP -2σ", color=color.new(#26a69a, 40), linewidth=1)

bgcolor(close > vwapVal ? color.new(#26a69a, 96) : color.new(#ef5350, 96))
`,
  },
  atr_stops: {
    name: 'ATR Trailing Stops (Chandelier Exit)',
    category: 'Risk Management',
    source: 'everget/tradingview-pinescript-indicators',
    description: 'ATR-based Chandelier Exit trailing stops for long and short positions.',
    script: `//@version=5
// Chandelier Exit Trailing Stops
// Adapted from everget/tradingview-pinescript-indicators (MIT)
// Classic implementation of Chandelier Exit by Charles LeBeau
indicator("ATR Trailing Stops [Chandelier Exit]", overlay=true)

atrLength = input.int(22, "ATR Length", minval=1)
atrMult   = input.float(3.0, "ATR Multiplier", step=0.1)

atr = ta.atr(atrLength)

longStop  = ta.highest(high, atrLength) - atrMult * atr
shortStop = ta.lowest(low,  atrLength) + atrMult * atr

var float longStopPrev  = na
var float shortStopPrev = na
longStopPrev  := nz(longStopPrev[1],  longStop)
shortStopPrev := nz(shortStopPrev[1], shortStop)

longStop  := close[1] > longStopPrev  ? math.max(longStop,  longStopPrev)  : longStop
shortStop := close[1] < shortStopPrev ? math.min(shortStop, shortStopPrev) : shortStop

var int dir = 1
dir := close > shortStopPrev ? 1 : close < longStopPrev ? -1 : dir

plot(dir == 1 ? longStop  : na, "Long Stop",  color=#26a69a, style=plot.style_linebr, linewidth=2)
plot(dir == -1 ? shortStop : na, "Short Stop", color=#ef5350, style=plot.style_linebr, linewidth=2)

plotshape(dir != dir[1] and dir ==  1, style=shape.triangleup,   location=location.belowbar, color=#26a69a, size=size.normal, title="Buy Signal")
plotshape(dir != dir[1] and dir == -1, style=shape.triangledown, location=location.abovebar, color=#ef5350, size=size.normal, title="Sell Signal")
`,
  },
  stoch_rsi: {
    name: 'Stochastic RSI (14, 14, 3, 3)',
    category: 'Oscillators',
    source: 'Classic Pine Script v5',
    description: 'Stochastic RSI oscillator — RSI of RSI with K and D smoothing lines.',
    script: `//@version=5
// Stochastic RSI
// Compatible with PineTS (github.com/LuxAlgo/PineTS)
indicator("Stochastic RSI", overlay=false)

rsiLength   = input.int(14, "RSI Length")
stochLength = input.int(14, "Stochastic Length")
smoothK     = input.int(3,  "K Smooth")
smoothD     = input.int(3,  "D Smooth")
overbought  = 80
oversold    = 20

rsiVal = ta.rsi(close, rsiLength)
k = ta.sma(ta.stoch(rsiVal, rsiVal, rsiVal, stochLength), smoothK)
d = ta.sma(k, smoothD)

hline(overbought, "Overbought", color=color.new(#ef5350, 50), linewidth=1)
hline(oversold,   "Oversold",   color=color.new(#26a69a, 50), linewidth=1)
hline(50, "Midline", color=color.new(color.gray, 70), linestyle=hline.style_dashed)

plot(k, "K", color=#2962ff, linewidth=2)
plot(d, "D", color=#ff6d00, linewidth=2)

bgcolor(k > overbought ? color.new(#ef5350, 88) : k < oversold ? color.new(#26a69a, 88) : na)
`,
  },
  pivot_points: {
    name: 'Pivot Points + S/R Levels',
    category: 'Support & Resistance',
    source: 'Classic / PineCoders',
    description: 'Daily/Weekly Pivot Points with Support and Resistance levels calculated from prior period OHLC.',
    script: `//@version=5
// Classic Pivot Points with Support/Resistance Levels
// Adapted from PineCoders standard implementation
indicator("Pivot Points + S/R Levels", overlay=true)

// Previous day / previous period high, low, close
var float PP = na
var float R1 = na, R2 = na, R3 = na
var float S1 = na, S2 = na, S3 = na

isNewDay = ta.change(time("D")) != 0
if isNewDay
    prevHigh  = high[1]
    prevLow   = low[1]
    prevClose = close[1]
    PP := (prevHigh + prevLow + prevClose) / 3
    R1 := 2 * PP - prevLow
    R2 := PP + (prevHigh - prevLow)
    R3 := prevHigh + 2 * (PP - prevLow)
    S1 := 2 * PP - prevHigh
    S2 := PP - (prevHigh - prevLow)
    S3 := prevLow - 2 * (prevHigh - PP)

plot(PP, "Pivot",  color=#ff9800, linewidth=2, style=plot.style_circles)
plot(R1, "R1", color=color.new(#ef5350, 20), linewidth=1)
plot(R2, "R2", color=color.new(#ef5350, 40), linewidth=1)
plot(R3, "R3", color=color.new(#ef5350, 60), linewidth=1)
plot(S1, "S1", color=color.new(#26a69a, 20), linewidth=1)
plot(S2, "S2", color=color.new(#26a69a, 40), linewidth=1)
plot(S3, "S3", color=color.new(#26a69a, 60), linewidth=1)
`,
  },
  market_structure: {
    name: 'Market Structure (BOS & CHoCH)',
    category: 'Smart Money',
    source: 'Inspired by github.com/Johnfire45/market-structure',
    description: 'Identifies Break of Structure (BOS) and Change of Character (CHoCH) for SMC analysis.',
    script: `//@version=5
// Market Structure: BOS and CHoCH
// Inspired by Johnfire45/market-structure (open source)
indicator("Market Structure [BOS & CHoCH]", overlay=true, max_labels_count=300, max_lines_count=300)

swingLength = input.int(5, "Swing Length", minval=2, maxval=50)

swingHigh = ta.pivothigh(high, swingLength, swingLength)
swingLow  = ta.pivotlow(low,  swingLength, swingLength)

var float lastHH = na
var float lastHL = na
var float lastLL = na
var float lastLH = na
var int   msBias = 0  // 1 = Bullish, -1 = Bearish

if not na(swingHigh)
    if swingHigh > nz(lastHH, swingHigh)
        msBias := 1
    lastHH := swingHigh

if not na(swingLow)
    if swingLow < nz(lastLL, swingLow)
        msBias := -1
    lastLL := swingLow

// Plot swing levels
plot(swingHigh, "Swing High", color=color.new(#ef5350, 0), style=plot.style_cross, linewidth=3)
plot(swingLow,  "Swing Low",  color=color.new(#26a69a, 0), style=plot.style_cross, linewidth=3)

// Trend lines
upperBand = ta.highest(high, swingLength * 2)
lowerBand = ta.lowest(low,  swingLength * 2)
plot(upperBand, "Highs", color=color.new(#ef5350, 60), linewidth=1)
plot(lowerBand, "Lows",  color=color.new(#26a69a, 60), linewidth=1)

bgcolor(msBias == 1 ? color.new(#26a69a, 93) : msBias == -1 ? color.new(#ef5350, 93) : na)
`,
  },
  sma_ribbon: {
    name: 'SMA Ribbon (20, 50, 100, 200)',
    category: 'Trend',
    source: 'Classic Pine Script v5',
    description: 'Multi-period SMA ribbon for long-term trend identification.',
    script: `//@version=5
// SMA Ribbon - Multiple timeframe trend gauge
indicator("SMA Ribbon [20/50/100/200]", overlay=true)

sma20  = ta.sma(close, 20)
sma50  = ta.sma(close, 50)
sma100 = ta.sma(close, 100)
sma200 = ta.sma(close, 200)

plot(sma20,  "SMA 20",  color=#22c55e, linewidth=1)
plot(sma50,  "SMA 50",  color=#3b82f6, linewidth=1)
plot(sma100, "SMA 100", color=#eab308, linewidth=2)
plot(sma200, "SMA 200", color=#ef4444, linewidth=2)

// Bull trend: price above all SMAs
bullTrend = close > sma20 and sma20 > sma50 and sma50 > sma100 and sma100 > sma200
bearTrend = close < sma20 and sma20 < sma50 and sma50 < sma100 and sma100 < sma200

bgcolor(bullTrend ? color.new(#22c55e, 94) : bearTrend ? color.new(#ef4444, 94) : na)
`,
  },
  cci: {
    name: 'CCI + Trend Zones',
    category: 'Oscillators',
    source: 'Classic / everget indicators',
    description: 'Commodity Channel Index with overbought/oversold zones and trend backdrop.',
    script: `//@version=5
// CCI - Commodity Channel Index
// Adapted for PineTS compatibility
indicator("CCI + Trend Zones", overlay=false)

length   = input.int(20, "CCI Length", minval=1)
constant = 0.015

tp = hlc3
avg = ta.sma(tp, length)
md  = ta.dev(tp, length)
cci = (tp - avg) / (constant * md)

cciSmoothed = ta.ema(cci, 5)

hline( 200, "+200 (Extreme OB)", color=color.new(#ef5350, 30), linestyle=hline.style_dashed)
hline( 100, "+100 (Overbought)", color=color.new(#ef5350, 60))
hline(   0, "Zero Line",         color=color.new(color.gray, 60))
hline(-100, "-100 (Oversold)",   color=color.new(#26a69a, 60))
hline(-200, "-200 (Extreme OS)", color=color.new(#26a69a, 30), linestyle=hline.style_dashed)

cciColor = cci > 100 ? #ef5350 : cci < -100 ? #26a69a : #8b5cf6
plot(cci,          "CCI",          color=cciColor, linewidth=2)
plot(cciSmoothed,  "CCI EMA",      color=#f59e0b,  linewidth=1)

bgcolor(cci > 100 ? color.new(#ef5350, 90) : cci < -100 ? color.new(#26a69a, 90) : na)
`,
  },
  obv_trend: {
    name: 'OBV + Trend Signal',
    category: 'Volume',
    source: 'Classic technicalindicators / Pine Script',
    description: 'On-Balance Volume with EMA-based trend signal for volume divergence analysis.',
    script: `//@version=5
// On-Balance Volume (OBV) with Trend Signal
// Uses technicalindicators library logic in PineTS
indicator("OBV + Trend Signal", overlay=false)

emaLength = input.int(21, "OBV EMA Length", minval=1)

obvVal    = ta.obv
obvEma    = ta.ema(obvVal, emaLength)
obvHist   = obvVal - obvEma

bullVol = obvVal > obvEma
bearVol = obvVal < obvEma

histColor = obvHist > 0 ? (obvHist > obvHist[1] ? #26a69a : #80cbc4) : (obvHist < obvHist[1] ? #ef5350 : #ffcdd2)

plot(obvVal,  "OBV",     color=#2962ff, linewidth=2)
plot(obvEma,  "OBV EMA", color=#ff9800, linewidth=1)
plot(obvHist, "OBV Hist", color=histColor, style=plot.style_histogram, linewidth=2)

bgcolor(bullVol ? color.new(#26a69a, 93) : color.new(#ef5350, 93))
`,
  },
  ichimoku: {
    name: 'Ichimoku Cloud',
    category: 'Trend',
    source: 'Classic Pine Script v5 / PineCoders',
    description: 'Full Ichimoku Kinko Hyo cloud with tenkan, kijun, senkou A/B, and chikou spans.',
    script: `//@version=5
// Ichimoku Cloud (Kinko Hyo)
// Standard implementation compatible with PineTS
indicator("Ichimoku Cloud", overlay=true)

conversionPeriods = input.int(9,  "Conversion Line Periods", minval=1)
basePeriods       = input.int(26, "Base Line Periods",        minval=1)
laggingSpan2Per   = input.int(52, "Lagging Span 2 Periods",   minval=1)
displacement      = input.int(26, "Displacement",              minval=1)

donchian(len) => math.avg(ta.lowest(low, len), ta.highest(high, len))

tenkan  = donchian(conversionPeriods)
kijun   = donchian(basePeriods)
senkouA = math.avg(tenkan, kijun)
senkouB = donchian(laggingSpan2Per)

plot(tenkan, "Tenkan (Conv.)",    color=#0496ff, linewidth=2)
plot(kijun,  "Kijun (Base)",      color=#991515, linewidth=2)

senkouAPlot = plot(senkouA, "Senkou A", color=#26a69a, offset=displacement-1, linewidth=1)
senkouBPlot = plot(senkouB, "Senkou B", color=#ef5350, offset=displacement-1, linewidth=1)

fill(senkouAPlot, senkouBPlot, color = senkouA > senkouB ? color.new(#26a69a, 80) : color.new(#ef5350, 80), title="Cloud")

plot(close, "Chikou", color=#459915, offset=-displacement+1, linewidth=1)
`,
  },
  pinecoders_atr_stops: {
    name: 'PineCoders: ATR Trailing Stops',
    category: 'PineCoders Hub',
    source: 'github.com/pinecoders',
    description: 'Official PineCoders standard ATR Trailing Stops with dynamic flip detection and volatility buffers.',
    script: `//@version=5
// Source: PineCoders Community Hub (github.com/pinecoders)
// Standard ATR Trailing Stop calculation
indicator("PineCoders ATR Trailing Stops", overlay=true)

length = input.int(14, "ATR Length", minval=1)
mult   = input.float(2.5, "ATR Multiplier", step=0.1)

atr = ta.atr(length)
longStop  = ta.highest(high, length) - mult * atr
shortStop = ta.lowest(low,  length) + mult * atr

var float maxLong  = na
var float minShort = na
maxLong  := close[1] > nz(maxLong[1],  longStop)  ? math.max(longStop,  nz(maxLong[1],  longStop))  : longStop
minShort := close[1] < nz(minShort[1], shortStop) ? math.min(shortStop, nz(minShort[1], shortStop)) : shortStop

var int dir = 1
dir := close > nz(minShort[1], shortStop) ? 1 : close < nz(maxLong[1], longStop) ? -1 : dir

plot(dir == 1 ? maxLong  : na, "Bull Stop", color=#10b981, linewidth=2, style=plot.style_linebr)
plot(dir == -1 ? minShort : na, "Bear Stop", color=#ef4444, linewidth=2, style=plot.style_linebr)
plotshape(dir == 1 and dir[1] == -1, "Buy Signal",  shape.triangleup,   location.belowbar, color=#10b981, size=size.small)
plotshape(dir == -1 and dir[1] == 1, "Sell Signal", shape.triangledown, location.abovebar, color=#ef4444, size=size.small)
`,
  },
  pinecoders_session_levels: {
    name: 'PineCoders: Session Levels & Breaks',
    category: 'PineCoders Hub',
    source: 'github.com/pinecoders',
    description: 'PineCoders session range tracker for London and NY sessions with high/low extensions.',
    script: `//@version=5
// Source: PineCoders Community Hub (github.com/pinecoders)
// Session Range & High/Low Levels
indicator("PineCoders Session Levels", overlay=true)

sessionTime = input.session("0800-1600", "Trading Session")
showMid     = input.bool(true, "Show Session Midpoint")

inSess = not na(time(timeframe.period, sessionTime, "UTC"))
var float sessHigh = na
var float sessLow  = na

if inSess and not inSess[1]
    sessHigh := high
    sessLow  := low
else if inSess
    sessHigh := math.max(sessHigh, high)
    sessLow  := math.min(sessLow, low)

sessMid = (sessHigh + sessLow) / 2

plot(inSess ? sessHigh : na, "Session High", color=#ef4444, linewidth=1, style=plot.style_linebr)
plot(inSess and showMid ? sessMid : na, "Session Mid", color=#f59e0b, linewidth=1, style=plot.style_linebr)
plot(inSess ? sessLow : na, "Session Low", color=#10b981, linewidth=1, style=plot.style_linebr)
`,
  },
  pinecoders_mtf_channels: {
    name: 'PineCoders: Dynamic Channels',
    category: 'PineCoders Hub',
    source: 'github.com/pinecoders',
    description: 'PineCoders Multi-Timeframe High/Low Channel with median baseline.',
    script: `//@version=5
// Source: PineCoders Community Hub (github.com/pinecoders)
// MTF Dynamic High/Low Channels
indicator("PineCoders MTF Channels", overlay=true)

len = input.int(20, "Lookback Period")
h = ta.highest(high, len)
l = ta.lowest(low, len)
mid = (h + l) / 2

plot(h, "Upper Channel",  color=#3b82f6, linewidth=1)
plot(mid, "Median Level", color=#94a3b8, linewidth=1, style=plot.style_circles)
plot(l, "Lower Channel",  color=#3b82f6, linewidth=1)
`,
  },
  pynecore_python_ema: {
    name: 'PyneCore: Dual EMA System [Python]',
    category: 'PyneSys (PyneCore)',
    source: 'github.com/PyneSys/pynecore',
    description: 'Native Python script executed with the official PyneCore engine (C-Extension).',
    script: `"""
@pyne
PyneCore Python Indicator: Dual EMA Cross
Source: https://github.com/PyneSys/pynecore
"""
from pynecore import Series
from pynecore.lib import script, input, color, ta
from pynecore.lib.plot import plot

@script.indicator(title="PyneCore EMA Crossover", overlay=True)
def main():
    fast = ta.ema(close, 12)
    slow = ta.ema(close, 26)
    plot(fast, title="Fast EMA 12", color=color.blue)
    plot(slow, title="Slow EMA 26", color=color.red)
`,
  },
  openpinescript_sma: {
    name: 'OpenPineScript: Dual SMA [ANTLR]',
    category: 'OpenPineScript',
    source: 'github.com/be-thomas/OpenPineScript',
    description: 'Classic Pine Script v2 executed directly by the OpenPineScript ANTLR parser and TypeScript runtime.',
    script: `//@version=2
// Source: https://github.com/be-thomas/OpenPineScript
study("OpenPineScript Dual SMA", overlay=true)

fast = sma(close, 10)
slow = sma(close, 30)

plot(fast, title="Fast SMA 10", color=blue, linewidth=2)
plot(slow, title="Slow SMA 30", color=red, linewidth=2)
`,
  },
};


export const CodeEditor: React.FC<CodeEditorProps> = ({
  script,
  onChange,
  onExecute,
  isExecuting,
  savedScripts,
  onSaveScript,
  onLoadScript,
  maxBars,
  onMaxBarsChange,
  layout = 'bottom',
  onToggleLayout,
  isMaximized = false,
  onToggleMaximize,
  onClose,
  activeScriptName = 'Untitled script',
  onScriptNameChange,
  selectedEngine = 'auto',
  onSelectEngine,
}) => {
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libSearch, setLibSearch] = useState('');
  const [libCategory, setLibCategory] = useState('All');
  const [scriptName, setScriptName] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [useRawEditor, setUseRawEditor] = useState(false);
  const [monacoFailed, setMonacoFailed] = useState(false);

  const ALL_CATEGORIES = ['All', 'PineCoders Hub', 'LuxAlgo', 'PyneSys (PyneCore)', 'OpenPineScript', 'Smart Money', 'Trend', 'Oscillators', 'Volatility', 'Volume', 'Support & Resistance'];


  const filteredScripts = Object.entries(SAMPLE_SCRIPTS).filter(([, item]: any) => {
    const matchCat = libCategory === 'All' || item.category === libCategory;
    const matchSearch = !libSearch || item.name.toLowerCase().includes(libSearch.toLowerCase()) || (item.description || '').toLowerCase().includes(libSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleEditorMount = (_editor: unknown, monaco: typeof import('monaco-editor')) => {
    // Configure Monaco dark theme for trading terminal
    monaco.editor.defineTheme('trading-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff79c6', fontStyle: 'bold' },
        { token: 'number', foreground: 'bd93f9' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'function', foreground: '50fa7b' },
        { token: 'variable', foreground: '8be9fd' },
        { token: 'type', foreground: 'ffb86c' },
      ],
      colors: {
        'editor.background': '#0c0d14',
        'editor.foreground': '#f8f8f2',
        'editorCursor.foreground': '#60a5fa',
        'editor.lineHighlightBackground': '#151726',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#94a3b8',
        'editor.selectionBackground': '#2563eb40',
      },
    });
    monaco.editor.setTheme('trading-dark');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onExecute();
    }
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scriptName.trim()) {
      onSaveScript(scriptName.trim());
      setScriptName('');
      setSaveModalOpen(false);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-[#0c0d14] ${layout === 'side' ? 'border-l border-[#1e1e2e]' : 'border-t border-[#1e1e2e]'}`} onKeyDown={handleKeyDown}>
      {/* Editor Header Toolbar - Styled like TradingView & velacharts.dev/pine-script */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#10111a] border-b border-[#1e1e2e] select-none text-xs">
        {/* Left: Script Tab & Title */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Active Script Tab */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#181926] border border-[#2d2d42] border-b-transparent rounded-t text-slate-200 font-medium cursor-pointer hover:bg-[#1f2030] transition-colors">
            {isEditingTitle ? (
              <input
                type="text"
                value={activeScriptName}
                onChange={(e) => onScriptNameChange?.(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
                autoFocus
                className="bg-transparent text-white border-b border-blue-400 outline-none w-28 text-xs font-medium"
              />
            ) : (
              <span
                onClick={() => setIsEditingTitle(true)}
                title="Click to rename script"
                className="truncate max-w-[140px] text-slate-200 font-medium"
              >
                {activeScriptName}
              </span>
            )}
            <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
              v6
            </span>
          </div>

          {/* Engine Selector Dropdown */}
          <div className="flex items-center gap-1">
            <select
              value={selectedEngine}
              onChange={(e) => onSelectEngine?.(e.target.value as any)}
              className="bg-[#181926] text-blue-300 hover:text-white border border-[#2d2d42] hover:border-blue-500/50 rounded px-2 py-0.5 text-[11px] font-medium outline-none cursor-pointer transition-colors shadow-sm"
              title="Select Open-Source Pine Script Runtime Engine"
            >
              <option value="auto">⚡ Auto (Smart Multi-Engine)</option>
              <option value="pinets">🌲 PineTS (LuxAlgo v5/v6)</option>
              <option value="pynecore">🐍 PyneCore (PyneSys Python)</option>
              <option value="openpinescript">📜 OpenPineScript (be-thomas)</option>
              <option value="native">📐 Native TA (Fail-Safe)</option>
            </select>
          </div>


          {/* Indicator Library Button */}
          <button
            onClick={() => setLibraryOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181926] hover:bg-[#1f2234] text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-400/60 transition-all text-xs font-medium"
            title="Open Indicator Library"
          >
            <Sparkles size={12} className="text-amber-400" />
            Library ({Object.keys(SAMPLE_SCRIPTS).length})
          </button>

          {/* Quick Indicator Buttons */}
          <div className="hidden lg:flex items-center gap-1 pl-1 border-l border-[#2d2d42]">
            {(['liquidity_sweep_signals', 'supertrend', 'macd', 'rsi', 'vwap'] as const).map((key) => {
              const item = SAMPLE_SCRIPTS[key] as any;
              return (
                <button
                  key={key}
                  onClick={() => { onChange(item.script); onScriptNameChange?.(item.name); }}
                  className="px-2 py-0.5 rounded text-[11px] bg-[#181926] hover:bg-blue-600/20 text-slate-300 hover:text-blue-200 border border-[#2d2d42] hover:border-blue-500/50 transition-colors cursor-pointer truncate max-w-[90px]"
                  title={item.name}
                >
                  {item.name.split(' ')[0]}
                </button>
              );
            })}
          </div>

          {/* Saved Scripts Dropdown */}
          {savedScripts.length > 0 && (
            <div className="flex items-center gap-1">
              <Bookmark size={13} className="text-emerald-400" />
              <select
                className="bg-[#181926] text-slate-300 border border-[#2d2d42] rounded px-2 py-1 text-xs outline-none hover:border-slate-500 cursor-pointer"
                onChange={(e) => {
                  const s = savedScripts.find((item) => item.id === e.target.value);
                  if (s) {
                    onLoadScript(s);
                    onScriptNameChange?.(s.name);
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>My Scripts ({savedScripts.length})</option>
                {savedScripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Actions, Run Button & Window Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Max Bars Limit */}
          <div className="flex items-center gap-1 text-slate-400">
            <span className="text-[11px]">Bars:</span>
            <select
              className="bg-[#181926] text-slate-300 border border-[#2d2d42] rounded px-2 py-1 text-xs outline-none cursor-pointer"
              value={maxBars}
              onChange={(e) => onMaxBarsChange(Number(e.target.value))}
            >
              <option value={500}>500</option>
              <option value={1000}>1,000</option>
              <option value={2000}>2,000</option>
              <option value={5000}>5,000</option>
            </select>
          </div>

          {/* Save Script Button */}
          <button
            onClick={() => setSaveModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#181926] hover:bg-[#222436] text-slate-300 hover:text-white border border-[#2d2d42] transition-colors"
            title="Save Script"
          >
            <Save size={12} />
            <span>Save</span>
          </button>

          {/* Reset Script Button */}
          <button
            onClick={() => {
              onChange(SAMPLE_SCRIPTS.volumetric_order_flow.script);
              onScriptNameChange?.('Volumetric Order Flow Structure');
            }}
            className="p-1 rounded bg-[#181926] hover:bg-[#222436] text-slate-400 hover:text-slate-200 border border-[#2d2d42] transition-colors"
            title="Reset to default script"
          >
            <RotateCcw size={12} />
          </button>

          {/* Primary Run Script Button - White pill matching velacharts.dev/pine-script */}
          <button
            onClick={onExecute}
            disabled={isExecuting}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded bg-white hover:bg-slate-200 active:scale-95 disabled:opacity-50 text-black font-semibold shadow-sm transition-all cursor-pointer"
            title="Execute Pine Script (Ctrl+Enter)"
          >
            {isExecuting ? (
              <>
                <Loader2 size={13} className="animate-spin text-black" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play size={12} className="fill-black text-black" />
                <span>Run</span>
              </>
            )}
          </button>

          {/* Window / Layout Controls */}
          <div className="flex items-center gap-1 border-l border-[#2d2d42] pl-2 ml-1">
            {/* Toggle Bottom / Side Layout */}
            {onToggleLayout && (
              <button
                onClick={onToggleLayout}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1e2030] transition-colors"
                title={layout === 'bottom' ? 'Switch to side panel' : 'Switch to bottom dock'}
              >
                {layout === 'bottom' ? <PanelRight size={13} /> : <PanelBottom size={13} />}
              </button>
            )}

            {/* Maximize / Minimize Editor */}
            {onToggleMaximize && (
              <button
                onClick={onToggleMaximize}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1e2030] transition-colors"
                title={isMaximized ? 'Restore height' : 'Maximize editor'}
              >
                {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            )}

            {/* Close Editor */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-[#1e2030] transition-colors"
                title="Hide editor"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Monaco Code Editor with Fallback */}
      <div className="flex-1 relative overflow-hidden bg-[#0c0d14]">
        {monacoFailed || useRawEditor ? (
          <div className="w-full h-full flex flex-col font-mono text-xs">
            <textarea
              value={script}
              onChange={(e) => onChange(e.target.value)}
              className="w-full h-full bg-[#0c0d14] text-slate-100 p-3 font-mono text-xs resize-none outline-none border-none leading-relaxed"
              spellCheck={false}
              placeholder="// Paste your Pine Script here..."
            />
          </div>
        ) : (
          <Editor
            height="100%"
            language="typescript" // closest syntax highlight for Pine Script
            value={script}
            onChange={(val) => onChange(val ?? '')}
            onMount={handleEditorMount}
            theme="trading-dark"
            loading={
              <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-slate-400 bg-[#0c0d14]">
                <Loader2 size={18} className="animate-spin text-blue-500" />
                <span>Loading Pine Script Editor...</span>
                <button
                  onClick={() => setUseRawEditor(true)}
                  className="mt-1 px-2 py-1 rounded bg-[#1e2030] hover:bg-[#2a2d44] text-[11px] text-blue-300"
                >
                  Use Fast Editor
                </button>
              </div>
            }
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              padding: { top: 8, bottom: 8 },
              overviewRulerBorder: false,
              folding: true,
              glyphMargin: false,
              smoothScrolling: true,
            }}
          />
        )}
      </div>

      {/* Editor Footer / Keyboard Hint */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e0f18] border-t border-[#1e1e2e] text-[11px] text-slate-400 select-none">
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-[#1e2030] border border-[#2d2d42] rounded text-[10px] text-slate-300">Ctrl</kbd>
          +
          <kbd className="px-1.5 py-0.5 bg-[#1e2030] border border-[#2d2d42] rounded text-[10px] text-slate-300">Enter</kbd>
          to execute
        </span>
        <span className="text-slate-500">
          Powered by <strong className="text-blue-400">PineTS</strong> (LuxAlgo) · Indicators from <strong className="text-emerald-400">Alorse</strong>, <strong className="text-purple-400">everget</strong>, <strong className="text-amber-400">PineCoders</strong>
        </span>
      </div>

      {/* Save Script Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#151624] border border-[#2a2b3d] rounded-lg shadow-xl w-full max-w-sm p-4 text-slate-200">
            <h3 className="font-semibold text-sm mb-3">Save Pine Script</h3>
            <form onSubmit={handleSaveSubmit}>
              <input
                type="text"
                placeholder="Script Name (e.g. My Custom EMA)"
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                autoFocus
                className="w-full bg-[#0c0d14] border border-[#2a2b3d] rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 mb-4"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setSaveModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-[#1e2030] hover:bg-[#282b40] text-slate-300 border border-[#2d2d42]">
                  Cancel
                </button>
                <button type="submit" disabled={!scriptName.trim()}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Indicator Library Modal */}
      {libraryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLibraryOpen(false)}>
          <div className="bg-[#111220] border border-[#2a2b3d] rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col text-slate-200"
            onClick={(e) => e.stopPropagation()}>
            {/* Library Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                <h2 className="font-bold text-base">Pine Script Indicator Library</h2>
                <span className="text-xs text-slate-500 ml-1">({Object.keys(SAMPLE_SCRIPTS).length} indicators from open-source repos)</span>
              </div>
              <button onClick={() => setLibraryOpen(false)} className="p-1 rounded hover:bg-[#1e2030] text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            {/* Search + Category Filter */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1e1e2e]">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search indicators..."
                  value={libSearch}
                  onChange={(e) => setLibSearch(e.target.value)}
                  autoFocus
                  className="w-full bg-[#0c0d14] border border-[#2a2b3d] rounded-lg px-3 py-2 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <svg className="absolute left-2.5 top-2 text-slate-500" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="flex gap-1 flex-wrap">
                {ALL_CATEGORIES.map((cat) => (
                  <button key={cat}
                    onClick={() => setLibCategory(cat)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                      libCategory === cat
                        ? 'bg-blue-600 text-white border border-blue-400'
                        : 'bg-[#1a1b2a] text-slate-400 border border-[#2d2d42] hover:border-slate-500 hover:text-slate-200'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Indicator Grid */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredScripts.length === 0 && (
                <div className="col-span-2 text-center py-8 text-slate-500 text-sm">No indicators match your search.</div>
              )}
              {filteredScripts.map(([key, item]: any) => (
                <div key={key}
                  className="group bg-[#161726] border border-[#2a2b3d] hover:border-blue-500/50 rounded-lg p-3 cursor-pointer transition-all hover:bg-[#1a1c30] relative"
                  onClick={() => {
                    onChange(item.script);
                    onScriptNameChange?.(item.name);
                    setLibraryOpen(false);
                  }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-xs text-white truncate">{item.name}</span>
                        {item.category && (
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            item.category === 'Smart Money' ? 'bg-emerald-900/60 text-emerald-300' :
                            item.category === 'Trend' ? 'bg-blue-900/60 text-blue-300' :
                            item.category === 'Oscillators' ? 'bg-purple-900/60 text-purple-300' :
                            item.category === 'Volume' ? 'bg-amber-900/60 text-amber-300' :
                            item.category === 'Volatility' ? 'bg-cyan-900/60 text-cyan-300' :
                            item.category === 'Risk Management' ? 'bg-red-900/60 text-red-300' :
                            'bg-slate-800 text-slate-300'
                          }`}>{item.category}</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2 mb-1.5">{item.description}</p>
                      )}
                      {item.source && (
                        <p className="text-[10px] text-slate-600 truncate">📦 {item.source}</p>
                      )}
                    </div>
                    <button
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(item.script);
                        onScriptNameChange?.(item.name);
                        setLibraryOpen(false);
                      }}>
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Library Footer */}
            <div className="px-5 py-3 border-t border-[#1e1e2e] text-[11px] text-slate-500 flex items-center justify-between">
              <span>Sources: <a href="https://github.com/Alorse/pinescript-strategies" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">Alorse</a> · <a href="https://github.com/everget/tradingview-pinescript-indicators" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">everget</a> · <a href="https://github.com/pinecoders" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">PineCoders</a> · <a href="https://github.com/LuxAlgo/PineTS" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">LuxAlgo/PineTS</a></span>
              <span>Runtime: <strong className="text-blue-400">PineTS v0.11 (LuxAlgo)</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
