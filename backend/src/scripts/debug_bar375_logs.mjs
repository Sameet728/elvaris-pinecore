import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Check exactly what happens inside Pine Script around bar 375
const testCode = `//@version=6
indicator("DebugLog", overlay=true)

bullFVG = low > high[2]
bearFVG = high < low[2]

var float[] sFvgTop = array.new_float()
var float[] sFvgBot = array.new_float()
var int[]   sFvgBar = array.new_int()

if bearFVG
    array.push(sFvgTop, low[2])
    array.push(sFvgBot, high)
    array.push(sFvgBar, bar_index)
    if array.size(sFvgTop) > 15
        array.shift(sFvgTop)
        array.shift(sFvgBot)
        array.shift(sFvgBar)

atr = ta.atr(14)
tpDist = 3.5

if bar_index >= 370 and bar_index <= 378
    log.info("Bar: " + str.tostring(bar_index) + " C: " + str.tostring(close) + " H: " + str.tostring(high) + " L: " + str.tostring(low))
    if array.size(sFvgTop) > 0
        for f = array.size(sFvgTop) - 1 to 0
            fTop = array.get(sFvgTop, f)
            fBot = array.get(sFvgBot, f)
            fB   = array.get(sFvgBar, f)
            if high >= fBot and close < fTop
                entryP = close
                stopP = fTop + atr * 0.22
                slDist = stopP - entryP
                gain = entryP - low
                log.info("  Signal FVG bar=" + str.tostring(fB) + " fTop=" + str.tostring(fTop) + " fBot=" + str.tostring(fBot) + " slDist=" + str.tostring(slDist) + " gain=" + str.tostring(gain))
`;

async function run() {
  const p = new PineTS(candles.slice(0, 400), 'XAUUSD', '5');
  await p.ready();
  const res = await p.run(testCode);
  console.log(res.logs);
}
run().catch(console.error);
