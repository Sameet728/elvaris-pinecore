import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

const debugPine = `//@version=6
indicator("DebugRejection", overlay=true)
swingLen = 4
majorSwingLen = 8
rrRatio = 3.3
atrMult = 0.35
expireBars = 35
minHoldSeconds = 120
minTpPts = 2.0
maxTpPts = 4.2

atr = ta.atr(14)
sH1 = ta.pivothigh(high, swingLen, swingLen)
sL1 = ta.pivotlow(low, swingLen, swingLen)
sH2 = ta.pivothigh(high, majorSwingLen, majorSwingLen)
sL2 = ta.pivotlow(low, majorSwingLen, majorSwingLen)

var float[] bslLvls = array.new_float()
var bool[] bslSwept = array.new_bool()
var float[] sslLvls = array.new_float()
var bool[] sslSwept = array.new_bool()

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

while array.size(bFvgTop) > 30
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 30
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

var bool lookLong = false
var bool lookShort = false
var int setupBarL = 0
var int setupBarS = 0
var float setupSLL = 0.0
var float setupSLS = 0.0

if sslSweep
    lookLong := true
    lookShort := false
    setupBarL := bar_index
    setupSLL := sweepLow - atr * atrMult

if bslSweep
    lookShort := true
    lookLong := false
    setupBarS := bar_index
    setupSLS := sweepHigh + atr * atrMult

var string[] reasons = array.new_string()

if bar_index >= 4800
    if lookLong and (bar_index - setupBarL) > expireBars
        array.push(reasons, "Bar " + str.tostring(bar_index) + ": Long expired without FVG retest")
        lookLong := false
    if lookShort and (bar_index - setupBarS) > expireBars
        array.push(reasons, "Bar " + str.tostring(bar_index) + ": Short expired without FVG retest")
        lookShort := false

    if lookLong
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
                        tpP = entryP + slDist * rrRatio
                        tpDist = tpP - entryP
                        array.push(reasons, "Bar " + str.tostring(bar_index) + ": Long retest found! slDist=" + str.tostring(slDist, "#.##") + ", tpDist=" + str.tostring(tpDist, "#.##") + " (min=" + str.tostring(minTpPts) + ", max=" + str.tostring(maxTpPts) + ")")
                        break

    if lookShort
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
                        tpP = entryP - slDist * rrRatio
                        tpDist = entryP - tpP
                        array.push(reasons, "Bar " + str.tostring(bar_index) + ": Short retest found! slDist=" + str.tostring(slDist, "#.##") + ", tpDist=" + str.tostring(tpDist, "#.##") + " (min=" + str.tostring(minTpPts) + ", max=" + str.tostring(maxTpPts) + ")")
                        break
`;

const p = new PineTS(c5, 'XAUUSD', '5');
await p.ready();
const res = await p.run(debugPine);

const getArr = (name) => {
  const k = Object.keys(res.var ?? {}).find(key => key === name || key.endsWith('_' + name));
  if (!k) return [];
  const v = res.var[k];
  const t = v?.data ? v.data[v.data.length - 1] : v;
  return t?.array || (Array.isArray(t) ? t : []);
};

const reasons = getArr('reasons');
console.log('Total rejection events after bar 4800:', reasons.length);
reasons.slice(0, 30).forEach(r => console.log(' ->', r));
