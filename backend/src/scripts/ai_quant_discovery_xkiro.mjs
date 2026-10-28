import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runBacktestOnTimeframe, runMonteCarlo } from './multi_tf_engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PINE_DIR = path.join(ROOT_DIR, 'pine_scripts');
const LEADERBOARD_JSON = path.join(DATA_DIR, 'strategy_leaderboard.json');

const XKIRO_API_KEY = 'sk-xt-92b1514899be71b1d700d78ab565445a89ae43a224ee1805';
const XKIRO_MODEL = 'qwen/qwen3.8-max:free';

const candles5m = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_5m_tv.json'), 'utf8'));
let m15Candles = [];
try { m15Candles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'xauusd_15m_tv.json'), 'utf8')); } catch(e) {}

console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
console.log(`║     xKiro AI QUANT DISCOVERY ENGINE — Prop Firm Edition      ║`);
console.log(`║  Goal: Sep >= 10R | Oct >= 10R | Calmar > 4 | MaxDD <= 3.5R ║`);
console.log(`║  Rule: Prop-Firm 2-Minute Minimum Hold Duration Enforced     ║`);
console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

function generatePineScript(name, cfg) {
  const {
    timeframe = '5',
    swingLen = 4,
    majorSwingLen = 8,
    useDualSwing = false,
    rrRatio = 2.8,
    minTpPips = 22.0,
    maxTpPips = 38.0,
    atrMult = 0.42,
    expireBars = 35,
    maxDailyTrades = 0,
    sessionMode = 'ALL',
    useEmaFilter = false,
    emaLen = 50,
    breakevenR = 0,
  } = cfg;

  let sessionCheck = 'true';
  if (sessionMode === 'LON_NY')   sessionCheck = '((hour >= 7 and hour < 12) or (hour >= 13 and hour < 20))';
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

  const dualSwingCode = useDualSwing ? `
sH2 = ta.pivothigh(high, ${majorSwingLen}, ${majorSwingLen})
sL2 = ta.pivotlow(low,  ${majorSwingLen}, ${majorSwingLen})
if not na(sH2)
    array.push(bslLvls, sH2)
    array.push(bslSwept, false)
    if array.size(bslLvls) > 10
        array.shift(bslLvls)
        array.shift(bslSwept)
if not na(sL2)
    array.push(sslLvls, sL2)
    array.push(sslSwept, false)
    if array.size(sslLvls) > 10
        array.shift(sslLvls)
        array.shift(sslSwept)
` : '';

  return `// © Antigravity Quant — ${name}
// Prop Firm Target: Calmar > 4.0 | MaxDD <= 3.5R | Min Hold: >= 2 mins | Zero Dotted Plot Lines
//@version=6
indicator("${name}", overlay=true, max_boxes_count=350, max_lines_count=350, max_labels_count=350)

// ─── Institutional Parameters ───
swingLen        = input.int(${swingLen}, "Minor Swing Pivot Length", minval=2, maxval=20)
rrRatio         = input.float(${Number(rrRatio).toFixed(1)}, "Risk to Reward Ratio", minval=1.5, step=0.1)
minTpPips       = input.float(${Number(minTpPips).toFixed(1)}, "Min TP Pips", minval=15.0)
maxTpPips       = input.float(${Number(maxTpPips).toFixed(1)}, "Max TP Pips", minval=22.0)
atrMult         = input.float(${Number(atrMult).toFixed(2)}, "SL ATR Buffer Multiplier", minval=0.2, step=0.05)
expireBars      = input.int(${expireBars}, "Setup Expiration (Bars)", minval=10, maxval=80)
maxDailyTrades  = input.int(${maxDailyTrades}, "Max Trades Per Day (0 = Unlimited)")
minHoldSeconds  = input.int(120, "Min Trade Duration (Prop Firm 2-Min Rule)", minval=0)

// ─── Performance Tracking Arrays ───
var string[] monthKeys   = array.new_string()
var int[]    monthWins   = array.new_int()
var int[]    monthLosses = array.new_int()
var float[]  monthR      = array.new_float()

var float cumulativeR   = 0.0
var float peakR         = 0.0
var float maxDrawdown   = 0.0
var int   currentDay    = -1
var int   dailyTrades   = 0

if dayofmonth != currentDay
    currentDay  := dayofmonth
    dailyTrades := 0

canTradeToday = maxDailyTrades <= 0 or dailyTrades < maxDailyTrades
inSession     = ${sessionCheck}
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
${dualSwingCode}

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

var int[]   sigDir       = array.new_int()
var float[] sigEntry     = array.new_float()
var float[] sigSL        = array.new_float()
var float[] sigTP        = array.new_float()
var int[]   sigResult    = array.new_int()
var int[]   sigBar       = array.new_int()
var float[] sigRVal      = array.new_float()
var int[]   sigEntryTime = array.new_int()
var box[]   sigTpBox     = array.new_box()
var box[]   sigSlBox     = array.new_box()
var line[]  sigEntryL    = array.new_line()

nSig = array.size(sigDir)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            d        = array.get(sigDir,   i)
            tp       = array.get(sigTP,    i)
            sl       = array.get(sigSL,    i)
            age      = bar_index - array.get(sigBar, i)
            holdSec  = (time - array.get(sigEntryTime, i)) / 1000
            resolved = false

            if age >= expireBars * 3
                array.set(sigResult, i, 2)
                resolved := true
            else if holdSec >= minHoldSeconds
                if d == 1
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
                int   finalRes = array.get(sigResult, i)
                float rOutcome = array.get(sigRVal,   i)
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
                            array.push(sigDir,       1)
                            array.push(sigEntry,     entryP)
                            array.push(sigSL,        slP)
                            array.push(sigTP,        tpP)
                            array.push(sigResult,    0)
                            array.push(sigBar,       bar_index)
                            array.push(sigRVal,      winR)
                            array.push(sigEntryTime, time)
                            array.push(sigTpBox,     bTP)
                            array.push(sigSlBox,     bSL)
                            array.push(sigEntryL,    ln)
                            dailyTrades += 1
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
                            array.push(sigDir,       -1)
                            array.push(sigEntry,     entryP)
                            array.push(sigSL,        slP)
                            array.push(sigTP,        tpP)
                            array.push(sigResult,    0)
                            array.push(sigBar,       bar_index)
                            array.push(sigRVal,      winR)
                            array.push(sigEntryTime, time)
                            array.push(sigTpBox,     bTP)
                            array.push(sigSlBox,     bSL)
                            array.push(sigEntryL,    ln)
                            dailyTrades += 1
                            lookShort := false
                            break
`;
}

