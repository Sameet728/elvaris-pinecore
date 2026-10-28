import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Let's inspect what happened between bar 4800 and 5520
// Let's instrument the Pine script with logging arrays to see every sweep and every candidate setup
const debugPine = `//@version=6
indicator("Debug", overlay=true)
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

var int[] sigDir = array.new_int()
var int[] sigResult = array.new_int()

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var string[] debugEvents = array.new_string()

if bar_index >= 4800
    if sslSweep
        array.push(debugEvents, "Bar " + str.tostring(bar_index) + ": SSL Sweep at " + str.tostring(sweepLow) + " (hasOpen=" + str.tostring(hasOpen) + ")")
    if bslSweep
        array.push(debugEvents, "Bar " + str.tostring(bar_index) + ": BSL Sweep at " + str.tostring(sweepHigh) + " (hasOpen=" + str.tostring(hasOpen) + ")")
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

const events = getArr('debugEvents');
console.log('Sweeps detected after bar 4800:', events.length);
events.forEach(e => console.log(' ->', e));
