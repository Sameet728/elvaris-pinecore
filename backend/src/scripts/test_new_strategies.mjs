import http from 'http';
import fs from 'fs';

// Helper to run any Pine Script through PineTS backend
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

  if (closed.length < 5) {
    return { error: 'Insufficient trades', count: closed.length };
  }

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
// STRATEGY DEFINITIONS (100% Causal, Zero Lookahead, Strict Bar-Close Triggers)
// ─────────────────────────────────────────────────────────────────────────────

// Strategy 1: Asian Range Judas Sweep & Reversal (AR-Judas)
const scriptStrategy1 = `// © Antigravity Quant
//@version=6
indicator("Asian Range Judas Sweep", shorttitle="AR-Judas", overlay=true)

rrRatio    = input.float(2.5, "R:R Ratio", minval=1.0)
atrMult    = input.float(0.5, "SL Buffer ATR", minval=0.1)
sessionAsia = input.session("0000-0600", "Asian Session", group="Sessions")
sessionTrade = input.session("0700-1900", "Trade Session (London/NY)", group="Sessions")

inAsia  = not na(time(timeframe.period, sessionAsia, "UTC"))
inTrade = not na(time(timeframe.period, sessionTrade, "UTC"))

atr = ta.atr(14)

var float asiaHigh = na
var float asiaLow  = na
var bool  highSwept = false
var bool  lowSwept  = false
var int   lastDay   = -1

// Reset daily Asian range
if dayofmonth(time) != lastDay
    lastDay := dayofmonth(time)
    asiaHigh := na
    asiaLow  := na
    highSwept := false
    lowSwept  := false

if inAsia
    asiaHigh := na(asiaHigh) ? high : math.max(asiaHigh, high)
    asiaLow  := na(asiaLow) ? low : math.min(asiaLow, low)

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()

hasOpen = false
nSig = array.size(sigResult)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            hasOpen := true
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

hasOpen := false
nSig2 = array.size(sigResult)
if nSig2 > 0
    for i = 0 to nSig2 - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

// Sweep condition: In trade session, sweep Asian Low/High and close back inside
if inTrade and not hasOpen and not na(asiaHigh) and not na(asiaLow)
    // Long: Low swept below asiaLow, but close closed back above asiaLow
    if not lowSwept and low < asiaLow and close > asiaLow and close > open
        lowSwept := true
        entryP   = close
        slP      = low - atr * atrMult
        slDist   = entryP - slP
        if slDist > 0
            tpP = entryP + slDist * rrRatio
            array.push(sigDir, 1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)

    // Short: High swept above asiaHigh, but close closed back below asiaHigh
    if not highSwept and high > asiaHigh and close < asiaHigh and close < open
        highSwept := true
        entryP    = close
        slP       = high + atr * atrMult
        slDist    = slP - entryP
        if slDist > 0
            tpP = entryP - slDist * rrRatio
            array.push(sigDir, -1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)

plot(asiaHigh, "Asian High", color=color.red)
plot(asiaLow, "Asian Low", color=color.green)
`;

