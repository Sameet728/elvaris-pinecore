import { getDb } from '../../dist/db/database.js';
import { PineTS } from 'pinets';

async function main() {
  const db = getDb();
  const rows = db.prepare('SELECT open_time, open, high, low, close, volume FROM candles ORDER BY open_time ASC').all();
  
  const candles = rows.map(r => ({
    open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
    openTime: r.open_time, closeTime: r.open_time + 300000
  }));

  console.log(`Analyzing ${candles.length} real XAUUSD candles...`);

  // We define diverse algorithmic models with strictly confirmed bar close execution (zero lookahead)
  // and TP strictly between 20 and 40 pips (2.0 to 4.0 points on gold).
  const models = [
    {
      name: 'Trend_VWAP_Pullback_25Pips',
      type: 'Trend / VWAP Momentum',
      script: `// © Antigravity Quant
//@version=6
indicator("Trend_VWAP_Pullback", overlay=true)

emaFast = ta.ema(close, 21)
emaSlow = ta.ema(close, 55)
emaTrend = ta.ema(close, 200)
atr = ta.atr(14)

inLondon = not na(time(timeframe.period, "0700-1200", "Europe/Berlin"))
inNY = not na(time(timeframe.period, "1330-2000", "America/New_York"))
inSession = inLondon or inNY

bullTrend = close > emaTrend and emaFast > emaSlow
bearTrend = close < emaTrend and emaFast < emaSlow

// Signal: Pullback to fast EMA with rejection candle close
longSig = bullTrend and low <= emaFast and close > emaFast and close > open and inSession
shortSig = bearTrend and high >= emaFast and close < emaFast and close < open and inSession

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

// Trade resolution
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
                        array.set(monthR, idx, array.get(monthR, idx) + 2.0)
                        cumulativeR += 2.0
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

// Entry execution (20-40 pips TP = 2.0 to 4.0 points)
if longSig and not hasOpen
    entryP = close
    slDist = math.max(1.2, math.min(1.8, atr * 0.8)) // 12-18 pips SL
    slP = entryP - slDist
    tpP = entryP + slDist * 2.0 // 24-36 pips TP (strictly 1:2 RR)
    array.push(sigDir, 1)
    array.push(sigEntry, entryP)
    array.push(sigSL, slP)
    array.push(sigTP, tpP)
    array.push(sigResult, 0)
    array.push(sigBar, bar_index)

if shortSig and not hasOpen
    entryP = close
    slDist = math.max(1.2, math.min(1.8, atr * 0.8))
    slP = entryP + slDist
    tpP = entryP - slDist * 2.0
    array.push(sigDir, -1)
    array.push(sigEntry, entryP)
    array.push(sigSL, slP)
    array.push(sigTP, tpP)
    array.push(sigResult, 0)
    array.push(sigBar, bar_index)
`
    },
    {
      name: 'Session_Breakout_Pullback_30Pips',
      type: 'Session Liquidity Breakout',
      script: `// © Antigravity Quant
//@version=6
indicator("Session_Breakout_Pullback", overlay=true)

atr = ta.atr(14)
inAsian = not na(time(timeframe.period, "0000-0630", "UTC"))
inLondon = not na(time(timeframe.period, "0700-1130", "Europe/Berlin"))
inNY = not na(time(timeframe.period, "1300-1800", "America/New_York"))

var float asianH = na
var float asianL = na
var bool asianInit = false

if inAsian
    if not inAsian[1]
        asianH := high
        asianL := low
    else
        asianH := math.max(asianH, high)
        asianL := math.min(asianL, low)

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
                        array.set(monthR, idx, array.get(monthR, idx) + 2.0)
                        cumulativeR += 2.0
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

// Breakout and retest of Asian range during London or NY
breakAsianH = not na(asianH) and (inLondon or inNY) and close > asianH and close[1] <= asianH and (high - low) > atr
breakAsianL = not na(asianL) and (inLondon or inNY) and close < asianL and close[1] >= asianL and (high - low) > atr

if breakAsianH and not hasOpen
    entryP = close
    slDist = 1.5 // 15 pips SL
    slP = entryP - slDist
    tpP = entryP + 3.0 // 30 pips TP (1:2 RR)
    array.push(sigDir, 1)
    array.push(sigEntry, entryP)
    array.push(sigSL, slP)
    array.push(sigTP, tpP)
    array.push(sigResult, 0)
    array.push(sigBar, bar_index)

if breakAsianL and not hasOpen
    entryP = close
    slDist = 1.5
    slP = entryP + slDist
    tpP = entryP - 3.0
    array.push(sigDir, -1)
    array.push(sigEntry, entryP)
    array.push(sigSL, slP)
    array.push(sigTP, tpP)
    array.push(sigResult, 0)
    array.push(sigBar, bar_index)
`
    },
    {
      name: 'OrderBlock_Displacement_28Pips',
      type: 'SMC Order Block & BOS',
      script: `// © Antigravity Quant
//@version=6
indicator("OrderBlock_Displacement", overlay=true)

atr = ta.atr(14)
rsi = ta.rsi(close, 14)

inLondon = not na(time(timeframe.period, "0700-1200", "Europe/Berlin"))
inNY = not na(time(timeframe.period, "1330-2000", "America/New_York"))
inSession = inLondon or inNY

// Strong displacement candle (body > 1.2 ATR)
candleBody = math.abs(close - open)
dispBull = close > open and candleBody >= atr * 1.0 and inSession
dispBear = close < open and candleBody >= atr * 1.0 and inSession

// Follow-through confirmation after displacement
longTrigger = dispBull[1] and close > high[1] and rsi > 52 and not dispBull[2]
shortTrigger = dispBear[1] and close < low[1] and rsi < 48 and not dispBear[2]

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
                        array.set(monthR, idx, array.get(monthR, idx) + 2.0)
                        cumulativeR += 2.0
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

if longTrigger and not hasOpen
    entryP = close
    slDist = 1.4 // 14 pips SL
    slP = entryP - slDist
    tpP = entryP + 2.8 // 28 pips TP (1:2 RR)
    array.push(sigDir, 1)
    array.push(sigEntry, entryP)
    array.push(sigSL, slP)
    array.push(sigTP, tpP)
    array.push(sigResult, 0)
    array.push(sigBar, bar_index)

if shortTrigger and not hasOpen
    entryP = close
    slDist = 1.4
    slP = entryP + slDist
    tpP = entryP - 2.8
    array.push(sigDir, -1)
    array.push(sigEntry, entryP)
    array.push(sigSL, slP)
    array.push(sigTP, tpP)
    array.push(sigResult, 0)
    array.push(sigBar, bar_index)
`
    }
  ];

  for (const m of models) {
    const pineTS = new PineTS(candles, 'XAUUSD', '5');
    await pineTS.ready();
    const res = await pineTS.run(m.script);

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

    console.log(`\n================== ${m.name} (${m.type}) ==================`);
    console.log(`Trades: ${tot} | Win Rate: ${wr.toFixed(1)}% | Avg TP: ${avgTp.toFixed(1)} pips`);
    console.log(`Cumulative R: ${cumR.toFixed(1)}R | Max DD: ${maxDD.toFixed(1)}R | Calmar: ${calmar.toFixed(2)}`);
    console.log(`Monthly:`, mReport);
  }
}

main().catch(console.error);
