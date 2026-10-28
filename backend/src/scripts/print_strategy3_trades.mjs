import http from 'http';
import fs from 'fs';

function runPineScript(script) {
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

const script = `// © Antigravity Quant
//@version=6
indicator("LSS Tight Rejection (Calmar > 7.0)", overlay=true)

swingLen   = 10
maxLevels  = 5
atrMult    = 0.5
rrRatio    = 1.8
maxBarAtr  = 0.7
expireBars = 30
sessionLon = "0700-1200"
sessionNY  = "1330-2000"

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

if array.size(sigDir) > 0
    for i = 0 to array.size(sigDir) - 1
        if array.get(sigResult, i) == 0
            d   = array.get(sigDir, i)
            tp  = array.get(sigTP, i)
            sl  = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            if age >= expireBars * 3
                array.set(sigResult, i, 2)
            else if d == 1
                if high >= tp
                    array.set(sigResult, i, 1)
                else if low <= sl
                    array.set(sigResult, i, -1)
            else
                if low <= tp
                    array.set(sigResult, i, 1)
                else if high >= sl
                    array.set(sigResult, i, -1)

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

if not inSession or ((bar_index - setupBarL) > expireBars)
    lookLong := false
if not inSession or ((bar_index - setupBarS) > expireBars)
    lookShort := false

// Entry on CLOSE of confirmation candle, with tight risk filter
if lookLong and not hasOpen
    if array.size(bFvgBar) > 0
        for i = array.size(bFvgBar) - 1 to 0
            if array.get(bFvgBar, i) > setupBarL
                fTop = array.get(bFvgTop, i)
                fBot = array.get(bFvgBot, i)
                if low <= fTop and close > fBot
                    entryP = close
                    slP    = setupSLL
                    slDist = entryP - slP
                    // Anti-Chasing Filter: Risk distance must NOT exceed 0.7 ATR
                    if slDist > 0 and slDist <= atr * maxBarAtr
                        tpP = entryP + slDist * rrRatio
                        array.push(sigDir, 1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        lookLong := false
                        break

if lookShort and not hasOpen
    if array.size(sFvgBar) > 0
        for i = array.size(sFvgBar) - 1 to 0
            if array.get(sFvgBar, i) > setupBarS
                fTop = array.get(sFvgTop, i)
                fBot = array.get(sFvgBot, i)
                if high >= fBot and close < fTop
                    entryP = close
                    slP    = setupSLS
                    slDist = slP - entryP
                    if slDist > 0 and slDist <= atr * maxBarAtr
                        tpP = entryP - slDist * rrRatio
                        array.push(sigDir, -1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        lookShort := false
                        break

plot(setupSLL != 0 ? setupSLL : na, "Setup SL Long")
`;

async function main() {
  const resp = await runPineScript(script);
  const trades = resp.backtest?.trades || [];
  console.log('Trades count:', trades.length);
  console.table(trades.map(t => ({
    id: t.id,
    timeIST: new Date(t.time + 5.5 * 3600000).toISOString().replace('T', ' ').slice(0, 16),
    dir: t.direction,
    entryPrice: t.entryPrice,
    stopLoss: t.stopLoss,
    takeProfit: t.takeProfit,
    result: t.result,
    profitR: t.result === 'WIN' ? 1.8 : (t.result === 'LOSS' ? -1.0 : 0)
  })));
}

main().catch(console.error);