// Strategy 2: EMA Trend Flow + FVG Pullback + Breakeven Engine (Trend-FVG-BE)
const scriptStrategy2 = `// © Antigravity Quant
//@version=6
indicator("Trend FVG Breakeven", shorttitle="Trend-BE", overlay=true)

rrRatio   = input.float(2.5, "R:R Ratio", minval=1.0)
atrMult   = input.float(0.5, "SL ATR Buffer", minval=0.1)
sessionTrade = input.session("0700-1900", "Trade Session", group="Sessions")

inTrade = not na(time(timeframe.period, sessionTrade, "UTC"))

emaFast = ta.ema(close, 50)
emaSlow = ta.ema(close, 200)
atr     = ta.atr(14)

bullTrend = emaFast > emaSlow and close > emaFast
bearTrend = emaFast < emaSlow and close < emaFast

// FVG
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

while array.size(bFvgTop) > 15
    array.shift(bFvgTop)
    array.shift(bFvgBot)
    array.shift(bFvgBar)
while array.size(sFvgTop) > 15
    array.shift(sFvgTop)
    array.shift(sFvgBot)
    array.shift(sFvgBar)

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()
var bool[]  sigMovedBE = array.new_bool()

hasOpen = false
nSig = array.size(sigResult)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            hasOpen := true
            d     = array.get(sigDir, i)
            tp    = array.get(sigTP, i)
            sl    = array.get(sigSL, i)
            entry = array.get(sigEntry, i)
            age   = bar_index - array.get(sigBar, i)
            movedBE = array.get(sigMovedBE, i)
            
            // Move to Breakeven when price reaches 1.0R
            if not movedBE
                riskDist = math.abs(entry - sl)
                if d == 1 and high >= entry + riskDist
                    array.set(sigSL, i, entry + atr * 0.1) // lock breakeven + buffer
                    array.set(sigMovedBE, i, true)
                else if d == -1 and low <= entry - riskDist
                    array.set(sigSL, i, entry - atr * 0.1)
                    array.set(sigMovedBE, i, true)

            // Re-read updated SL
            sl := array.get(sigSL, i)

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

hasOpen := false
nSig2 = array.size(sigResult)
if nSig2 > 0
    for i = 0 to nSig2 - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

// Entry Trigger: Pullback into active FVG during trend
if inTrade and not hasOpen
    if bullTrend
        nf = array.size(bFvgBar)
        if nf > 0
            for i = nf - 1 to 0
                if bar_index - array.get(bFvgBar, i) <= 20
                    fTop = array.get(bFvgTop, i)
                    fBot = array.get(bFvgBot, i)
                    if low <= fTop and close > fBot and close > open
                        entryP = close
                        slP    = math.min(low, fBot) - atr * atrMult
                        slDist = entryP - slP
                        if slDist > 0
                            tpP = entryP + slDist * rrRatio
                            array.push(sigDir, 1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigMovedBE, false)
                            break

    if bearTrend
        nf = array.size(sFvgBar)
        if nf > 0
            for i = nf - 1 to 0
                if bar_index - array.get(sFvgBar, i) <= 20
                    fTop = array.get(sFvgTop, i)
                    fBot = array.get(sFvgBot, i)
                    if high >= fBot and close < fTop and close < open
                        entryP = close
                        slP    = math.max(high, fTop) + atr * atrMult
                        slDist = slP - entryP
                        if slDist > 0
                            tpP = entryP - slDist * rrRatio
                            array.push(sigDir, -1)
                            array.push(sigEntry, entryP)
                            array.push(sigSL, slP)
                            array.push(sigTP, tpP)
                            array.push(sigResult, 0)
                            array.push(sigBar, bar_index)
                            array.push(sigMovedBE, false)
                            break

plot(emaFast, "50 EMA", color=color.blue)
plot(emaSlow, "200 EMA", color=color.orange)
`;

// Strategy 3: Multi-Session Momentum Expansion & Liquidity Trailing (SMC-Turbo)
const scriptStrategy3 = `// © Antigravity Quant
//@version=6
indicator("SMC Breakeven Turbo", shorttitle="SMC-Turbo", overlay=true)

swingLen = input.int(8, "Swing Length")
rrRatio  = input.float(3.0, "R:R Ratio", minval=1.5)
atrMult  = input.float(0.5, "ATR Buffer")
sessionTrade = input.session("0700-1900", "Trade Session")

inTrade = not na(time(timeframe.period, sessionTrade, "UTC"))
atr = ta.atr(14)

swingH = ta.pivothigh(high, swingLen, swingLen)
swingL = ta.pivotlow(low, swingLen, swingLen)

var float lastH = na
var float lastL = na
if not na(swingH)
    lastH := swingH
if not na(swingL)
    lastL := swingL

var int[]   sigDir    = array.new_int()
var float[] sigEntry  = array.new_float()
var float[] sigSL     = array.new_float()
var float[] sigTP     = array.new_float()
var int[]   sigResult = array.new_int()
var int[]   sigBar    = array.new_int()
var bool[]  sigMovedBE = array.new_bool()

hasOpen = false
nSig = array.size(sigResult)
if nSig > 0
    for i = 0 to nSig - 1
        if array.get(sigResult, i) == 0
            hasOpen := true
            d     = array.get(sigDir, i)
            tp    = array.get(sigTP, i)
            sl    = array.get(sigSL, i)
            entry = array.get(sigEntry, i)
            age   = bar_index - array.get(sigBar, i)
            movedBE = array.get(sigMovedBE, i)
            
            // Dynamic Breakeven at +1.0R
            riskDist = math.abs(entry - sl)
            if not movedBE
                if d == 1 and high >= entry + riskDist * 1.0
                    array.set(sigSL, i, entry + atr * 0.1)
                    array.set(sigMovedBE, i, true)
                else if d == -1 and low <= entry - riskDist * 1.0
                    array.set(sigSL, i, entry - atr * 0.1)
                    array.set(sigMovedBE, i, true)

            sl := array.get(sigSL, i)

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

hasOpen := false
nSig2 = array.size(sigResult)
if nSig2 > 0
    for i = 0 to nSig2 - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

if inTrade and not hasOpen and not na(lastH) and not na(lastL)
    // Bullish sweep of recent swing low + immediate strong reversal close
    if low < lastL and close > lastL and close > open and (close - open) > atr * 0.4
        entryP = close
        slP    = low - atr * atrMult
        slDist = entryP - slP
        if slDist > 0
            tpP = entryP + slDist * rrRatio
            array.push(sigDir, 1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)
            array.push(sigMovedBE, false)

    // Bearish sweep of recent swing high + immediate strong reversal close
    if high > lastH and close < lastH and close < open and (open - close) > atr * 0.4
        entryP = close
        slP    = high + atr * atrMult
        slDist = slP - entryP
        if slDist > 0
            tpP = entryP - slDist * rrRatio
            array.push(sigDir, -1)
            array.push(sigEntry, entryP)
            array.push(sigSL, slP)
            array.push(sigTP, tpP)
            array.push(sigResult, 0)
            array.push(sigBar, bar_index)
            array.push(sigMovedBE, false)

plot(lastH, "Swing High", color=color.red)
plot(lastL, "Swing Low", color=color.green)
`;

