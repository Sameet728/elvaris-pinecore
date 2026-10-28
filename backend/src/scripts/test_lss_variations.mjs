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

  for (let iter = 0; iter < iterations; iter++) {
    let cumR = 0;
    let peak = 0;
    let maxDD = 0;

    for (let i = 0; i < N; i++) {
      const idx = Math.floor(Math.random() * closed.length);
      const r = closed[idx];
      cumR += r;
      if (cumR > peak) peak = cumR;
      const dd = peak - cumR;
      if (dd > maxDD) maxDD = dd;
    }

    simMaxDDs.push(maxDD);
    simFinalRs.push(cumR);
    const effDD = Math.max(maxDD, 0.5);
    simCalmars.push(cumR > 0 ? cumR / effDD : 0);
  }

  simMaxDDs.sort((a, b) => a - b);
  simFinalRs.sort((a, b) => a - b);
  simCalmars.sort((a, b) => a - b);

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
  };
}

function createLssVariationScript({
  useTrendFilter = false,
  useBreakeven = false,
  minFvgAtr = 0.0,
  rrRatio = 2.0,
  atrMult = 0.5,
}) {
  return `// © EVLabs / Antigravity Quant
//@version=6
indicator("LSS Optimization", overlay=true)

swingLen   = 10
maxLevels  = 5
atrMult    = ${atrMult}
rrRatio    = ${rrRatio}
expireBars = 30
statsLen   = 100
sessionLon = "0700-1200"
sessionNY  = "1330-2000"

inLondon  = not na(time(timeframe.period, sessionLon, "Europe/Berlin"))
inNY      = not na(time(timeframe.period, sessionNY,  "America/New_York"))
inSession = inLondon or inNY

atr = ta.atr(14)
ema200 = ta.ema(close, 200)

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

bullFVG = low > high[2] and (low - high[2]) >= atr * ${minFvgAtr}
bearFVG = high < low[2] and (low[2] - high) >= atr * ${minFvgAtr}

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

nb = array.size(sslLvls)
if nb > 0
    for i = 0 to nb - 1
        if not array.get(sslSwept, i)
            lvl = array.get(sslLvls, i)
            if low < lvl and close > lvl
                array.set(sslSwept, i, true)
                sslSweep := true
                sweepLow := low

nc = array.size(bslLvls)
if nc > 0
    for i = 0 to nc - 1
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
            
            ${
              useBreakeven
                ? `
            movedBE = array.get(sigMovedBE, i)
            riskDist = math.abs(entry - sl)
            if not movedBE
                if d == 1 and high >= entry + riskDist * 1.0
                    array.set(sigSL, i, entry + atr * 0.05)
                    array.set(sigMovedBE, i, true)
                else if d == -1 and low <= entry - riskDist * 1.0
                    array.set(sigSL, i, entry - atr * 0.05)
                    array.set(sigMovedBE, i, true)
            sl := array.get(sigSL, i)
            `
                : ''
            }

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

hasOpen := false
nSig2 = array.size(sigResult)
if nSig2 > 0
    for i = 0 to nSig2 - 1
        if array.get(sigResult, i) == 0
            hasOpen := true

var bool  lookLong  = false
var bool  lookShort = false
var int   setupBarL = 0
var int   setupBarS = 0
var float setupSLL  = 0.0
var float setupSLS  = 0.0

if sslSweep and inSession and not hasOpen ${useTrendFilter ? 'and close > ema200' : ''}
    lookLong  := true
    lookShort := false
    setupBarL := bar_index
    setupSLL  := sweepLow - atr * atrMult

if bslSweep and inSession and not hasOpen ${useTrendFilter ? 'and close < ema200' : ''}
    lookShort := true
    lookLong  := false
    setupBarS := bar_index
    setupSLS  := sweepHigh + atr * atrMult

if not inSession
    lookLong  := false
    lookShort := false

if lookLong  and (bar_index - setupBarL) > expireBars
    lookLong  := false
if lookShort and (bar_index - setupBarS) > expireBars
    lookShort := false

if lookLong and not hasOpen
    nf = array.size(bFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(bFvgBar, i) > setupBarL
                fTop = array.get(bFvgTop, i)
                fBot = array.get(bFvgBot, i)
                mid  = (fTop + fBot) / 2
                if low <= fTop and close > fBot
                    entryP = mid
                    slP    = setupSLL
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
                        lookLong := false
                        break

if lookShort and not hasOpen
    nf = array.size(sFvgBar)
    if nf > 0
        for i = nf - 1 to 0
            if array.get(sFvgBar, i) > setupBarS
                fTop = array.get(sFvgTop, i)
                fBot = array.get(sFvgBot, i)
                mid  = (fTop + fBot) / 2
                if high >= fBot and close < fTop
                    entryP = mid
                    slP    = setupSLS
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
                        lookShort := false
                        break

plot(setupSLL != 0 ? setupSLL : na, "Setup SL Long")
`;
}

