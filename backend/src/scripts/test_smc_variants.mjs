import { getDb } from '../../dist/db/database.js';
import { PineTS } from 'pinets';

async function testSmcVariants() {
  const db = getDb();
  const rows = db.prepare('SELECT open_time, open, high, low, close, volume FROM candles ORDER BY open_time ASC').all();
  
  const candles = rows.map(r => ({
    open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
    openTime: r.open_time, closeTime: r.open_time + 300000
  }));

  console.log(`Evaluating against ${candles.length} candles...`);

  // We test different combinations:
  // swingLen: 5, 7, 10
  // minTpPips: 20, 25, 30
  // rrRatio: 1.8, 2.0, 2.2, 2.5
  // maxBarAtr: 1.0, 1.2, 1.5, 2.0
  // useSessions: true / false
  
  const variants = [
    { name: 'SMC_Dynamic_25Pips_RR2', swingLen: 7, minTpPips: 25, maxTpPips: 40, rr: 2.0, maxRiskAtr: 1.2, sessionOnly: true },
    { name: 'SMC_Expanded_20Pips_RR2.2', swingLen: 6, minTpPips: 20, maxTpPips: 40, rr: 2.2, maxRiskAtr: 1.5, sessionOnly: false },
    { name: 'SMC_TrendFilter_30Pips_RR2', swingLen: 8, minTpPips: 30, maxTpPips: 45, rr: 2.0, maxRiskAtr: 1.3, sessionOnly: true },
    { name: 'SMC_HighFreq_20Pips_RR1.8', swingLen: 5, minTpPips: 20, maxTpPips: 35, rr: 1.8, maxRiskAtr: 1.6, sessionOnly: false },
    { name: 'SMC_Institutional_25Pips_RR2.5', swingLen: 8, minTpPips: 25, maxTpPips: 40, rr: 2.5, maxRiskAtr: 1.4, sessionOnly: true },
  ];

  for (const v of variants) {
    const script = `// © Antigravity
//@version=6
indicator("${v.name}", overlay=true)

swingLen = ${v.swingLen}
minTpPts = ${v.minTpPips / 10.0}
maxTpPts = ${v.maxTpPips / 10.0}
rr = ${v.rr}
maxRiskAtr = ${v.maxRiskAtr}
sessionOnly = ${v.sessionOnly}

inLondon = not na(time(timeframe.period, "0700-1200", "Europe/Berlin"))
inNY = not na(time(timeframe.period, "1330-2000", "America/New_York"))
inSession = not sessionOnly or (inLondon or inNY)

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
    if array.size(bslLvls) > 8
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(swingL)
    array.push(sslLvls, swingL)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 8
        array.shift(sslLvls)
        array.shift(sslSwept)

// FVG
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

// Sweep detection
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

// Trade signals & results tracking
var int[] sigDir = array.new_int()
var float[] sigEntry = array.new_float()
var float[] sigSL = array.new_float()
var float[] sigTP = array.new_float()
var int[] sigResult = array.new_int()
var int[] sigBar = array.new_int()

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
            age = bar_index - array.get(sigBar, i)
            resolved = false
            if age >= 100
                array.set(sigResult, i, 2)
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
                        array.set(monthR, idx, array.get(monthR, idx) + rr)
                        cumulativeR += rr
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
    setupSLL := sweepLow - atr * 0.4

if bslSweep and inSession and not hasOpen
    lookShort := true
    lookLong := false
    setupBarS := bar_index
    setupSLS := sweepHigh + atr * 0.4

if lookLong and (bar_index - setupBarL) > 40
    lookLong := false
if lookShort and (bar_index - setupBarS) > 40
    lookShort := false

// Entry strictly on candle close
if lookLong and not hasOpen
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
                    if slDist >= 1.0 and slDist <= atr * maxRiskAtr
                        calcTpDist = slDist * rr
                        if calcTpDist >= minTpPts and calcTpDist <= maxTpPts
                            tpP = entryP + calcTpDist
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
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
                    slP = setupSLS
                    slDist = slP - entryP
                    if slDist >= 1.0 and slDist <= atr * maxRiskAtr
                        calcTpDist = slDist * rr
                        if calcTpDist >= minTpPts and calcTpDist <= maxTpPts
                            tpP = entryP - calcTpDist
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            lookShort := false
                            break
`;

    const pineTS = new PineTS(candles, 'XAUUSD', '5');
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

    let totalWins = 0, totalLosses = 0, sumPips = 0;
    for (let i = 0; i < sigDirs.length; i++) {
      if (sigResults[i] === 1) totalWins++;
      else if (sigResults[i] === -1) totalLosses++;
      sumPips += Math.abs(sigTPs[i] - sigEntries[i]) * 10;
    }
    const totClosed = totalWins + totalLosses;
    const wr = totClosed > 0 ? (totalWins / totClosed) * 100 : 0;
    const avgTpPips = sigDirs.length > 0 ? sumPips / sigDirs.length : 0;
    const cumR = Number(getVarValue('cumulativeR', 0));
    const maxDD = Number(getVarValue('maxDrawdown', 0));
    const calmar = maxDD > 0 ? cumR / maxDD : cumR;

    const monthlySummary = {};
    for (let i = 0; i < mKeys.length; i++) {
      monthlySummary[mKeys[i]] = `${mR[i]}R (${mWins[i]}W/${mLosses[i]}L)`;
    }

    console.log(`\n================== ${v.name} ==================`);
    console.log(`Closed Trades: ${totClosed} | WinRate: ${wr.toFixed(1)}% | Avg TP: ${avgTpPips.toFixed(1)} pips`);
    console.log(`Total R: ${cumR.toFixed(1)}R | Max DD: ${maxDD.toFixed(1)}R | Calmar: ${calmar.toFixed(2)}`);
    console.log(`Monthly:`, monthlySummary);
  }
}

testSmcVariants().catch(console.error);
