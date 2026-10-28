import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PineTS } from 'pinets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');

const m5Candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));

console.log(`Evaluating Break-Even Lock & Trailing Protection on ${m5Candles.length} candles...`);

const tests = [
  { name: 'LSS_BreakEven_Lock_25Pips_RR2.2', beTriggerR: 1.0, rr: 2.2, minTp: 2.2, maxTp: 4.0 },
  { name: 'LSS_BreakEven_Lock_30Pips_RR2.4', beTriggerR: 1.2, rr: 2.4, minTp: 2.5, maxTp: 4.2 },
  { name: 'LSS_BreakEven_Lock_28Pips_RR2.0', beTriggerR: 1.0, rr: 2.0, minTp: 2.2, maxTp: 3.8 },
];

async function main() {
  for (const t of tests) {
    const script = `// © Antigravity Quant
//@version=6
indicator("${t.name}", overlay=true)

swingLen = 6
rrRatio = ${t.rr}
beTriggerR = ${t.beTriggerR}
minTpPts = ${t.minTp}
maxTpPts = ${t.maxTp}
atrMult = 0.4
expireBars = 40

inLondon = not na(time(timeframe.period, "0700-1200", "Europe/Berlin"))
inNY = not na(time(timeframe.period, "1230-2030", "America/New_York"))
inSession = inLondon or inNY

atr = ta.atr(14)
swingH = ta.pivothigh(high, swingLen, swingLen)
swingL = ta.pivotlow(low, swingLen, swingLen)

var float[] bslLvls = array.new_float()
var bool[] bslSwept = array.new_bool()
var float[] sslLvls = array.new_float()
var bool[] sslSwept = array.new_bool()

if not na(swingH)
    array.push(bslLvls, swingH)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 6
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(swingL)
    array.push(sslLvls, swingL)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 6
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

while array.size(bFvgTop) > 25
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 25
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
var float[] sigEntry = array.new_float()
var float[] sigSL = array.new_float()
var float[] sigTP = array.new_float()
var int[] sigResult = array.new_int()
var int[] sigBar = array.new_int()
var float[] sigRVal = array.new_float()
var bool[] sigBeLocked = array.new_bool()

var string[] monthKeys = array.new_string()
var int[] monthWins = array.new_int()
var int[] monthLosses = array.new_int()
var float[] monthR = array.new_float()

var float cumulativeR = 0.0
var float peakR = 0.0
var float maxDrawdown = 0.0
var float currentConsLossR = 0.0
var float maxConsLossR = 0.0

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d = array.get(sigDir, i)
            tp = array.get(sigTP, i)
            sl = array.get(sigSL, i)
            entry = array.get(sigEntry, i)
            beLocked = array.get(sigBeLocked, i)
            age = bar_index - array.get(sigBar, i)
            resolved = false
            
            // Check break-even lock
            if d == 1
                if not beLocked and high >= entry + (entry - sl) * beTriggerR
                    array.set(sigBeLocked, i, true)
                    array.set(sigSL, i, entry + 0.1) // Lock BE + 1 pip
                
                curSL = array.get(sigSL, i)
                if high >= tp
                    array.set(sigResult, i, 1)
                    resolved := true
                else if low <= curSL
                    if array.get(sigBeLocked, i)
                        array.set(sigResult, i, 3) // BE exit
                    else
                        array.set(sigResult, i, -1)
                    resolved := true
            else
                if not beLocked and low <= entry - (sl - entry) * beTriggerR
                    array.set(sigBeLocked, i, true)
                    array.set(sigSL, i, entry - 0.1)
                
                curSL = array.get(sigSL, i)
                if low <= tp
                    array.set(sigResult, i, 1)
                    resolved := true
                else if high >= curSL
                    if array.get(sigBeLocked, i)
                        array.set(sigResult, i, 3)
                    else
                        array.set(sigResult, i, -1)
                    resolved := true
            
            if not resolved and age >= expireBars * 3
                array.set(sigResult, i, 2)
                resolved := true
            
            if resolved
                int finalRes = array.get(sigResult, i)
                float rOutcome = array.get(sigRVal, i)
                if finalRes == 1 or finalRes == -1 or finalRes == 3
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
                        array.set(monthR, idx, array.get(monthR, idx) + rOutcome)
                        cumulativeR += rOutcome
                        if cumulativeR > peakR
                            peakR := cumulativeR
                        currentConsLossR := 0.0
                    else if finalRes == -1
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1)
                        array.set(monthR, idx, array.get(monthR, idx) - 1.0)
                        cumulativeR -= 1.0
                        float dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd
                        currentConsLossR += 1.0
                        if currentConsLossR > maxConsLossR
                            maxConsLossR := currentConsLossR
                    else if finalRes == 3
                        // BE exit (+0.05R net of spread/commission)
                        array.set(monthR, idx, array.get(monthR, idx) + 0.05)
                        cumulativeR += 0.05
                        currentConsLossR := 0.0

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool lookLong = false
var bool lookShort = false
var int setupBarL = 0
var int setupBarS = 0
var float setupSLL = 0.0
var float setupSLS = 0.0

if sslSweep and inSession and not hasOpen
    lookLong := true
    lookShort := false
    setupBarL := bar_index
    setupSLL := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen
    lookShort := true
    lookLong := false
    setupBarS := bar_index
    setupSLS := sweepHigh + atr * atrMult

if not inSession
    lookLong := false
    lookShort := false

if lookLong and (bar_index - setupBarL) > expireBars
    lookLong := false
if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

if lookLong and not hasOpen
    nf = array.size(bFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(bFvgBar, i) > setupBarL
                fTop = array.get(bFvgTop, i)
                fBot = array.get(bFvgBot, i)
                mid = (fTop + fBot) / 2
                if low <= fTop and close > fBot
                    entryP = close
                    slP = setupSLL
                    slDist = entryP - slP
                    if slDist > 0
                        tpP = mid + (mid - slP) * rrRatio
                        tpDist = tpP - entryP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = tpDist / slDist
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, winR)
                            array.push(sigBeLocked, false)
                            lookLong := false
                            break

if lookShort and not hasOpen
    nf = array.size(sFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(sFvgBar, i) > setupBarS
                fTop = array.get(sFvgTop, i)
                fBot = array.get(sFvgBot, i)
                mid = (fTop + fBot) / 2
                if high >= fBot and close < fTop
                    entryP = close
                    slP = setupSLS
                    slDist = slP - entryP
                    if slDist > 0
                        tpP = mid - (slP - mid) * rrRatio
                        tpDist = entryP - tpP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = tpDist / slDist
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, winR)
                            array.push(sigBeLocked, false)
                            lookShort := false
                            break
`;

    const pineTS = new PineTS(m5Candles, 'XAUUSD', '5');
    await pineTS.ready();
    const res = await pineTS.run(script);

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
    const mKeys = getVarArray('monthKeys');
    const mWins = getVarArray('monthWins');
    const mLosses = getVarArray('monthLosses');
    const mR = getVarArray('monthR');

    let wins = 0, losses = 0, beCount = 0, sumPips = 0;
    for (let i = 0; i < sigDirs.length; i++) {
      if (sigResults[i] === 1) wins++;
      else if (sigResults[i] === -1) losses++;
      else if (sigResults[i] === 3) beCount++;
      sumPips += Math.abs(sigTPs[i] - sigEntries[i]) * 10;
    }

    const tot = wins + losses + beCount;
    const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;
    const avgTp = sigDirs.length > 0 ? sumPips / sigDirs.length : 0;
    const cumR = Number(getVarValue('cumulativeR', 0));
    const maxDD = Number(getVarValue('maxDrawdown', 0));
    const calmar = maxDD > 0 ? cumR / maxDD : cumR;

    const mReport = {};
    for (let i = 0; i < mKeys.length; i++) {
      mReport[mKeys[i]] = `${Number(mR[i]).toFixed(1)}R (${mWins[i]}W/${mLosses[i]}L)`;
    }

    console.log(`\n================== ${t.name} ==================`);
    console.log(`Closed Trades: ${tot} (Wins: ${wins}, Losses: ${losses}, BE: ${beCount})`);
    console.log(`Win Rate (decisive): ${wr.toFixed(1)}% | Avg TP: ${avgTp.toFixed(1)} pips`);
    console.log(`Total Return: ${cumR.toFixed(1)}R | Max DD: ${maxDD.toFixed(1)}R | Calmar: ${calmar.toFixed(2)}`);
    console.log(`Monthly:`, mReport);
  }
}

main().catch(console.error);
