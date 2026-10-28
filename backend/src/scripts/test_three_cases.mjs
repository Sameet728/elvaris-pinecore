import http from 'http';

// Base LSS Pine Script generator for Case 1, Case 2, Case 3
function generateLssScript(caseNumber) {
  // caseNumber: 1, 2, or 3
  return `// This source code is subject to the terms of the Mozilla Public License 2.0
// © EVLabs
//@version=6
indicator("Liquidity Sweep Signals - Case ${caseNumber}", shorttitle="LSS-C${caseNumber}", overlay=true,
          max_labels_count=300, max_lines_count=300, max_boxes_count=300)

// ─── Inputs ───────────────────────────────────────────────────────────────────
swingLen   = input.int(10,    "Swing Length",              minval=3,  maxval=50,  group="Detection")
maxLevels  = input.int(5,     "Max Liq Levels",            minval=1,  maxval=10,  group="Detection")
atrMult    = input.float(0.5, "SL ATR Buffer",             minval=0.1, step=0.1,  group="Risk")
rrRatio    = input.float(2.0, "R:R Ratio",                 minval=0.5, step=0.1,  group="Risk")
expireBars = input.int(30,    "Expire setup after N bars", minval=3,  maxval=200, group="Risk")
statsLen   = input.int(100,   "Stats: Last N Signals",     minval=5,  maxval=200, group="Stats")
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
var float[] sigCustomR = array.new_float()
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
                float tradeR = array.get(sigCustomR, i)
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
                        array.set(monthR, idx, array.get(monthR, idx) + tradeR)
                        
                        currentConsLossR := 0.0
                        currentConsWinR += tradeR
                        if currentConsWinR > maxConsWinR
                            maxConsWinR := currentConsWinR
                            
                        cumulativeR += tradeR
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
    array.shift(sigCustomR)
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

${
  caseNumber === 3
    ? `// CASE 3: ORIGINAL (Entry = FVG Midpoint, Fixed 1:2 RR)
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
                        bTP = box.new(x1, tpP, x2, entryP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75))
                        bSL = box.new(x1, entryP, x2, slP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75))
                        ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                        array.push(sigDir, 1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
                        array.push(sigTpBox, bTP)
                        array.push(sigSlBox, bSL)
                        array.push(sigEntryL, ln)
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
                        bTP = box.new(x1, entryP, x2, tpP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75))
                        bSL = box.new(x1, slP, x2, entryP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75))
                        ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                        array.push(sigDir, -1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
                        array.push(sigTpBox, bTP)
                        array.push(sigSlBox, bSL)
                        array.push(sigEntryL, ln)
                        lookShort := false
                        newShort  := true
                        break`
    : caseNumber === 1
    ? `// CASE 1: Entry on Candle Close, Keep Original SL and Original TP (Dynamic RR)
if lookLong and not hasOpen
    nf = array.size(bFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(bFvgBar, i) > setupBarL
                fTop = array.get(bFvgTop, i)
                fBot = array.get(bFvgBot, i)
                mid  = (fTop + fBot) / 2
                if low <= fTop and close > fBot
                    origEntryP = mid
                    origSlP    = setupSLL
                    origSlDist = origEntryP - origSlP
                    if origSlDist > 0
                        origTpP = origEntryP + origSlDist * rrRatio
                        entryP  = close
                        slP     = origSlP
                        tpP     = origTpP
                        // Must be valid bounds
                        if entryP > slP and entryP < tpP
                            riskDist = entryP - slP
                            rewDist  = tpP - entryP
                            customR  = rewDist / riskDist
                            x1  = bar_index
                            x2  = bar_index + boxWidth
                            bTP = box.new(x1, tpP, x2, entryP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75))
                            bSL = box.new(x1, entryP, x2, slP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75))
                            ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigCustomR, customR)
                            array.push(sigTpBox, bTP)
                            array.push(sigSlBox, bSL)
                            array.push(sigEntryL, ln)
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
                    origEntryP = mid
                    origSlP    = setupSLS
                    origSlDist = origSlP - origEntryP
                    if origSlDist > 0
                        origTpP = origEntryP - origSlDist * rrRatio
                        entryP  = close
                        slP     = origSlP
                        tpP     = origTpP
                        if entryP < slP and entryP > tpP
                            riskDist = slP - entryP
                            rewDist  = entryP - tpP
                            customR  = rewDist / riskDist
                            x1  = bar_index
                            x2  = bar_index + boxWidth
                            bTP = box.new(x1, entryP, x2, tpP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75))
                            bSL = box.new(x1, slP, x2, entryP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75))
                            ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigCustomR, customR)
                            array.push(sigTpBox, bTP)
                            array.push(sigSlBox, bSL)
                            array.push(sigEntryL, ln)
                            lookShort := false
                            newShort  := true
                            break`
    : `// CASE 2: Entry on Candle Close, Keep Original SL, Recalculate TP to 1:2 RR from Close
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
                        tpP = entryP + slDist * rrRatio
                        x1  = bar_index
                        x2  = bar_index + boxWidth
                        bTP = box.new(x1, tpP, x2, entryP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75))
                        bSL = box.new(x1, entryP, x2, slP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75))
                        ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                        array.push(sigDir, 1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
                        array.push(sigTpBox, bTP)
                        array.push(sigSlBox, bSL)
                        array.push(sigEntryL, ln)
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
                if high >= fBot and close < fTop
                    entryP = close
                    slP    = setupSLS
                    slDist = slP - entryP
                    if slDist > 0
                        tpP = entryP - slDist * rrRatio
                        x1  = bar_index
                        x2  = bar_index + boxWidth
                        bTP = box.new(x1, entryP, x2, tpP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 75))
                        bSL = box.new(x1, slP, x2, entryP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 75))
                        ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                        array.push(sigDir, -1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
                        array.push(sigTpBox, bTP)
                        array.push(sigSlBox, bSL)
                        array.push(sigEntryL, ln)
                        lookShort := false
                        newShort  := true
                        break`
}

plot(setupSLL != 0 ? setupSLL : na, "Setup SL Long", color=color.green, style=plot.style_circles, linewidth=2)
plot(setupSLS != 0 ? setupSLS : na, "Setup SL Short", color=color.red, style=plot.style_circles, linewidth=2)
`;
}

