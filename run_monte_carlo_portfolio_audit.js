const fs = require('fs');
const { dsXAU, dsNAS, simulate } = require('./sim_framework');

// 1. Load Previous Strategies from official_verified_3trio.json
const prev = JSON.parse(fs.readFileSync('official_verified_3trio.json', 'utf8'));

// Format Prev S1 trades
const s1Trades = prev.s1.trades.map(t => ({
  strat: 'S1_Grandmaster_Gold',
  asset: 'XAUUSD',
  entryTime: t.entryTime,
  exitTime: t.exitTime,
  r: t.profit > 0 ? (14.0 / 13.75) : -1.0,
  profitCash: t.profit > 0 ? 14.0 * 10 : -13.75 * 10,
  isWin: t.profit > 0
}));

// Format Prev S2 trades (US Afternoon Reversal)
const prevS2Trades = prev.s2.trades.map(t => ({
  strat: 'Prev_S2_US_Afternoon',
  asset: 'XAUUSD',
  entryTime: t.entryTime,
  exitTime: t.exitTime,
  r: t.profit > 0 ? (18.0 / 13.75) : -1.0,
  profitCash: t.profit > 0 ? 18.0 * 10 : -13.75 * 10,
  isWin: t.profit > 0
}));

// Format Prev S3 trades (London Core Expansion)
const prevS3Trades = prev.s3.trades.map(t => ({
  strat: 'Prev_S3_London_Core',
  asset: 'XAUUSD',
  entryTime: t.entryTime,
  exitTime: t.exitTime,
  r: t.profit > 0 ? (16.0 / 13.75) : -1.0,
  profitCash: t.profit > 0 ? 16.0 * 10 : -13.75 * 10,
  isWin: t.profit > 0
}));

// 2. Generate New S2 trades (NASDAQ 100 Cash Momentum)
const s2Candles = dsNAS;
const s2Ema50 = s2Candles.calcEMA(50);
const s2Ema200 = s2Candles.calcEMA(200);
const s2Rsi14 = s2Candles.calcRSI(14);
const s2Sma14 = s2Candles.calcSMA(14);
const s2Std14 = s2Candles.calcStDev(14, s2Sma14);

const s2Long = new Uint8Array(s2Candles.n);
const s2Short = new Uint8Array(s2Candles.n);
for (let i = 200; i < s2Candles.n; i++) {
  const h = s2Candles.utcHour[i];
  if (h >= 14 && h <= 21) {
    const upper = s2Sma14[i] + 2.1 * s2Std14[i];
    const lower = s2Sma14[i] - 2.1 * s2Std14[i];
    const bull = s2Candles.close[i] > s2Ema200[i] + 10;
    const bear = s2Candles.close[i] < s2Ema200[i] - 10 && s2Ema50[i] < s2Ema200[i];
    if (bull && s2Candles.low[i] <= lower && s2Candles.close[i] > s2Candles.open[i] && s2Rsi14[i] < 55) s2Long[i] = 1;
    if (bear && s2Candles.high[i] >= upper && s2Candles.close[i] < s2Candles.open[i] && s2Rsi14[i] > 45) s2Short[i] = 1;
  }
}
const resNewS2 = simulate(s2Candles, s2Long, s2Short, 40, 35, 2, 1);
const newS2Trades = resNewS2.tradesList.map(t => ({
  strat: 'New_S2_NAS100',
  asset: 'NAS100',
  entryTime: t.entryTime,
  exitTime: t.exitTime,
  r: t.profit > 0 ? (40.0 / 35.0) : -1.0,
  profitCash: t.profit > 0 ? 40.0 * 20 : -35.0 * 20,
  isWin: t.profit > 0
}));

// 3. Generate New S3 trades (Gold US Afternoon 34 SMA)
const s3Candles = dsXAU;
const s3Ema50 = s3Candles.calcEMA(50);
const s3Ema200 = s3Candles.calcEMA(200);
const s3Atr14 = s3Candles.atr14;
const s3Rsi14 = s3Candles.calcRSI(14);
const s3Sma34 = s3Candles.calcSMA(34);
const s3Std34 = s3Candles.calcStDev(34, s3Sma34);

const s3Long = new Uint8Array(s3Candles.n);
const s3Short = new Uint8Array(s3Candles.n);
for (let i = 200; i < s3Candles.n; i++) {
  const h = s3Candles.utcHour[i];
  if (h >= 12 && h <= 20) {
    const upper = s3Sma34[i] + 2.1 * s3Std34[i];
    const lower = s3Sma34[i] - 2.1 * s3Std34[i];
    const bull = s3Candles.close[i] > s3Ema200[i] + 3.0;
    const bear = s3Candles.close[i] < s3Ema200[i] && s3Ema50[i] < s3Ema200[i];
    const passCrash = s3Candles.close[i] >= (s3Ema50[i] - 1.25 * s3Atr14[i]);
    if (passCrash && bull && s3Candles.low[i] <= lower && s3Candles.close[i] > s3Candles.open[i] && s3Rsi14[i] < 52) s3Long[i] = 1;
    if (bear && s3Candles.high[i] >= upper && s3Candles.close[i] < s3Candles.open[i] && s3Rsi14[i] > 48) s3Short[i] = 1;
  }
}
const resNewS3 = simulate(s3Candles, s3Long, s3Short, 18, 13.75, 2, 1);
const newS3Trades = resNewS3.tradesList.map(t => ({
  strat: 'New_S3_Gold_34SMA',
  asset: 'XAUUSD',
  entryTime: t.entryTime,
  exitTime: t.exitTime,
  r: t.profit > 0 ? (18.0 / 13.75) : -1.0,
  profitCash: t.profit > 0 ? 18.0 * 10 : -13.75 * 10,
  isWin: t.profit > 0
}));

