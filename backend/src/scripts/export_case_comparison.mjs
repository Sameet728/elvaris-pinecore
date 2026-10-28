import http from 'http';
import fs from 'fs';

function generateLssScript(caseNumber) {
  return `// © EVLabs
//@version=6
indicator("Liquidity Sweep Signals - Case ${caseNumber}", overlay=true)

swingLen   = 10
maxLevels  = 5
atrMult    = 0.5
rrRatio    = 2.0
expireBars = 30
statsLen   = 100
sessionLon = "0700-1200"
sessionNY  = "1330-2000"

var string[] monthKeys = array.new_string()
var int[]    monthWins = array.new_int()
var int[]    monthLosses = array.new_int()
var float[]  monthR = array.new_float()

inLondon  = not na(time(timeframe.period, sessionLon, "Europe/Berlin"))
inNY      = not na(time(timeframe.period, sessionNY,  "America/New_York"))
inSession = inLondon or inNY

atr = ta.atr(14)

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

while array.size(bFvgTop) > 20
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 20
    array.shift(sFvgTop)
    array.shift(sFvgBot)
    array.shift(sFvgBar)

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

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()
var float[] sigCustomR = array.new_float()

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
                    else if finalRes == -1
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1)
                        array.set(monthR, idx, array.get(monthR, idx) - 1.0)

hasOpen = false
nSig2 = array.size(sigResult)
if nSig2 > 0
    for i = 0 to nSig2 - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool  lookLong  = false
var bool  lookShort = false
var int   setupBarL = 0
var int   setupBarS = 0
var float setupSLL  = 0.0
var float setupSLS  = 0.0

if sslSweep and inSession and not hasOpen
    lookLong  := true
    lookShort := false
    setupBarL := bar_index
    setupSLL  := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen
    lookShort := true
    lookLong  := false
    setupBarS := bar_index
    setupSLS  := sweepHigh + atr * atrMult

if not inSession
    lookLong  := false
    lookShort := false

if lookLong  and (bar_index - setupBarL) > expireBars
    lookLong  := false
if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

${
  caseNumber === 3
    ? `// CASE 3: ORIGINAL (Midpoint Entry, 1:2 RR)
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
                        array.push(sigDir, 1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
                        lookLong := false
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
                        array.push(sigDir, -1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
                        lookShort := false
                        break`
    : caseNumber === 1
    ? `// CASE 1: Close Entry, Original SL & TP (Dynamic RR)
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
                        if entryP > slP and entryP < tpP
                            riskDist = entryP - slP
                            rewDist  = tpP - entryP
                            customR  = rewDist / riskDist
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigCustomR, customR)
                            lookLong := false
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
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigCustomR, customR)
                            lookShort := false
                            break`
    : `// CASE 2: Close Entry, Original SL, 1:2 RR from Close
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
                        array.push(sigDir, 1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
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
                        tpP = entryP - slDist * rrRatio
                        array.push(sigDir, -1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        array.push(sigCustomR, rrRatio)
                        lookShort := false
                        break`
}

plot(setupSLL != 0 ? setupSLL : na, "Setup SL Long")
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
        res.on('end', () => resolve(JSON.parse(b)));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  const [res3, res1, res2] = await Promise.all([
    runScript(generateLssScript(3)),
    runScript(generateLssScript(1)),
    runScript(generateLssScript(2)),
  ]);

  const output = {
    case3: { summary: res3.backtest?.summary, trades: res3.backtest?.trades },
    case1: { summary: res1.backtest?.summary, trades: res1.backtest?.trades },
    case2: { summary: res2.backtest?.summary, trades: res2.backtest?.trades },
  };

  fs.writeFileSync('src/scripts/comparison_results.json', JSON.stringify(output, null, 2));
  console.log('Results written to src/scripts/comparison_results.json');
}

run().catch(console.error);
