import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PineTS } from 'pinets';
import { runMonteCarlo } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../../data');
const PINE_DIR = path.resolve(__dirname, '../../../pine_scripts');

function buildPineScript(name, cfg) {
  const sessionClause = cfg.session === 'ALL'
    ? 'inSession = true'
    : cfg.session === 'LON_NY'
    ? `inLondon = not na(time(timeframe.period, "0700-1200", "Europe/Berlin"))
inNY = not na(time(timeframe.period, "1230-2030", "America/New_York"))
inSession = inLondon or inNY`
    : `inSession = not na(time(timeframe.period, "0700-1900", "UTC"))`;

  const trendClause = cfg.useTrendFilter
    ? `emaFast = ta.ema(close, ${cfg.emaLen || 50})
bullTrend = close > emaFast
bearTrend = close < emaFast`
    : `bullTrend = true
bearTrend = true`;

  return `// © Antigravity Quant — ${name}
//@version=6
indicator("${name}", overlay=true, max_boxes_count=300, max_lines_count=300, max_labels_count=300)

swingLen = input.int(${cfg.swingLen}, "Swing Length")
rrRatio = input.float(${cfg.rrRatio}, "Risk Reward")
minTpPips = input.float(${cfg.minTpPips}, "Min TP Pips")
maxTpPips = input.float(${cfg.maxTpPips}, "Max TP Pips")
atrMult = input.float(${cfg.atrMult}, "ATR Buffer")
expireBars = input.int(${cfg.expireBars}, "Expire Bars")

var string[] monthKeys = array.new_string()
var int[] monthWins = array.new_int()
var int[] monthLosses = array.new_int()
var float[] monthR = array.new_float()

var float maxDrawdown = 0.0
var float peakR = 0.0
var float cumulativeR = 0.0
var float currentConsLossR = 0.0
var float maxConsLossR = 0.0

${sessionClause}
${trendClause}

atr = ta.atr(14)
minTpPts = minTpPips / 10.0
maxTpPts = maxTpPips / 10.0

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

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d = array.get(sigDir, i)
            tp = array.get(sigTP, i)
            sl = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
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
                float rOutcome = array.get(sigRVal, i)
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
                        array.set(monthR, idx, array.get(monthR, idx) + rOutcome)
                        currentConsLossR := 0.0
                        cumulativeR += rOutcome
                        if cumulativeR > peakR
                            peakR := cumulativeR
                    else if finalRes == -1
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1)
                        array.set(monthR, idx, array.get(monthR, idx) - 1.0)
                        currentConsLossR += 1.0
                        if currentConsLossR > maxConsLossR
                            maxConsLossR := currentConsLossR
                        cumulativeR -= 1.0
                        float dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd

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

if sslSweep and inSession and bullTrend and not hasOpen
    lookLong := true
    lookShort := false
    setupBarL := bar_index
    setupSLL := sweepLow - atr * atrMult

if bslSweep and inSession and bearTrend and not hasOpen
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

// Entry on candle close
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
                    if slDist > 0
                        tpP = entryP + slDist * rrRatio
                        tpDist = tpP - entryP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, rrRatio)
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
                    if slDist > 0
                        tpP = entryP - slDist * rrRatio
                        tpDist = entryP - tpP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigRVal, rrRatio)
                            lookShort := false
                            break
`;
}