async function main() {
  console.log('=== Optimizing & Testing Robust High-Calmar Variations ===\n');

  const configs = [
    { name: '1. Baseline LSS (1:2.0 RR)', cfg: { rrRatio: 2.0, atrMult: 0.5 } },
    { name: '2. LSS + Dynamic Breakeven at +1.0R (1:2.0 RR)', cfg: { rrRatio: 2.0, useBreakeven: true } },
    { name: '3. LSS + Dynamic Breakeven at +1.0R + Extended 1:2.5 RR', cfg: { rrRatio: 2.5, useBreakeven: true } },
    { name: '4. LSS + Trend Filter (200 EMA)', cfg: { rrRatio: 2.0, useTrendFilter: true } },
    { name: '5. LSS + Min FVG ATR Filter (0.2 ATR)', cfg: { rrRatio: 2.0, minFvgAtr: 0.2 } },
    { name: '6. LSS + Dynamic Breakeven + Extended 1:3.0 RR', cfg: { rrRatio: 3.0, useBreakeven: true } },
    { name: '7. LSS + Tight SL Buffer (0.3 ATR, 1:2.0 RR)', cfg: { rrRatio: 2.0, atrMult: 0.3 } },
    { name: '8. LSS + Conservative 1:1.8 RR (Higher Win Rate)', cfg: { rrRatio: 1.8, atrMult: 0.5 } },
  ];

  const results = [];

  for (const item of configs) {
    console.log(`Running: ${item.name}...`);
    const script = createLssVariationScript(item.cfg);
    const resp = await runPineScript(script);
    const trades = resp.backtest?.trades || [];
    trades.forEach(t => {
      if (t.result === 'WIN') t.profitR = item.cfg.rrRatio;
      else if (t.result === 'LOSS') t.profitR = -1.0;
    });

    const summary = resp.backtest?.summary || {};
    const mc = runMonteCarlo(trades, 5000);

    const resObj = {
      name: item.name,
      rr: item.cfg.rrRatio,
      trades: trades.length,
      wins: summary.wins || 0,
      losses: summary.losses || 0,
      open: summary.open || 0,
      winRate: summary.winRate || 0,
      rawR: (summary.wins || 0) * item.cfg.rrRatio - (summary.losses || 0),
      rawMaxDD: summary.maxDrawdownR || 3,
      mc,
    };
    results.push(resObj);
  }

  console.log('\n======================================================');
  console.log('              MONTE CARLO OPTIMIZATION RESULTS        ');
  console.log('======================================================\n');

  for (const r of results) {
    console.log(`>>> ${r.name} <<<`);
    console.log(`Trades: ${r.trades} | Wins: ${r.wins} | Losses: ${r.losses} | Win Rate: ${r.winRate}%`);
    console.log(`Net Return: +${r.rawR} R`);
    if (r.mc) {
      console.log(`Monte Carlo Median Return: +${r.mc.r_median} R`);
      console.log(`Monte Carlo Median Max DD: -${r.mc.dd_median} R | 95% Worst DD: -${r.mc.dd_95thWorst} R`);
      console.log(`Monte Carlo Median Calmar: ${r.mc.calmar_median} | 95% Worst-Case Calmar: ${r.mc.calmar_5thWorst}`);
    }
    console.log('------------------------------------------------------');
  }

  fs.writeFileSync('src/scripts/lss_optimizations.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