async function main() {
  console.log('=== Testing Multiple New Institutional Pine Strategies ===\n');

  console.log('1. Testing Strategy 1: Asian Range Judas Sweep (AR-Judas)...');
  const res1 = await runPineScript(scriptStrategy1);

  console.log('2. Testing Strategy 2: Trend Flow FVG + Breakeven Engine (Trend-BE)...');
  const res2 = await runPineScript(scriptStrategy2);

  console.log('3. Testing Strategy 3: SMC Sweep + Dynamic Breakeven + 1:3 RR (SMC-Turbo)...');
  const res3 = await runPineScript(scriptStrategy3);

  const strategies = [
    { name: 'Strategy 1: Asian Range Judas Sweep (AR-Judas)', res: res1, rr: 2.5 },
    { name: 'Strategy 2: Trend Flow FVG + Breakeven Engine (Trend-BE)', res: res2, rr: 2.5 },
    { name: 'Strategy 3: SMC Sweep + Dynamic Breakeven 1:3 RR (SMC-Turbo)', res: res3, rr: 3.0 },
  ];

  const results = {};

  for (const s of strategies) {
    const trades = s.res.backtest?.trades || [];
    // Patch profitR for WIN with strategy rr
    trades.forEach(t => {
      if (t.result === 'WIN') t.profitR = s.rr;
    });

    const mc = runMonteCarlo(trades, 5000);
    const summary = s.res.backtest?.summary || {};

    results[s.name] = {
      summary,
      mc,
      tradesCount: trades.length,
      wins: summary.wins,
      losses: summary.losses,
      open: summary.open,
    };

    console.log(`\n======================================================`);
    console.log(`>>> ${s.name} <<<`);
    console.log(`Total Trades: ${trades.length} | Wins: ${summary.wins} | Losses: ${summary.losses}`);
    console.log(`Raw Win Rate: ${summary.winRate}%`);
    if (mc && !mc.error) {
      console.log(`Monte Carlo Median Return: +${mc.r_median} R`);
      console.log(`Monte Carlo Median Max DD: -${mc.dd_median} R (95% Worst: -${mc.dd_95thWorst} R)`);
      console.log(`Monte Carlo Median Calmar: ${mc.calmar_median} 🔥`);
      console.log(`Monte Carlo 95% Worst-Case Calmar: ${mc.calmar_5thWorst}`);
      console.log(`Max Cons Losses (95% Worst): ${mc.consLoss_95thWorst}`);
    } else {
      console.log('MC:', mc);
    }
  }

  fs.writeFileSync('src/scripts/new_strategies_results.json', JSON.stringify(results, null, 2));
  console.log('\nResults saved to src/scripts/new_strategies_results.json');
}

main().catch(console.error);
