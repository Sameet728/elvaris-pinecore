import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Test the perfected Sovereign Strategy with all 5 fixes applied:
const perfectPineCode = `//@version=6
strategy("Champion_5M_200Pip_Sovereign_STRATEGY", overlay=true, 
         initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, 
         margin_long=0, margin_short=0,
         commission_type=strategy.commission.cash_per_contract, commission_value=0.0,
         max_boxes_count=500, max_lines_count=500, max_labels_count=500)

// ─── Strategy Settings ───
grp_strat       = "5M 200-Pip Target Strategy Parameters"
tpPips          = input.float(35.0, "Take Profit (Pips) [Default 35p Sovereign, or 20p-200p]", minval=10.0, maxval=300.0, step=5.0, group=grp_strat)
swingLen        = input.int(4, "Minor Swing Pivot Length", minval=2, maxval=10, group=grp_strat)
majorSwingLen   = input.int(6, "Major Swing Pivot Length", minval=3, maxval=20, group=grp_strat)
emaLen          = input.int(50, "Trend Filter EMA Length", minval=20, maxval=200, group=grp_strat)
atrMult         = input.float(0.22, "FVG Protective SL Buffer Multiplier", minval=0.1, maxval=0.5, step=0.02, group=grp_strat)
expireBars      = input.int(25, "Setup Expiration (Bars)", minval=10, maxval=60, group=grp_strat)
maxHoldBars     = input.int(45, "Max Hold Duration (Bars)", minval=15, maxval=100, group=grp_strat)

grp_risk        = "Multi-Tier Profit Securing Shield"
lotSize         = input.float(1.0, "Trading Contract Size (Lots)", minval=0.1, step=0.5, group=grp_risk)
beTriggerR      = input.float(0.35, "Tier 1: Positive Breakeven Trigger (+R)", minval=0.15, step=0.05, group=grp_risk)
lock1TriggerR   = input.float(0.80, "Tier 2: Profit Lock 1 Trigger (+R)", minval=0.5, step=0.05, group=grp_risk)
lock1ValR       = input.float(0.60, "Tier 2: Lock 1 Secured Profit (+R)", minval=0.2, step=0.05, group=grp_risk)
lock2TriggerR   = input.float(1.40, "Tier 3: Runner Lock 2 Trigger (+R)", minval=0.8, step=0.1, group=grp_risk)
lock2ValR       = input.float(1.20, "Tier 3: Lock 2 Secured Profit (+R)", minval=0.5, step=0.1, group=grp_risk)
cooldownBars    = input.int(6, "Post-Loss Cooldown Duration (Bars)", minval=2, maxval=50, group=grp_risk)
maxDailyLosses  = input.int(3, "Max Daily Losses Allowed", minval=1, maxval=5, group=grp_risk)

grp_visual      = "TradingView Full UI Aesthetics"
showBoxes       = input.bool(true, "Show Clean Long/Short Position Tool Boxes", group=grp_visual)
showSweepLabels = input.bool(true, "Show SSL / BSL Sweep Tags", group=grp_visual)
showEntryLabels = input.bool(true, "Show ▶ LONG / ▶ SHORT Entry Badges", group=grp_visual)
showDashboard   = input.bool(true, "Show Top-Right & Bottom-Right Full UI", group=grp_visual)

// ─── Technical Indicators ───
atr = ta.atr(14)
ema = ta.ema(close, emaLen)
tpDist = tpPips / 10.0

// ─── Dual Swing Liquidity Pivots (Minor & Major) ───
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
    if array.size(bslLvls) > 20
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL1)
    array.push(sslLvls, sL1)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 20
        array.shift(sslLvls)
        array.shift(sslSwept)

if not na(sH2)
    array.push(bslLvls, sH2)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 20
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(sL2)
    array.push(sslLvls, sL2)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 20
        array.shift(sslLvls)
        array.shift(sslSwept)

// ─── Fair Value Gaps (FVG) Detection ───
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
    if array.size(bFvgTop) > 15
        array.shift(bFvgTop)
        array.shift(bFvgBot)
        array.shift(bFvgBar)

if bearFVG
    array.push(sFvgTop, low[2])
    array.push(sFvgBot, high)
    array.push(sFvgBar, bar_index)
    if array.size(sFvgTop) > 15
        array.shift(sFvgTop)
        array.shift(sFvgBot)
        array.shift(sFvgBar)

// ─── Liquidity Sweep Detection ───
sslSweep = false
bslSweep = false

if array.size(sslLvls) > 0
    for k = 0 to array.size(sslLvls) - 1
        if not array.get(sslSwept, k)
            lvl = array.get(sslLvls, k)
            if low < lvl and close > lvl
                array.set(sslSwept, k, true)
                sslSweep := true
                break

if array.size(bslLvls) > 0
    for k = 0 to array.size(bslLvls) - 1
        if not array.get(bslSwept, k)
            lvl = array.get(bslLvls, k)
            if high > lvl and close < lvl
                array.set(bslSwept, k, true)
                bslSweep := true
                break

if showSweepLabels
    if sslSweep
        label.new(bar_index, low - atr * 0.4, "SSL ▼", color=color.new(#00e676, 10), textcolor=color.black, style=label.style_label_up, size=size.tiny)
    if bslSweep
        label.new(bar_index, high + atr * 0.4, "BSL ▲", color=color.new(#ff1744, 10), textcolor=color.white, style=label.style_label_down, size=size.tiny)

// ─── State Management and Risk Guard ───
var bool lookLong         = false
var bool lookShort        = false
var int  setupBarL        = 0
var int  setupBarS        = 0
var int  cooldownUntil    = 0
var int  dayLosses        = 0
var string lastDayStr     = ""

curDayStr = str.tostring(year(time)) + "-" + str.tostring(month(time)) + "-" + str.tostring(dayofmonth(time))
if curDayStr != lastDayStr
    lastDayStr := curDayStr
    dayLosses  := 0

isCooldown   = bar_index < cooldownUntil
dailyBlocked = dayLosses >= maxDailyLosses

// Sweep Triggers - ONLY when strategy is completely flat!
if sslSweep and close > ema and strategy.position_size == 0 and not isCooldown and not dailyBlocked
    lookLong  := true
    lookShort := false
    setupBarL := bar_index

if bslSweep and close < ema and strategy.position_size == 0 and not isCooldown and not dailyBlocked
    lookShort := true
    lookLong  := false
    setupBarS := bar_index

if lookLong and (bar_index - setupBarL) > expireBars
    lookLong := false

if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

// ─── Persistent Position Tracking Variables ───
var float entryP   = na
var float initSL   = na
var float currSL   = na
var float tpP      = na
var int   entryBar = 0
var bool  isBE     = false
var bool  isLock1  = false
var bool  isLock2  = false

// ─── Visual Handles for Current Trade ───
var box   curTpBox  = na
var box   curSlBox  = na
var line  curEntryL = na

// ─── Signal Evaluation and FVG Entry (STRICT strategy.position_size == 0) ───
if strategy.position_size == 0 and not isCooldown and not dailyBlocked
    if lookLong and array.size(bFvgTop) > 0
        for f = array.size(bFvgTop) - 1 to 0
            if array.get(bFvgBar, f) > setupBarL
                fTop = array.get(bFvgTop, f)
                fBot = array.get(bFvgBot, f)
                if low <= fTop and close > fBot
                    e = close
                    s = fBot - atr * atrMult
                    slDist = e - s
                    maxSlDist = math.max(2.0, tpDist / 1.5)
                    if slDist > 0.4 and slDist < maxSlDist
                        entryP   := e
                        initSL   := s
                        currSL   := s
                        tpP      := e + tpDist
                        entryBar := bar_index
                        isBE     := false
                        isLock1  := false
                        isLock2  := false
                        lookLong := false

                        strategy.entry("Long", strategy.long, qty=lotSize, comment="▶ LONG")
                        strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss="SL HIT")

                        if showBoxes
                            curTpBox := box.new(bar_index, tpP, bar_index + 1, e,
                                                bgcolor=color.new(#26a69a, 75), border_color=color.new(#26a69a, 30), border_width=1,
                                                text="TP " + str.tostring(tpP, "#.##"),
                                                text_color=color.new(color.white, 20), text_size=size.small, text_halign=text.align_right, text_valign=text.align_top)
                            curSlBox := box.new(bar_index, e, bar_index + 1, s,
                                                bgcolor=color.new(#ef5350, 75), border_color=color.new(#ef5350, 30), border_width=1,
                                                text="SL " + str.tostring(s, "#.##"),
                                                text_color=color.new(color.white, 20), text_size=size.small, text_halign=text.align_right, text_valign=text.align_bottom)
                            curEntryL := line.new(bar_index, e, bar_index + 1, e, color=color.white, style=line.style_dashed, width=1)

                        if showEntryLabels
                            label.new(bar_index, e, "▶ LONG " + str.tostring(e, "#.##"), color=color.white, textcolor=color.black, style=label.style_label_right, size=size.small)
                        break

    if lookShort and strategy.position_size == 0 and array.size(sFvgTop) > 0
        for f = array.size(sFvgTop) - 1 to 0
            if array.get(sFvgBar, f) > setupBarS
                fTop = array.get(sFvgTop, f)
                fBot = array.get(sFvgBot, f)
                if high >= fBot and close < fTop
                    e = close
                    s = fTop + atr * atrMult
                    slDist = s - e
                    maxSlDist = math.max(2.0, tpDist / 1.5)
                    if slDist > 0.4 and slDist < maxSlDist
                        entryP   := e
                        initSL   := s
                        currSL   := s
                        tpP      := e - tpDist
                        entryBar := bar_index
                        isBE     := false
                        isLock1  := false
                        isLock2  := false
                        lookShort := false

                        strategy.entry("Short", strategy.short, qty=lotSize, comment="▶ SHORT")
                        strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss="SL HIT")

                        if showBoxes
                            curTpBox := box.new(bar_index, e, bar_index + 1, tpP,
                                                bgcolor=color.new(#26a69a, 75), border_color=color.new(#26a69a, 30), border_width=1,
                                                text="TP " + str.tostring(tpP, "#.##"),
                                                text_color=color.new(color.white, 20), text_size=size.small, text_halign=text.align_right, text_valign=text.align_top)
                            curSlBox := box.new(bar_index, s, bar_index + 1, e,
                                                bgcolor=color.new(#ef5350, 75), border_color=color.new(#ef5350, 30), border_width=1,
                                                text="SL " + str.tostring(s, "#.##"),
                                                text_color=color.new(color.white, 20), text_size=size.small, text_halign=text.align_right, text_valign=text.align_bottom)
                            curEntryL := line.new(bar_index, e, bar_index + 1, e, color=color.white, style=line.style_dashed, width=1)

                        if showEntryLabels
                            label.new(bar_index, e, "▶ SHORT " + str.tostring(e, "#.##"), color=color.white, textcolor=color.black, style=label.style_label_right, size=size.small)
                        break

// ─── Active Trade Management: Multi-Tier Profit Securing & Order Maintenance ───
if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    slDistInit = math.abs(entryP - initSL)
    currentGain = dir == 1 ? (high - entryP) : (entryP - low)

    // Dynamic Visual Box Extension
    if showBoxes and not na(curTpBox)
        box.set_right(curTpBox, bar_index)
        box.set_right(curSlBox, bar_index)
        line.set_x2(curEntryL, bar_index)

    // Tier 1: Positive Breakeven at +0.35R (Secures +5 ticks = +$0.05 profit in TV!)
    // VALIDATED: Ensure stop price does not violate current close!
    if beTriggerR > 0 and not isBE
        if currentGain >= slDistInit * beTriggerR
            targetBE = dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)
            if (dir == 1 and close > targetBE) or (dir == -1 and close < targetBE)
                currSL := targetBE
                isBE := true

    // Tier 2: Profit Lock 1 at +0.80R -> Secure +0.60R
    // VALIDATED: Ensure stop price does not violate current close!
    if lock1TriggerR > 0 and not isLock1
        if currentGain >= slDistInit * lock1TriggerR
            targetLock1 = dir == 1 ? (entryP + slDistInit * lock1ValR) : (entryP - slDistInit * lock1ValR)
            if (dir == 1 and close > targetLock1) or (dir == -1 and close < targetLock1)
                currSL := targetLock1
                isLock1 := true

    // Tier 3: Runner Lock 2 at +1.40R -> Secure +1.20R
    // VALIDATED: Ensure stop price does not violate current close!
    if lock2TriggerR > 0 and not isLock2
        if currentGain >= slDistInit * lock2TriggerR
            targetLock2 = dir == 1 ? (entryP + slDistInit * lock2ValR) : (entryP - slDistInit * lock2ValR)
            if (dir == 1 and close > targetLock2) or (dir == -1 and close < targetLock2)
                currSL := targetLock2
                isLock2 := true

    // Order Execution / Close
    if (bar_index - entryBar) >= maxHoldBars
        strategy.close_all(comment="Timeout Exit")
    else
        exitComment = isLock2 ? "LOCK 2 WIN" : isLock1 ? "LOCK 1 WIN" : isBE ? "BREAKEVEN" : "SL HIT"
        if dir == 1
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
        else
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)

// Colorize Boxes when position closes
if strategy.position_size[1] != 0 and strategy.position_size == 0
    if showBoxes and not na(curTpBox)
        box.set_right(curTpBox, bar_index)
        box.set_right(curSlBox, bar_index)
        // Check last closed trade profit
        lastProfit = strategy.closedtrades.profit(strategy.closedtrades - 1)
        if lastProfit > 0.05
            // ── GREEN IF TP HIT / LOCK WIN ──
            box.set_text(curTpBox, "🏆 WIN (+$" + str.tostring(lastProfit, "#.##") + ")")
            box.set_bgcolor(curTpBox, color.new(#00c853, 50))
            box.set_bgcolor(curSlBox, color.new(#00c853, 75))
            box.set_border_color(curTpBox, color.new(#00e676, 30))
            box.set_border_color(curSlBox, color.new(#00e676, 30))
        else if lastProfit >= 0.0 and lastProfit <= 0.05
            // ── GREY IF BREAKEVEN ──
            box.set_text(curSlBox, "⚖️ BREAKEVEN (0.0R)")
            box.set_bgcolor(curSlBox, color.new(#787b86, 65))
            box.set_bgcolor(curTpBox, color.new(#787b86, 80))
            box.set_border_color(curSlBox, color.new(#9e9e9e, 40))
            box.set_border_color(curTpBox, color.new(#9e9e9e, 40))
        else
            // ── RED IF SL HIT / LOSS ──
            box.set_text(curSlBox, "❌ SL HIT (-$" + str.tostring(math.abs(lastProfit), "#.##") + ")")
            box.set_bgcolor(curSlBox, color.new(#d50000, 50))
            box.set_bgcolor(curTpBox, color.new(#d50000, 80))
            box.set_border_color(curSlBox, color.new(#ff1744, 30))
            box.set_border_color(curTpBox, color.new(#ff1744, 30))
            cooldownUntil := bar_index + cooldownBars
            dayLosses := dayLosses + 1
`;

async function testPerfect() {
  const p = new PineTS(candles, 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(perfectPineCode);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  const wins = trades.filter(t => t.profit > 0);
  const losses = trades.filter(t => t.profit <= 0);

  console.log('--- PERFECT SOVEREIGN STRATEGY RESULTS ---');
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
  console.log(`Win Rate: ${((wins.length / trades.length) * 100).toFixed(1)}%`);
  console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
  console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)} (${(s.max_drawdown_percent_value * 100).toFixed(3)}%)`);
  
  // Verify there are ZERO inverted stop losses or reversals
  const reversals = trades.filter(t => t.exit_comment && t.exit_comment.startsWith('▶'));
  console.log(`Market Reversals: ${reversals.length} (Must be 0)`);

  const fakeLocks = trades.filter(t => t.exit_comment && t.exit_comment.includes('WIN') && t.profit <= 0);
  console.log(`Fake Lock Losses: ${fakeLocks.length} (Must be 0)`);
}

testPerfect().catch(console.error);