console.log('All candidate trade streams loaded successfully:');
console.log(`- S1 Grandmaster Gold:    ${s1Trades.length} trades (${s1Trades.filter(t=>t.isWin).length}W / ${s1Trades.filter(t=>!t.isWin).length}L, ${((s1Trades.filter(t=>t.isWin).length/s1Trades.length)*100).toFixed(1)}% WR)`);
console.log(`- Prev S2 US Afternoon:   ${prevS2Trades.length} trades (${prevS2Trades.filter(t=>t.isWin).length}W / ${prevS2Trades.filter(t=>!t.isWin).length}L, ${((prevS2Trades.filter(t=>t.isWin).length/prevS2Trades.length)*100).toFixed(1)}% WR)`);
console.log(`- Prev S3 London Core:    ${prevS3Trades.length} trades (${prevS3Trades.filter(t=>t.isWin).length}W / ${prevS3Trades.filter(t=>!t.isWin).length}L, ${((prevS3Trades.filter(t=>t.isWin).length/prevS3Trades.length)*100).toFixed(1)}% WR)`);
console.log(`- New S2 NASDAQ 100:      ${newS2Trades.length} trades (${newS2Trades.filter(t=>t.isWin).length}W / ${newS2Trades.filter(t=>!t.isWin).length}L, ${((newS2Trades.filter(t=>t.isWin).length/newS2Trades.length)*100).toFixed(1)}% WR)`);
console.log(`- New S3 Gold 34 SMA:     ${newS3Trades.length} trades (${newS3Trades.filter(t=>t.isWin).length}W / ${newS3Trades.filter(t=>!t.isWin).length}L, ${((newS3Trades.filter(t=>t.isWin).length/newS3Trades.length)*100).toFixed(1)}% WR)`);

// Define all portfolio combinations to evaluate
const strategyMap = {
  'S1_Gold': s1Trades,
  'Prev_S2_US': prevS2Trades,
  'Prev_S3_London': prevS3Trades,
  'New_S2_NAS100': newS2Trades,
  'New_S3_Gold34': newS3Trades
};

// Key Portfolios to Test:
const portfolios = [
  { name: 'A) New Trio [S1 Gold + New S2 NAS100 + New S3 Gold 34SMA]', keys: ['S1_Gold', 'New_S2_NAS100', 'New_S3_Gold34'] },
  { name: 'B) StratMarket Current Trio [S1 Gold + Prev S2 US + Prev S3 London]', keys: ['S1_Gold', 'Prev_S2_US', 'Prev_S3_London'] },
  { name: 'C) Hybrid Cross-Asset Duo [S1 Gold + New S2 NAS100]', keys: ['S1_Gold', 'New_S2_NAS100'] },
  { name: 'D) Ultra-High WR Duo [New S2 NAS100 + New S3 Gold 34SMA]', keys: ['New_S2_NAS100', 'New_S3_Gold34'] },
  { name: 'E) Hybrid Triple-Champion [S1 Gold + New S2 NAS100 + Prev S2 US]', keys: ['S1_Gold', 'New_S2_NAS100', 'Prev_S2_US'] },
  { name: 'F) US-Only Power Duo [New S2 NAS100 + Prev S2 US]', keys: ['New_S2_NAS100', 'Prev_S2_US'] },
  { name: 'G) Quad Non-Overlapping [S1 Gold + New S2 NAS100 + New S3 Gold34 + Prev S2 US]', keys: ['S1_Gold', 'New_S2_NAS100', 'New_S3_Gold34', 'Prev_S2_US'] },
  { name: 'H) All 5 Combined Super-Portfolio', keys: ['S1_Gold', 'Prev_S2_US', 'Prev_S3_London', 'New_S2_NAS100', 'New_S3_Gold34'] },
  { name: 'I) S1 Solo (Baseline)', keys: ['S1_Gold'] },
  { name: 'J) New S2 NAS100 Solo', keys: ['New_S2_NAS100'] },
  { name: 'K) New S3 Gold 34SMA Solo', keys: ['New_S3_Gold34'] },
  { name: 'L) Prev S2 US Solo', keys: ['Prev_S2_US'] },
  { name: 'M) Prev S3 London Solo', keys: ['Prev_S3_London'] }
];

