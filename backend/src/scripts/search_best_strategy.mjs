import http from 'http';
import fs from 'fs';

function runPineScript(script) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ script, maxBars: 6000 });
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path: '/api/execute',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function runMonteCarlo(trades, iterations = 5000) {
  const closed = trades
    .filter(t => t.result === 'WIN' || t.result === 'LOSS')
    .map(t => (t.result === 'WIN' ? (t.profitR || 2.0) : -1.0));

  if (closed.length < 5) return null;

  const N = closed.length;
  const simMaxDDs = [];
  const simFinalRs = [];
  const simCalmars = [];
  const simMaxConsL = [];

  for (let iter = 0; iter < iterations; iter++) {
    let cumR = 0;
    let peak = 0;
    let maxDD = 0;
    let consL = 0;
    let maxConsL = 0;

    for (let i = 0; i < N; i++) {
      const idx = Math.floor(Math.random() * closed.length);
      const r = closed[idx];
      cumR += r;
      if (cumR > peak) peak = cumR;
      const dd = peak - cumR;
      if (dd > maxDD) maxDD = dd;

      if (r < 0) {
        consL++;
        if (consL > maxConsL) maxConsL = consL;
      } else {
        consL = 0;
      }
    }

    simMaxDDs.push(maxDD);
    simFinalRs.push(cumR);
    simMaxConsL.push(maxConsL);
    const effDD = Math.max(maxDD, 0.5);
    simCalmars.push(cumR > 0 ? cumR / effDD : 0);
  }

  simMaxDDs.sort((a, b) => a - b);
  simFinalRs.sort((a, b) => a - b);
  simCalmars.sort((a, b) => a - b);
  simMaxConsL.sort((a, b) => a - b);

  const p = (arr, pct) => arr[Math.floor((pct / 100) * arr.length)];

  return {
    sampleTrades: closed.length,
    dd_median: Number(p(simMaxDDs, 50).toFixed(2)),
    dd_95thWorst: Number(p(simMaxDDs, 95).toFixed(2)),
    r_median: Number(p(simFinalRs, 50).toFixed(2)),
    r_5thWorst: Number(p(simFinalRs, 5).toFixed(2)),
    r_95thBest: Number(p(simFinalRs, 95).toFixed(2)),
    calmar_median: Number(p(simCalmars, 50).toFixed(2)),
    calmar_5thWorst: Number(p(simCalmars, 5).toFixed(2)),
    consLoss_95thWorst: p(simMaxConsL, 95),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. STRATEGY: LSS Tight Rejection (No Chase)
// Only enter on candle close if the confirmation candle is NOT overextended
// (i.e. close is close to SL, preserving tight risk and reachable 1:2 TP)
// ─────────────────────────────────────────────────────────────────────────────
function makeLssTightRejectionScript(maxBarAtr = 0.8, rr = 2.0) {
  return `// © Antigravity Quant
//@version=6
indicator("LSS Tight Rejection", overlay=true)

swingLen   = 10
maxLevels  = 5
atrMult    = 0.5
rrRatio    = ${rr}
expireBars = 30
sessionLon = "0700-1200"
sessionNY  = "1330-2000"

inLondon  = not na(time(timeframe.period, sessionLon, "Europe/Berlin"))
inNY      = not na(time(timeframe.period, sessionNY,  "America/New_York"))
inSession = inLondon or inNY

atr = ta.atr(14)

swingH = ta.pivothigh(high, swingLen, swingLen)
swingL = ta.pivotlow(low,  swingLen, swingLen)

var float[] bslLvls  = array.new_float()
var bool[]  bslSwept = array.new_bool()
var float[] sslLvls  = array.new_float()
var bool[]  sslSwept = array.new_bool()

f_trimLiq(float[] lvls, bool[] sw, int maxN) =>
    while array.size(lvls) > maxN
        array.shift(lvls)
        array.shift(sw)

if not na(swingH)
    array.push(bslLvls, swingH)
    array.push(bslSwept, false)
    f_trimLiq(bslLvls, bslSwept, maxLevels)

if not na(swingL)
    array.push(sslLvls, swingL)
    array.push(sslSwept, false)
    f_trimLiq(sslLvls, sslSwept, maxLevels)

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

while array.size(bFvgTop) > 20
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 20
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

if array.size(sigDir) > 0
    for i = 0 to array.size(sigDir) - 1
        if array.get(sigResult, i) == 0
            d   = array.get(sigDir, i)
            tp  = array.get(sigTP, i)
            sl  = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            if age >= expireBars * 3
                array.set(sigResult, i, 2)
            else if d == 1
                if high >= tp
                    array.set(sigResult, i, 1)
                else if low <= sl
                    array.set(sigResult, i, -1)
            else
                if low <= tp
                    array.set(sigResult, i, 1)
                else if high >= sl
                    array.set(sigResult, i, -1)

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool  lookLong  = false
var bool  lookShort = false
var int   setupBarL = 0
var int   setupBarS = 0
var float setupSLL  = 0.0
var float setupSLS  = 0.0

if sslSweep and inSession and not hasOpen
    lookLong  := true
    lookShort := false
    setupBarL := bar_index
    setupSLL  := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen
    lookShort := true
    lookLong  := false
    setupBarS := bar_index
    setupSLS  := sweepHigh + atr * atrMult

if not inSession or ((bar_index - setupBarL) > expireBars)
    lookLong := false
if not inSession or ((bar_index - setupBarS) > expireBars)
    lookShort := false

// Entry on CLOSE of confirmation candle, with tight risk filter
if lookLong and not hasOpen
    if array.size(bFvgBar) > 0
        for i = array.size(bFvgBar) - 1 to 0
            if array.get(bFvgBar, i) > setupBarL
                fTop = array.get(bFvgTop, i)
                fBot = array.get(bFvgBot, i)
                if low <= fTop and close > fBot
                    entryP = close
                    slP    = setupSLL
                    slDist = entryP - slP
                    // Anti-Chasing Filter: Risk distance must NOT exceed maxBarAtr * atr
                    if slDist > 0 and slDist <= atr * ${maxBarAtr}
                        tpP = entryP + slDist * rrRatio
                        array.push(sigDir, 1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        lookLong := false
                        break

if lookShort and not hasOpen
    if array.size(sFvgBar) > 0
        for i = array.size(sFvgBar) - 1 to 0
            if array.get(sFvgBar, i) > setupBarS
                fTop = array.get(sFvgTop, i)
                fBot = array.get(sFvgBot, i)
                if high >= fBot and close < fTop
                    entryP = close
                    slP    = setupSLS
                    slDist = slP - entryP
                    if slDist > 0 and slDist <= atr * ${maxBarAtr}
                        tpP = entryP - slDist * rrRatio
                        array.push(sigDir, -1)
                        array.push(sigEntry, entryP)
                        array.push(sigSL, slP)
                        array.push(sigTP, tpP)
                        array.push(sigResult, 0)
                        array.push(sigBar, bar_index)
                        lookShort := false
                        break

plot(setupSLL != 0 ? setupSLL : na, "Setup SL Long")
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. STRATEGY: Pin Bar Liquidity Wick Reversal (PinBar-Reversal)
// Pure price action: High-volume rejection wick at institutional levels
// ─────────────────────────────────────────────────────────────────────────────
function makePinBarScript(rr = 2.0, minWickPct = 0.6) {
  return `// © Antigravity Quant
//@version=6
indicator("Pin Bar Liquidity Reversal", overlay=true)

rrRatio    = ${rr}
sessionLon = "0700-1200"
sessionNY  = "1330-2000"

inLondon  = not na(time(timeframe.period, sessionLon, "Europe/Berlin"))
inNY      = not na(time(timeframe.period, sessionNY,  "America/New_York"))
inSession = inLondon or inNY

atr = ta.atr(14)
range_1 = high - low
body    = math.abs(close - open)

// Pin bar definitions
bullPin = range_1 > 0 and ((math.min(open, close) - low) / range_1) >= ${minWickPct} and body <= range_1 * 0.35 and close > open
bearPin = range_1 > 0 and ((high - math.max(open, close)) / range_1) >= ${minWickPct} and body <= range_1 * 0.35 and close < open

// Recent 20-bar extreme filter
isLowestLow   = low == ta.lowest(low, 20)
isHighestHigh = high == ta.highest(high, 20)

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()

if array.size(sigDir) > 0
    for i = 0 to array.size(sigDir) - 1
        if array.get(sigResult, i) == 0
            d   = array.get(sigDir, i)
            tp  = array.get(sigTP, i)
            sl  = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            if age >= 60
                array.set(sigResult, i, 2)
            else if d == 1
                if high >= tp
                    array.set(sigResult, i, 1)
                else if low <= sl
                    array.set(sigResult, i, -1)
            else
                if low <= tp
                    array.set(sigResult, i, 1)
                else if high >= sl
                    array.set(sigResult, i, -1)

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

if inSession and not hasOpen
    if bullPin and isLowestLow[1]
        entryP = close
        slP    = low - atr * 0.2
        slDist = entryP - slP
        if slDist > 0 and slDist <= atr * 1.5
            tpP = entryP + slDist * rrRatio
            array.push(sigDir, 1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)

    if bearPin and isHighestHigh[1]
        entryP = close
        slP    = high + atr * 0.2
        slDist = slP - entryP
        if slDist > 0 and slDist <= atr * 1.5
            tpP = entryP - slDist * rrRatio
            array.push(sigDir, -1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)

plot(ta.lowest(low, 20), "Support", color=color.green)
plot(ta.highest(high, 20), "Resistance", color=color.red)
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. STRATEGY: London Opening Range Expansion (London-ORB)
// ─────────────────────────────────────────────────────────────────────────────
function makeLondonOrbScript(rr = 2.0) {
  return `// © Antigravity Quant
//@version=6
indicator("London Opening Range Breakout", overlay=true)

rrRatio = ${rr}
atr = ta.atr(14)

sessionRange = input.session("0700-0730", "Opening Range")
sessionTrade = input.session("0735-1200", "Trade Window")

inRange = not na(time(timeframe.period, sessionRange, "UTC"))
inTrade = not na(time(timeframe.period, sessionTrade, "UTC"))

var float orbHigh = na
var float orbLow  = na
var bool  tradeTaken = false
var int   lastDay = -1

if dayofmonth(time) != lastDay
    lastDay := dayofmonth(time)
    orbHigh := na
    orbLow  := na
    tradeTaken := false

if inRange
    orbHigh := na(orbHigh) ? high : math.max(orbHigh, high)
    orbLow  := na(orbLow) ? low : math.min(orbLow, low)

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()

if array.size(sigDir) > 0
    for i = 0 to array.size(sigDir) - 1
        if array.get(sigResult, i) == 0
            d   = array.get(sigDir, i)
            tp  = array.get(sigTP, i)
            sl  = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            if age >= 60
                array.set(sigResult, i, 2)
            else if d == 1
                if high >= tp
                    array.set(sigResult, i, 1)
                else if low <= sl
                    array.set(sigResult, i, -1)
            else
                if low <= tp
                    array.set(sigResult, i, 1)
                else if high >= sl
                    array.set(sigResult, i, -1)

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

if inTrade and not hasOpen and not tradeTaken and not na(orbHigh) and not na(orbLow)
    orbRange = orbHigh - orbLow
    if orbRange > 0 and orbRange < atr * 4.0
        // Breakout Long on bar close above ORB High
        if close > orbHigh and close > open
            entryP = close
            slP    = orbHigh - orbRange * 0.5 // SL at range midpoint
            slDist = entryP - slP
            if slDist > 0
                tpP = entryP + slDist * rrRatio
                array.push(sigDir, 1)
                array.push(sigEntry, entryP)
                array.push(sigSL, slP)
                array.push(sigTP, tpP)
                array.push(sigResult, 0)
                array.push(sigBar, bar_index)
                tradeTaken := true

        // Breakout Short on bar close below ORB Low
        else if close < orbLow and close < open
            entryP = close
            slP    = orbLow + orbRange * 0.5
            slDist = slP - entryP
            if slDist > 0
                tpP = entryP - slDist * rrRatio
                array.push(sigDir, -1)
                array.push(sigEntry, entryP)
                array.push(sigSL, slP)
                array.push(sigTP, tpP)
                array.push(sigResult, 0)
                array.push(sigBar, bar_index)
                tradeTaken := true

plot(orbHigh, "ORB High", color=color.blue)
plot(orbLow, "ORB Low", color=color.blue)
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. STRATEGY: Keltner Volatility Contraction Squeeze Breakout (Keltner-Squeeze)
// ─────────────────────────────────────────────────────────────────────────────
function makeKeltnerSqueezeScript(rr = 2.0) {
  return `// © Antigravity Quant
//@version=6
indicator("Keltner Squeeze Breakout", overlay=true)

rrRatio = ${rr}
atr = ta.atr(14)
ema20 = ta.ema(close, 20)

// Bollinger Bands (20, 2.0)
basis = ta.sma(close, 20)
dev   = 2.0 * ta.stdev(close, 20)
upperBB = basis + dev
lowerBB = basis - dev

// Keltner Channels (20, 1.5 ATR)
upperKC = ema20 + 1.5 * atr
lowerKC = ema20 - 1.5 * atr

// Squeeze condition: BB inside KC
squeeze = lowerBB > lowerKC and upperBB < upperKC

// Session
sessionTrade = input.session("0700-1900", "Trade Window")
inTrade = not na(time(timeframe.period, sessionTrade, "UTC"))

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()

if array.size(sigDir) > 0
    for i = 0 to array.size(sigDir) - 1
        if array.get(sigResult, i) == 0
            d   = array.get(sigDir, i)
            tp  = array.get(sigTP, i)
            sl  = array.get(sigSL, i)
            age = bar_index - array.get(sigBar, i)
            if age >= 60
                array.set(sigResult, i, 2)
            else if d == 1
                if high >= tp
                    array.set(sigResult, i, 1)
                else if low <= sl
                    array.set(sigResult, i, -1)
            else
                if low <= tp
                    array.set(sigResult, i, 1)
                else if high >= sl
                    array.set(sigResult, i, -1)

hasOpen = false
if array.size(sigResult) > 0
    for i = 0 to array.size(sigResult) - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

// Firing of squeeze on bar close
squeezeFired = squeeze[1] and not squeeze

if inTrade and not hasOpen and squeezeFired
    if close > upperBB[1] and close > open
        entryP = close
        slP    = math.min(low[1], low) - atr * 0.3
        slDist = entryP - slP
        if slDist > 0 and slDist <= atr * 1.5
            tpP = entryP + slDist * rrRatio
            array.push(sigDir, 1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)

    else if close < lowerBB[1] and close < open
        entryP = close
        slP    = math.max(high[1], high) + atr * 0.3
        slDist = slP - entryP
        if slDist > 0 and slDist <= atr * 1.5
            tpP = entryP - slDist * rrRatio
            array.push(sigDir, -1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)

plot(upperBB, "Upper BB", color=color.gray)
plot(lowerBB, "Lower BB", color=color.gray)
`;
}

async function main() {
  console.log('=== SEARCHING REALISTIC (STRICT BAR-CLOSE) STRATEGIES WITH CALMAR > 4.0 ===\n');

  const candidates = [
    { name: '1. LSS Tight Rejection (Max Risk 0.8 ATR, 1:2.0 RR)', fn: () => makeLssTightRejectionScript(0.8, 2.0), rr: 2.0 },
    { name: '2. LSS Tight Rejection (Max Risk 1.0 ATR, 1:2.0 RR)', fn: () => makeLssTightRejectionScript(1.0, 2.0), rr: 2.0 },
    { name: '3. LSS Tight Rejection (Max Risk 0.7 ATR, 1:1.8 RR)', fn: () => makeLssTightRejectionScript(0.7, 1.8), rr: 1.8 },
    { name: '4. LSS Tight Rejection (Max Risk 0.6 ATR, 1:2.0 RR)', fn: () => makeLssTightRejectionScript(0.6, 2.0), rr: 2.0 },
    { name: '5. Pin Bar Liquidity Reversal (1:2.0 RR)', fn: () => makePinBarScript(2.0, 0.6), rr: 2.0 },
    { name: '6. Pin Bar Liquidity Reversal (1:1.8 RR)', fn: () => makePinBarScript(1.8, 0.6), rr: 1.8 },
    { name: '7. London ORB Range Breakout (1:2.0 RR)', fn: () => makeLondonOrbScript(2.0), rr: 2.0 },
    { name: '8. London ORB Range Breakout (1:2.5 RR)', fn: () => makeLondonOrbScript(2.5), rr: 2.5 },
    { name: '9. Keltner Squeeze Volatility Breakout (1:2.0 RR)', fn: () => makeKeltnerSqueezeScript(2.0), rr: 2.0 },
  ];

  const results = [];

  for (const c of candidates) {
    console.log(`Testing: ${c.name}...`);
    try {
      const script = c.fn();
      const resp = await runPineScript(script);
      const trades = resp.backtest?.trades || [];
      trades.forEach(t => {
        if (t.result === 'WIN') t.profitR = c.rr;
        else if (t.result === 'LOSS') t.profitR = -1.0;
      });

      const summary = resp.backtest?.summary || {};
      const mc = runMonteCarlo(trades, 5000);

      const netR = (summary.wins || 0) * c.rr - (summary.losses || 0);

      results.push({
        name: c.name,
        rr: c.rr,
        trades: trades.length,
        wins: summary.wins || 0,
        losses: summary.losses || 0,
        winRate: summary.winRate || 0,
        netR: Number(netR.toFixed(2)),
        mc,
      });

      if (mc) {
        console.log(`  -> Wins: ${summary.wins}, Losses: ${summary.losses}, WR: ${summary.winRate}%, Net: +${netR}R`);
        console.log(`  -> Monte Carlo Median Calmar: ${mc.calmar_median} | 95% Worst: ${mc.calmar_5thWorst}`);
      } else {
        console.log(`  -> Few trades: ${trades.length}`);
      }
    } catch (e) {
      console.error(`Error on ${c.name}:`, e.message);
    }
  }

  console.log('\n======================================================');
  console.log('              FINAL LEADERBOARD (CALMAR RATIO)        ');
  console.log('======================================================\n');

  results.sort((a, b) => (b.mc?.calmar_median || 0) - (a.mc?.calmar_median || 0));

  for (const r of results) {
    console.log(`>>> ${r.name} <<<`);
    console.log(`Trades: ${r.trades} | W: ${r.wins} / L: ${r.losses} | Win Rate: ${r.winRate}% | Net R: +${r.netR} R`);
    if (r.mc) {
      console.log(`MC Median Calmar: ${r.mc.calmar_median} | 95% Worst Calmar: ${r.mc.calmar_5thWorst}`);
      console.log(`MC Median Max DD: -${r.mc.dd_median} R | 95% Worst DD: -${r.mc.dd_95thWorst} R`);
      console.log(`MC 95% CI Returns: ${r.mc.r_5thWorst} R to ${r.mc.r_95thBest} R`);
    }
    console.log('------------------------------------------------------');
  }

  fs.writeFileSync('src/scripts/search_best_results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
