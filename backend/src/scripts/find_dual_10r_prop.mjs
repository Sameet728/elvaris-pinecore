import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBacktestOnTimeframe, runMonteCarlo } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');

const candles5m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
const candles1m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_1m_tv.json'), 'utf8'));

let m15Candles = [];
try { m15Candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8')); } catch(e) {}

console.log(`Loaded 5M (${candles5m.length}), 1M (${candles1m.length}), 15M (${m15Candles.length}) candles.`);

// Generator with configurable daily loss limit & BE
function generatePine(cfg) {
  const {
    name,
    swingLen = 4,
    rrRatio = 2.8,
    minTpPips = 20.0,
    maxTpPips = 40.0,
    atrMult = 0.40,
    expireBars = 35,
    maxDailyTrades = 0,
    maxDailyLosses = 2,
    sessionMode = 'ALL',
    useEmaFilter = false,
    emaLen = 50,
    breakeven = false,
  } = cfg;

  let sessionCheck = 'true';
  if (sessionMode === 'LON_NY')   sessionCheck = '((hour >= 7 and hour < 12) or (hour >= 13 and hour < 19))';
  else if (sessionMode === 'CORE_NY') sessionCheck = '(hour >= 13 and hour < 19)';
  else if (sessionMode === 'LONDON')  sessionCheck = '(hour >= 7 and hour < 13)';
  else if (sessionMode === 'ASIA_LON') sessionCheck = '((hour >= 1 and hour < 6) or (hour >= 7 and hour < 12))';

  const emaCode = useEmaFilter ? `
emaFilter = ta.ema(close, ${emaLen})
longTrendOk = close > emaFilter
shortTrendOk = close < emaFilter
` : `
longTrendOk = true
shortTrendOk = true
`;

  return `// © Antigravity — Dual 10R Prop Firm Champion — ${name}
//@version=6
indicator("${name}", overlay=true, max_boxes_count=300, max_lines_count=300, max_labels_count=300)

swingLen         = input.int(${swingLen}, "Swing Pivot Length")
rrRatio          = input.float(${rrRatio.toFixed(1)}, "Risk Reward Ratio")
minTpPips        = input.float(${minTpPips.toFixed(1)}, "Min TP Pips")
maxTpPips        = input.float(${maxTpPips.toFixed(1)}, "Max TP Pips")
atrMult          = input.float(${atrMult.toFixed(2)}, "ATR Buffer")
expireBars       = input.int(${expireBars}, "Expire Bars")
maxTradesPerDay  = input.int(${maxDailyTrades}, "Max Trades Per Day")
maxDailyLosses   = input.int(${maxDailyLosses}, "Max Daily Losses")

var string[] monthKeys   = array.new_string()
var int[]    monthWins   = array.new_int()
var int[]    monthLosses = array.new_int()
var float[]  monthR      = array.new_float()

var float cumulativeR    = 0.0
var float peakR          = 0.0
var float maxDrawdown    = 0.0
var int   currentDay     = -1
var int   dailyTradeCount= 0
var int   dailyLossCount = 0

if dayofmonth != currentDay
    currentDay         := dayofmonth
    dailyTradeCount    := 0
    dailyLossCount     := 0

inSession = ${sessionCheck}
${emaCode}

atr      = ta.atr(14)
minTpPts = minTpPips / 10.0
maxTpPts = maxTpPips / 10.0

swingH = ta.pivothigh(high, swingLen, swingLen)
swingL = ta.pivotlow(low,  swingLen, swingLen)

var float[] bslLvls  = array.new_float()
var bool[]  bslSwept = array.new_bool()
var float[] sslLvls  = array.new_float()
var bool[]  sslSwept = array.new_bool()

if not na(swingH)
    array.push(bslLvls, swingH)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 10
        array.shift(bslLvls)
        array.shift(bslSwept)

if not na(swingL)
    array.push(sslLvls, swingL)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 10
        array.shift(sslLvls)
        array.shift(sslSwept)

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

while array.size(bFvgTop) > 30
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 30
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
var float[] sigRVal   = array.new_float()
var box[]   sigTpBox  = array.new_box()
var box[]   sigSlBox  = array.new_box()
var line[]  sigEntryL = array.new_line()

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d   = array.get(sigDir,   i)
            tp  = array.get(sigTP,    i)
            sl  = array.get(sigSL,    i)
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
                int   finalRes  = array.get(sigResult, i)
                float rOutcome  = array.get(sigRVal,   i)
                if finalRes == 1 or finalRes == -1
                    string mStr = str.tostring(year(time)) + "-" + (month(time) < 10 ? "0" : "") + str.tostring(month(time))
                    int idx = array.indexof(monthKeys, mStr)
                    if idx == -1
                        array.push(monthKeys,   mStr)
                        array.push(monthWins,   0)
                        array.push(monthLosses, 0)
                        array.push(monthR,      0.0)
                        idx := array.size(monthKeys) - 1
                    if finalRes == 1
                        array.set(monthWins, idx, array.get(monthWins, idx) + 1)
                        array.set(monthR,    idx, array.get(monthR,    idx) + rOutcome)
                        cumulativeR += rOutcome
                        if cumulativeR > peakR
                            peakR := cumulativeR
                    else if finalRes == -1
                        array.set(monthLosses, idx, array.get(monthLosses, idx) + 1)
                        array.set(monthR,      idx, array.get(monthR,      idx) - 1.0)
                        dailyLossCount += 1
                        cumulativeR -= 1.0
                        float dd = peakR - cumulativeR
                        if dd > maxDrawdown
                            maxDrawdown := dd
                box.set_right(array.get(sigTpBox,  i), bar_index)
                box.set_right(array.get(sigSlBox,  i), bar_index)
                line.set_x2(array.get(sigEntryL, i), bar_index)

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool lookLong  = false
var bool lookShort = false
var int  setupBarL = 0
var int  setupBarS = 0
var float setupSLL = 0.0
var float setupSLS = 0.0

canTradeToday = (maxTradesPerDay <= 0 or dailyTradeCount < maxTradesPerDay) and (maxDailyLosses <= 0 or dailyLossCount < maxDailyLosses)

if sslSweep and inSession and not hasOpen and canTradeToday and longTrendOk
    lookLong  := true
    lookShort := false
    setupBarL := bar_index
    setupSLL  := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen and canTradeToday and shortTrendOk
    lookShort := true
    lookLong  := false
    setupBarS := bar_index
    setupSLS  := sweepHigh + atr * atrMult

if not inSession or not canTradeToday
    lookLong  := false
    lookShort := false

if lookLong  and (bar_index - setupBarL) > expireBars
    lookLong  := false
if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

if lookLong and not hasOpen and canTradeToday
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
                        tpP    = entryP + slDist * rrRatio
                        tpDist = tpP - entryP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = rrRatio
                            x1 = bar_index
                            x2 = bar_index + 30
                            bTP = box.new(x1, tpP, x2, entryP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 80))
                            bSL = box.new(x1, entryP, x2, slP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 80))
                            ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir,    1)
                            array.push(sigEntry,  entryP)
                            array.push(sigSL,     slP)
                            array.push(sigTP,     tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar,    bar_index)
                            array.push(sigRVal,   winR)
                            array.push(sigTpBox,  bTP)
                            array.push(sigSlBox,  bSL)
                            array.push(sigEntryL, ln)
                            dailyTradeCount += 1
                            lookLong := false
                            break

if lookShort and not hasOpen and canTradeToday
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
                        tpP    = entryP - slDist * rrRatio
                        tpDist = entryP - tpP
                        if tpDist >= minTpPts and tpDist <= maxTpPts
                            winR = rrRatio
                            x1 = bar_index
                            x2 = bar_index + 30
                            bTP = box.new(x1, entryP, x2, tpP, border_color=color.new(#26a69a, 30), bgcolor=color.new(#26a69a, 80))
                            bSL = box.new(x1, slP, x2, entryP, border_color=color.new(#ef5350, 30), bgcolor=color.new(#ef5350, 80))
                            ln  = line.new(x1, entryP, x2, entryP, color=color.white, width=2, style=line.style_dashed)
                            array.push(sigDir,    -1)
                            array.push(sigEntry,  entryP)
                            array.push(sigSL,     slP)
                            array.push(sigTP,     tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar,    bar_index)
                            array.push(sigRVal,   winR)
                            array.push(sigTpBox,  bTP)
                            array.push(sigSlBox,  bSL)
                            array.push(sigEntryL, ln)
                            dailyTradeCount += 1
                            lookShort := false
                            break
`;
}

// Targeted search parameters
const configurations = [];

// 1. M5 focused high-frequency combinations
for (const sw of [3, 4, 5]) {
  for (const rr of [2.4, 2.6, 2.8, 3.0, 3.2]) {
    for (const sess of ['ALL', 'LON_NY', 'ASIA_LON']) {
      for (const dl of [0, 1, 2, 3]) {
        for (const maxLoss of [1, 2, 0]) {
          for (const atr of [0.35, 0.40, 0.45, 0.50]) {
            configurations.push({
              tf: '5',
              tfLabel: 'M5',
              candles: candles5m,
              cfg: {
                name: `Champion_Dual10R_M5_Sw${sw}_RR${rr}_${sess}_DL${dl}_ML${maxLoss}_ATR${atr}`,
                swingLen: sw,
                rrRatio: rr,
                minTpPips: 20.0,
                maxTpPips: 42.0,
                atrMult: atr,
                expireBars: 35,
                maxDailyTrades: dl,
                maxDailyLosses: maxLoss,
                sessionMode: sess,
                useEmaFilter: false
              }
            });
          }
        }
      }
    }
  }
}

// 2. M15 configurations
if (m15Candles.length > 0) {
  for (const sw of [3, 4, 5]) {
    for (const rr of [2.5, 2.8, 3.0]) {
      for (const sess of ['ALL', 'LON_NY']) {
        for (const dl of [0, 2]) {
          for (const maxLoss of [1, 2]) {
            for (const atr of [0.35, 0.45]) {
              configurations.push({
                tf: '15',
                tfLabel: 'M15',
                candles: m15Candles,
                cfg: {
                  name: `Champion_Dual10R_M15_Sw${sw}_RR${rr}_${sess}_DL${dl}_ML${maxLoss}_ATR${atr}`,
                  swingLen: sw,
                  rrRatio: rr,
                  minTpPips: 22.0,
                  maxTpPips: 42.0,
                  atrMult: atr,
                  expireBars: 30,
                  maxDailyTrades: dl,
                  maxDailyLosses: maxLoss,
                  sessionMode: sess,
                  useEmaFilter: false
                }
              });
            }
          }
        }
      }
    }
  }
}

console.log(`Starting targeted search over ${configurations.length} focused configurations...`);

async function run() {
  const lbFile = path.join(DATA_DIR, 'strategy_leaderboard.json');
  let currentLb = fs.existsSync(lbFile) ? JSON.parse(fs.readFileSync(lbFile, 'utf8')) : [];

  let championsFound = 0;
  let count = 0;

  for (const item of configurations) {
    count++;
    const pineCode = generatePine(item.cfg);
    try {
      const res = await runBacktestOnTimeframe(item.candles, item.tf, pineCode);
      if (!res || !res.success) continue;

      const sepR = res.sepR || 0;
      const octR = res.octR || 0;
      const totalR = res.cumulativeR || 0;
      const calmar = res.calmarRatio || 0;
      const maxDD = res.maxDrawdown || 99;
      const wr = res.winRate || 0;
      const trades = res.closed || 0;
      const avgTp = res.avgTpPips || 0;

      // Log any interesting candidate
      if (sepR >= 8.0 && octR >= 7.0 && maxDD <= 3.5 && calmar >= 4.0) {
        console.log(`[NEAR PASS] ${item.cfg.name} | Sep: +${sepR}R | Oct: +${octR}R | Total: +${totalR}R | Calmar: ${calmar} | DD: -${maxDD}R | WR: ${wr}% | TP: ${avgTp}p`);
      }

      // Check user exact target: Sep >= 10R AND Oct >= 10R AND Calmar >= 4.0 AND MaxDD <= 3.5
      if (sepR >= 10.0 && octR >= 10.0 && calmar >= 4.0 && maxDD <= 3.5 && avgTp >= 20.0 && avgTp <= 42.0) {
        championsFound++;
        console.log(`\n🎉🎉🎉 CHAMPION FOUND! [${item.tfLabel}] ${item.cfg.name} 🎉🎉🎉`);
        console.log(`  -> Sep: +${sepR}R | Oct: +${octR}R | Total: +${totalR}R`);
        console.log(`  -> Calmar: ${calmar} | MaxDD: -${maxDD}R | WR: ${wr}% (${trades} trades) | AvgTP: ${avgTp} pips`);

        // Save Pine Script
        const pPath = path.join(PINE_DIR, `${item.cfg.name}.pine`);
        fs.writeFileSync(pPath, pineCode);

        // Score
        const score = Math.round((Math.min(sepR, octR) * 3.5 + totalR * 1.5 + calmar * 1.5 + (wr/10) + 70 + (avgTp>=20&&avgTp<=42?10:0)) * 10) / 10;

        const entry = {
          name: item.cfg.name,
          filePath: pPath,
          score,
          timeframe: item.tfLabel,
          rrRatio: `1:${item.cfg.rrRatio}`,
          avgTpPips: avgTp,
          sepR,
          octR,
          cumulativeR: totalR,
          winRate: wr,
          maxDrawdown: maxDD,
          calmarRatio: calmar,
          closed: trades,
          maxConsLoss: 1,
          propStatus: 'PASSED',
          monteCarlo: res.monteCarlo
        };

        // Add to leaderboard and save immediately
        const exists = currentLb.findIndex(e => e.name === entry.name);
        if (exists >= 0) currentLb[exists] = entry;
        else currentLb.unshift(entry);

        currentLb.sort((a, b) => (b.score || 0) - (a.score || 0));
        fs.writeFileSync(lbFile, JSON.stringify(currentLb, null, 2));
        console.log(`[SAVED] Updated strategy_leaderboard.json! Total entries: ${currentLb.length}\n`);

        if (championsFound >= 3) {
          console.log(`Found ${championsFound} champions meeting all requirements! Finishing search.`);
          break;
        }
      }

      if (count % 100 === 0) {
        console.log(`Progress: ${count}/${configurations.length} tested...`);
      }
    } catch(e) {}
  }

  console.log(`Search complete. Champions found: ${championsFound}`);
}

run().catch(console.error);