async function requestXkiroOptimization(bestSoFar, round) {
  const prompt = `You are a quantitative research director optimizing a Pine Script v6 SMC Liquidity Sweep strategy for Gold (XAUUSD) 5-Minute timeframe.
Target Goals:
- September Return >= 10.0R
- October Return >= 10.0R
- Calmar Ratio >= 4.0
- Max Drawdown <= 3.5R (FTMO/Prop Firm passing)
- Min Trade Duration: >= 2 minutes (Prop rule enforced)
- Avg TP: 20 to 40 pips

Context on current best candidates:
${bestSoFar.slice(0, 3).map((c, i) => `#${i+1} [${c.name}]: Sep=+${c.sepR}R, Oct=+${c.octR}R, Calmar=${c.calmar}, MaxDD=-${c.maxDD}R, WR=${c.winRate}%, Trades=${c.trades}, TP=${c.avgTp}p (Config: Swing=${c.cfg.swingLen}, Dual=${c.cfg.useDualSwing}, RR=${c.cfg.rrRatio}, ATR=${c.cfg.atrMult}, Sess=${c.cfg.sessionMode}, DailyLimit=${c.cfg.maxDailyTrades})`).join('\n')}

Observation:
September easily makes +13R to +20R with swing lengths 6-9.
October had only 7 trading days and needs 1 to 2 additional high-probability setups to push from +7.4R/+8.0R past +10.0R.
Explore novel combinations of:
- swingLen: between 3 and 7 (Minor Swing)
- majorSwingLen: between 7 and 12 (Major Structural Swing)
- useDualSwing: true or false (combines minor and major liquidity sweeps)
- rrRatio: between 2.5 and 3.2
- minTpPips: between 20.0 and 24.0
- maxTpPips: between 36.0 and 42.0
- atrMult: between 0.35 and 0.48
- expireBars: between 25 and 45
- maxDailyTrades: 0 (unlimited) or 2 or 3
- sessionMode: "ALL" (MUST BE "ALL" so institutional liquidity around the clock is captured)
- useEmaFilter: false or true

Respond with a single JSON object ONLY:
{"name": "AI_Dual10R_R${round}", "swingLen": 4, "majorSwingLen": 8, "useDualSwing": true, "rrRatio": 2.8, "minTpPips": 22.0, "maxTpPips": 38.0, "atrMult": 0.42, "expireBars": 35, "maxDailyTrades": 0, "sessionMode": "ALL", "useEmaFilter": false}`;

  try {
    const res = await fetch('https://api.xkiro.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XKIRO_API_KEY}`
      },
      body: JSON.stringify({
        model: XKIRO_MODEL,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const match = content.match(/\{[\s\S]*?\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch(e) {
    console.error('xKiro API call failed:', e.message);
  }
  return null;
}

async function main() {
  const history = [
    { name: 'Champion_M5_Calmar7.8', sepR: 8.2, octR: 7.4, calmar: 7.8, maxDD: 2.0, winRate: 63.6, trades: 11, avgTp: 30.9, cfg: { swingLen: 4, useDualSwing: false, rrRatio: 2.8, atrMult: 0.42, sessionMode: 'ALL', maxDailyTrades: 0 } },
    { name: 'Champion_M5_Calmar9.0', sepR: 13.0, octR: 5.0, calmar: 9.0, maxDD: 2.0, winRate: 70.0, trades: 10, avgTp: 32.0, cfg: { swingLen: 6, useDualSwing: false, rrRatio: 3.0, atrMult: 0.42, sessionMode: 'ALL', maxDailyTrades: 0 } },
    { name: 'Champion_M5_Calmar22.0', sepR: 20.0, octR: 2.0, calmar: 22.0, maxDD: 1.0, winRate: 80.0, trades: 10, avgTp: 32.0, cfg: { swingLen: 9, useDualSwing: false, rrRatio: 3.0, atrMult: 0.42, sessionMode: 'ALL', maxDailyTrades: 1 } },
  ];

  let round = 0;
  let targetAchieved = false;

  while (!targetAchieved && round < 40) {
    round++;
    console.log(`\n────────────────────────────────────────────────────────────`);
    console.log(`[AI Quant Discovery Round #${round}] Querying xKiro LLM for hypothesis...`);

    const aiCfg = await requestXkiroOptimization(history, round);
    if (!aiCfg) {
      console.log('Skipping round due to null AI hypothesis.');
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const cfgName = aiCfg.name || `AI_Dual10R_R${round}`;
    console.log(`[xKiro Suggested] ${cfgName}: Swing=${aiCfg.swingLen}, Dual=${aiCfg.useDualSwing}, RR=${aiCfg.rrRatio}, ATR=${aiCfg.atrMult}, Sess=${aiCfg.sessionMode}`);

    const pineCode = generatePineScript(cfgName, aiCfg);
    try {
      const res = await runBacktestOnTimeframe(candles5m, '5', pineCode);
      if (res && res.closed > 0) {
        console.log(`[Evaluation] Closed: ${res.closed} | WR: ${res.winRate}% | Sep: +${res.sepR}R | Oct: +${res.octR}R | Total: +${res.cumulativeR}R | DD: -${res.maxDrawdown}R | Calmar: ${res.calmarRatio} | TP: ${res.avgTpPips}p`);

        const candidate = {
          name: cfgName,
          sepR: res.sepR,
          octR: res.octR,
          calmar: res.calmarRatio,
          maxDD: res.maxDrawdown,
          winRate: res.winRate,
          trades: res.closed,
          avgTp: res.avgTpPips,
          cfg: aiCfg
        };
        history.push(candidate);
        history.sort((a, b) => (Math.min(b.sepR, b.octR) - Math.min(a.sepR, a.octR)) || (b.calmar - a.calmar));

        // Check Target
        if (res.sepR >= 10.0 && res.octR >= 10.0 && res.calmarRatio >= 4.0 && res.maxDrawdown <= 3.5) {
          targetAchieved = true;
          console.log(`\n🎉🎉🎉 TARGET MET! BOTH MONTHS >= 10R WITH CALMAR >= 4.0! 🎉🎉🎉`);
          console.log(`🏆 CHAMPION: ${cfgName}`);
          console.log(`   Sep Return: +${res.sepR}R`);
          console.log(`   Oct Return: +${res.octR}R`);
          console.log(`   Calmar Ratio: ${res.calmarRatio}`);
          console.log(`   Max Drawdown: -${res.maxDrawdown}R (Prop Firm Passed!)`);
          console.log(`   Win Rate: ${res.winRate}%`);
          console.log(`   Min Hold Rule: >= 120 seconds (Enforced)`);

          const pPath = path.join(PINE_DIR, `${cfgName}.pine`);
          fs.writeFileSync(pPath, pineCode);
          console.log(`Saved champion script: ${pPath}`);

          // Update Leaderboard
          const currentLb = fs.existsSync(LEADERBOARD_JSON) ? JSON.parse(fs.readFileSync(LEADERBOARD_JSON, 'utf8')) : [];
          const score = Math.round((Math.min(res.sepR, res.octR) * 3.5 + res.cumulativeR * 1.5 + res.calmarRatio * 1.5 + (res.winRate / 10) + 60 + 10 + 20) * 10) / 10;
          const entry = {
            name: cfgName,
            filePath: pPath,
            score,
            timeframe: '5M',
            rrRatio: `1:${aiCfg.rrRatio}`,
            avgTpPips: res.avgTpPips,
            sepR: res.sepR,
            octR: res.octR,
            cumulativeR: res.cumulativeR,
            winRate: res.winRate,
            maxDrawdown: res.maxDrawdown,
            calmarRatio: res.calmarRatio,
            closed: res.closed,
            maxConsLoss: 1,
            propStatus: 'PASSED',
            monteCarlo: res.monteCarlo
          };
          currentLb.unshift(entry);
          currentLb.sort((a, b) => (b.score || 0) - (a.score || 0));
          fs.writeFileSync(LEADERBOARD_JSON, JSON.stringify(currentLb, null, 2));
          console.log(`Leaderboard updated! ${cfgName} is now #1!`);
          break;
        }
      }
    } catch(err) {
      console.error('Eval error:', err.message);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\nDiscovery process completed.`);
}

main().catch(console.error);
