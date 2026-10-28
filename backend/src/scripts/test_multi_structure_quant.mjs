import { getDb } from '../../dist/db/database.js';
import { PineTS } from 'pinets';

async function main() {
  const db = getDb();
  const rows = db.prepare('SELECT open_time, open, high, low, close, volume FROM candles ORDER BY open_time ASC').all();
  
  const candles = rows.map(r => ({
    open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
    openTime: r.open_time, closeTime: r.open_time + 300000
  }));

  console.log(`Testing Multi-Structure Liquidity Engine against ${candles.length} candles...`);

  const tests = [
    { name: 'MultiPivot_SweepRejection_RR2_25Pips', pivotL: 5, rr: 2.0, minTpPts: 2.5, maxTpPts: 4.0, slPts: 1.25 },
    { name: 'MultiPivot_SweepRejection_RR2.2_30Pips', pivotL: 5, rr: 2.2, minTpPts: 3.0, maxTpPts: 4.5, slPts: 1.35 },
    { name: 'MultiPivot_SweepRejection_RR2.5_35Pips', pivotL: 4, rr: 2.5, minTpPts: 3.0, maxTpPts: 4.5, slPts: 1.30 },
    { name: 'Structure_CHoCH_Rejection_RR2_28Pips', pivotL: 6, rr: 2.0, minTpPts: 2.8, maxTpPts: 4.0, slPts: 1.40 },
  ];

  for (const t of tests) {
    const script = `// © Antigravity Quant
//@version=6
indicator("${t.name}", overlay=true)

pivotLen = ${t.pivotL}
rr = ${t.rr}
minTp = ${t.minTpPts}
maxTp = ${t.maxTpPts}
fixedSL = ${t.slPts}

inLondon = not na(time(timeframe.period, "0700-1200", "Europe/Berlin"))
inNY = not na(time(timeframe.period, "1300-2000", "America/New_York"))
inSession = inLondon or inNY

atr = ta.atr(14)
ph = ta.pivothigh(high, pivotLen, pivotLen)
pl = ta.pivotlow(low, pivotLen, pivotLen)

var float[] highs = array.new_float()
var float[] lows = array.new_float()

if not na(ph)
    array.push(highs, ph)
    if array.size(highs) > 10
        array.shift(highs)

if not na(pl)
    array.push(lows, pl)
    if array.size(lows) > 10
        array.shift(lows)

// Sweep detection on candle close
longSweep = false
shortSweep = false
var float sweepLow = 0.0
var float sweepHigh = 0.0

if array.size(lows) > 0 and inSession
    for i = 0 to array.size(lows) - 1
        lvl = array.get(lows, i)
        // Wicked below pivot low, closed back above pivot low with bullish close
        if low < lvl and close > lvl and close > open
            longSweep := true
            sweepLow := low

if array.size(highs) > 0 and inSession
    for i = 0 to array.size(highs) - 1
        lvl = array.get(highs, i)
        // Wicked above pivot high, closed back below pivot high with bearish close
        if high > lvl and close < lvl and close < open
            shortSweep := true
            sweepHigh := high

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
            if age >= 80
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

// Entry execution on candle close
if longSweep and not hasOpen
    entryP = close
    slP = math.min(sweepLow - 0.2, entryP - fixedSL)
    slDist = entryP - slP
    if slDist >= 1.0 and slDist <= 1.8
        tpDist = slDist * rr
        if tpDist >= minTp and tpDist <= maxTp
            array.push(sigDir, 1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, entryP + tpDist)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)

if shortSweep and not hasOpen
    entryP = close
    slP = math.max(sweepHigh + 0.2, entryP + fixedSL)
    slDist = slP - entryP
    if slDist >= 1.0 and slDist <= 1.8
        tpDist = slDist * rr
        if tpDist >= minTp and tpDist <= maxTp
            array.push(sigDir, -1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, entryP - tpDist)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)
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

    let wins = 0, losses = 0, pips = 0;
    for (let i = 0; i < sigDirs.length; i++) {
      if (sigResults[i] === 1) wins++;
      else if (sigResults[i] === -1) losses++;
      pips += Math.abs(sigTPs[i] - sigEntries[i]) * 10;
    }

    const tot = wins + losses;
    const wr = tot > 0 ? (wins / tot) * 100 : 0;
    const avgTp = sigDirs.length > 0 ? pips / sigDirs.length : 0;
    const cumR = Number(getVarValue('cumulativeR', 0));
    const maxDD = Number(getVarValue('maxDrawdown', 0));
    const calmar = maxDD > 0 ? cumR / maxDD : cumR;

    const mReport = {};
    for (let i = 0; i < mKeys.length; i++) {
      mReport[mKeys[i]] = `${mR[i]}R (${mWins[i]}W/${mLosses[i]}L)`;
    }

    console.log(`\n================== ${t.name} ==================`);
    console.log(`Trades: ${tot} | Win Rate: ${wr.toFixed(1)}% | Avg TP: ${avgTp.toFixed(1)} pips`);
    console.log(`Cumulative R: ${cumR.toFixed(1)}R | Max DD: ${maxDD.toFixed(1)}R | Calmar: ${calmar.toFixed(2)}`);
    console.log(`Monthly:`, mReport);
  }
}

main().catch(console.error);