function runScript(script) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ script, maxBars: 6000 });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path: '/api/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== Running Backtest Comparison Across All 3 Cases ===\n');

  console.log('Running Case 3 (Original: FVG Midpoint Entry, Fixed 1:2 RR)...');
  const res3 = await runScript(generateLssScript(3));

  console.log('Running Case 1 (Close Entry, Original SL & TP, Dynamic RR)...');
  const res1 = await runScript(generateLssScript(1));

  console.log('Running Case 2 (Close Entry, Original SL, Recalculated 1:2 RR)...');
  const res2 = await runScript(generateLssScript(2));

  console.log('\n======================================================');
  console.log('            DETAILED BACKTEST COMPARISON              ');
  console.log('======================================================\n');

  const cases = [
    { name: 'Case 3 (Original Midpoint)', data: res3 },
    { name: 'Case 1 (Close Entry, Orig TP/SL)', data: res1 },
    { name: 'Case 2 (Close Entry, 1:2 RR)', data: res2 },
  ];

  for (const c of cases) {
    const s = c.data.backtest?.summary || {};
    const trades = c.data.backtest?.trades || [];
    console.log(`>>> ${c.name} <<<`);
    console.log(`Total Trades: ${trades.length} | Wins: ${s.wins} | Losses: ${s.losses} | Open: ${s.open} | Expired: ${s.expired}`);
    console.log(`Win Rate: ${s.winRate}% | Cumulative Returns: ${s.cumulativeR} R`);
    console.log(`Max Drawdown: ${s.maxDrawdownR} R | Profit Factor: ${s.profitFactor}`);
    console.log(`Monthly Returns:`, s.monthly);
    console.log('------------------------------------------------------\n');
  }

  // Print all trades side by side or list
  const t3 = res3.backtest?.trades || [];
  const t1 = res1.backtest?.trades || [];
  const t2 = res2.backtest?.trades || [];

  console.log('Sample of Case 3 Trades:');
  console.table(t3.slice(-10).map(t => ({
    timeIST: new Date(t.time + 5.5 * 3600000).toISOString().replace('T', ' ').slice(0, 19),
    dir: t.direction,
    entry: t.entryPrice,
    sl: t.stopLoss,
    tp: t.takeProfit,
    res: t.result,
    profitR: t.profitR
  })));

  console.log('\nSample of Case 1 Trades:');
  console.table(t1.slice(-10).map(t => ({
    timeIST: new Date(t.time + 5.5 * 3600000).toISOString().replace('T', ' ').slice(0, 19),
    dir: t.direction,
    entry: t.entryPrice,
    sl: t.stopLoss,
    tp: t.takeProfit,
    res: t.result,
    profitR: t.profitR
  })));

  console.log('\nSample of Case 2 Trades:');
  console.table(t2.slice(-10).map(t => ({
    timeIST: new Date(t.time + 5.5 * 3600000).toISOString().replace('T', ' ').slice(0, 19),
    dir: t.direction,
    entry: t.entryPrice,
    sl: t.stopLoss,
    tp: t.takeProfit,
    res: t.result,
    profitR: t.profitR
  })));
}

main().catch(console.error);