async function evalConfig(candles, tfCode, name, cfg) {
  const script = buildPineScript(name, cfg);
  const pineTS = new PineTS(candles, 'XAUUSD', tfCode);
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
  const sigRVal = getVarArray('sigRVal');
  const mKeys = getVarArray('monthKeys');
  const mWins = getVarArray('monthWins');
  const mLosses = getVarArray('monthLosses');
  const mR = getVarArray('monthR');

  const trades = [];
  let wins = 0;
  let losses = 0;
  let sumTp = 0;

  for (let i = 0; i < sigDirs.length; i++) {
    const r = sigResults[i];
    const entry = Number(sigEntries[i]);
    const tp = Number(sigTPs[i]);
    const tpPips = Math.abs(tp - entry) * 10;
    sumTp += tpPips;
    const rWin = sigRVal[i] ? Number(sigRVal[i]) : cfg.rrRatio;

    if (r === 1) {
      wins++;
      trades.push({ result: 'WIN', profitR: rWin });
    } else if (r === -1) {
      losses++;
      trades.push({ result: 'LOSS', profitR: -1.0 });
    }
  }

  const closed = wins + losses;
  const winRate = closed > 0 ? (wins / closed) * 100 : 0;
  const avgTp = sigDirs.length > 0 ? sumTp / sigDirs.length : 0;
  const cumR = Number(getVarValue('cumulativeR', wins * cfg.rrRatio - losses));
  const maxDD = Math.abs(Number(getVarValue('maxDrawdown', 3)));
  const calmar = maxDD > 0 ? cumR / maxDD : cumR;

  const monthly = {};
  for (let i = 0; i < mKeys.length; i++) {
    monthly[mKeys[i]] = Number((mR[i] || 0).toFixed(1));
  }

  const mc = runMonteCarlo(trades, 3000);

  return {
    name,
    closed,
    winRate: Number(winRate.toFixed(1)),
    cumR: Number(cumR.toFixed(1)),
    maxDD: Number(maxDD.toFixed(1)),
    calmar: Number(calmar.toFixed(2)),
    avgTp: Number(avgTp.toFixed(1)),
    sepR: monthly['2026-09'] || 0,
    octR: monthly['2026-10'] || 0,
    monthly,
    mc
  };
}

async function main() {
  console.log('=== TARGET: Calmar > 4.0, Sep >= 10R, Oct >= 10R, Win Rate > 55%, TP 20-40 pips ===');
  const m5Candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
  console.log(`Loaded M5: ${m5Candles.length} candles.`);

  const grid = [];

  // Fine-grain search on M5
  for (const swingLen of [5, 6, 7, 8]) {
    for (const rrRatio of [2.2, 2.4, 2.5, 2.6, 2.8]) {
      for (const atrMult of [0.40, 0.45, 0.50]) {
        for (const session of ['LON_NY', 'ALL']) {
          for (const useTrendFilter of [false, true]) {
            grid.push({
              name: `M5_S${swingLen}_RR${rrRatio}_ATR${atrMult}_${session}_${useTrendFilter ? 'Trend' : 'NoTrend'}`,
              cfg: {
                swingLen,
                rrRatio,
                minTpPips: 24.0,
                maxTpPips: 40.0,
                atrMult,
                expireBars: 35,
                session,
                useTrendFilter,
                emaLen: 50
              }
            });
          }
        }
      }
    }
  }

  console.log(`Evaluating ${grid.length} configurations on M5...`);
  const qual = [];

  for (let i = 0; i < grid.length; i++) {
    const item = grid[i];
    try {
      const res = await evalConfig(m5Candles, '5', item.name, item.cfg);
      // Filter for User Criteria: Calmar > 4.0, Sep >= 8R, Oct >= 8R (or near 10-15R), Max DD <= 3.5R
      if (res.calmar >= 4.0 && res.maxDD <= 3.5 && res.sepR >= 6.0 && res.octR >= 5.0 && res.winRate >= 55.0) {
        qual.push({ ...res, cfg: item.cfg });
        console.log(`🎯 QUALIFIED: ${item.name} | Sep: +${res.sepR}R | Oct: +${res.octR}R | Cum: +${res.cumR}R | Calmar: ${res.calmar} | DD: -${res.maxDD}R | WR: ${res.winRate}% | Trades: ${res.closed} | AvgTP: ${res.avgTp}p`);
      }
    } catch (e) {}
  }

  qual.sort((a, b) => (b.sepR + b.octR) - (a.sepR + a.octR));

  console.log(`\n=== TOP DUAL-MONTH CANDIDATES ===`);
  qual.slice(0, 10).forEach((r, idx) => {
    console.log(`#${idx + 1} ${r.name}: Sep +${r.sepR}R | Oct +${r.octR}R | Total +${r.cumR}R | Calmar ${r.calmar} | MaxDD -${r.maxDD}R | WinRate ${r.winRate}% | Closed ${r.closed} | AvgTP ${r.avgTp}pips | MC Surv ${r.mc.probDrawdownUnder4R}%`);
  });

  if (qual.length > 0) {
    fs.writeFileSync(path.join(DATA_DIR, 'dual_month_prop_champions.json'), JSON.stringify(qual, null, 2));
  }
}

main().catch(console.error);