// Helper: Merge trades chronologically and count simultaneous collisions
function mergeTrades(keys) {
  let list = [];
  for (const k of keys) list.push(...strategyMap[k]);
  list.sort((a, b) => a.entryTime - b.entryTime);

  // Check collision (trades entering at exact same timestamp)
  const timeCounts = {};
  let collisions = 0;
  for (const t of list) {
    timeCounts[t.entryTime] = (timeCounts[t.entryTime] || 0) + 1;
    if (timeCounts[t.entryTime] === 2) collisions++;
  }

  return { trades: list, collisions };
}

// Monte Carlo Engine: 10,000 Resampling Runs per Portfolio
function runMonteCarlo(trades, numRuns = 10000) {
  const N = trades.length;
  if (N === 0) return null;

  const wrList = new Float64Array(numRuns);
  const maxDDList = new Float64Array(numRuns);
  const totalRList = new Float64Array(numRuns);
  const calmarList = new Float64Array(numRuns);
  let passCount = 0; // Target +12R reached without exceeding 3.0R DD (Tradeify Select rules: 3% DD, 6% Target)

  for (let r = 0; r < numRuns; r++) {
    // Bootstrap resampling with replacement
    let wins = 0;
    let peak = 0;
    let running = 0;
    let maxDD = 0;
    let targetHit = false;
    let blown = false;

    for (let i = 0; i < N; i++) {
      const idx = Math.floor(Math.random() * N);
      const t = trades[idx];
      if (t.isWin) wins++;

      running += t.r;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;

      // Check Tradeify evaluation condition: 6% profit target (+12R at 0.5% risk) vs 3% trailing DD (6R max DD)
      if (running >= 12.0 && !blown) targetHit = true;
      if (dd >= 6.0) blown = true;
    }

    const wr = (wins / N) * 100;
    const calmar = maxDD > 0 ? (running / maxDD) : (running > 0 ? 99 : 0);

    wrList[r] = wr;
    maxDDList[r] = maxDD;
    totalRList[r] = running;
    calmarList[r] = calmar;

    if (targetHit && !blown) passCount++;
  }

  wrList.sort();
  maxDDList.sort();
  totalRList.sort();
  calmarList.sort();

  function quantile(arr, q) {
    const pos = (arr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return arr[base + 1] !== undefined ? arr[base] + rest * (arr[base + 1] - arr[base]) : arr[base];
  }

  return {
    runs: numRuns,
    passRate: ((passCount / numRuns) * 100).toFixed(1),
    wrMean: (wrList.reduce((a, b) => a + b, 0) / numRuns).toFixed(2),
    wrP5: quantile(wrList, 0.05).toFixed(2),
    wrMedian: quantile(wrList, 0.50).toFixed(2),
    wrP95: quantile(wrList, 0.95).toFixed(2),
    ddMedian: quantile(maxDDList, 0.50).toFixed(2),
    ddP95: quantile(maxDDList, 0.95).toFixed(2),
    ddWorst: quantile(maxDDList, 0.99).toFixed(2),
    rMedian: quantile(totalRList, 0.50).toFixed(2),
    rP5: quantile(totalRList, 0.05).toFixed(2),
    rP95: quantile(totalRList, 0.95).toFixed(2),
    calmarMedian: quantile(calmarList, 0.50).toFixed(2),
    calmarP5: quantile(calmarList, 0.05).toFixed(2),
    calmarP95: quantile(calmarList, 0.95).toFixed(2)
  };
}

// Compute Empirical Metrics
function getEmpirical(trades) {
  const total = trades.length;
  const wins = trades.filter(t => t.isWin).length;
  const wr = (wins / total) * 100;
  const netR = trades.reduce((acc, t) => acc + t.r, 0);

  let peak = 0, running = 0, maxDD = 0;
  for (const t of trades) {
    running += t.r;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }
  const calmar = maxDD > 0 ? netR / maxDD : 99;

  let grossWin = 0, grossLoss = 0;
  for (const t of trades) {
    if (t.r > 0) grossWin += t.r;
    else grossLoss += Math.abs(t.r);
  }
  const pf = grossLoss > 0 ? (grossWin / grossLoss) : 99;

  return { total, wins, losses: total - wins, wr: wr.toFixed(2), netR: netR.toFixed(2), maxDD: maxDD.toFixed(2), calmar: calmar.toFixed(2), pf: pf.toFixed(2) };
}

console.log('\n--- EXHAUSTIVE 10,000-RUN MONTE CARLO PORTFOLIO AUDIT ---\n');

const results = [];

for (const p of portfolios) {
  const { trades, collisions } = mergeTrades(p.keys);
  const emp = getEmpirical(trades);
  const mc = runMonteCarlo(trades, 10000);

  results.push({
    name: p.name,
    keys: p.keys,
    tradesCount: emp.total,
    collisions,
    empirical: emp,
    mc
  });
}

// Write to JSON for inspection
fs.writeFileSync('monte_carlo_portfolio_audit.json', JSON.stringify(results, null, 2));

console.log('Leaderboards Generated Successfully.');

