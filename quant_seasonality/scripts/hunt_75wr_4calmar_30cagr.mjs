import fs from 'fs';

// Load datasets
const datasets = {
  btc4H: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8')),
  eth4H: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_4h.json', 'utf8')),
  btcDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8')),
  ethDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8')),
  gold4H: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8')),
  qqq4H: JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_4h.json', 'utf8'))
};

console.log('========================================================================');
console.log('  HUNTING HOLY GRAIL: WIN RATE 75-80% + CALMAR >= 4.0 + CAGR >= 30%     ');
console.log('  TESTING BREAK-EVEN PROFIT LOCKING & DYNAMIC TRAILING ASYMMETRY        ');
console.log('========================================================================\n');

function computeEMA(arr, period) {
  const n = arr.length;
  const res = new Float64Array(n);
  const k = 2 / (period + 1);
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i];
  res[period - 1] = s / period;
  for (let i = period; i < n; i++) res[i] = arr[i] * k + res[i - 1] * (1 - k);
  return res;
}

function computeATR(highs, lows, closes, period = 14) {
  const n = highs.length;
  const tr = new Float64Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  const atr = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < period; i++) s += tr[i];
  atr[period - 1] = s / period;
  for (let i = period; i < n; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  return atr;
}

function computeRSI(closes, period = 14) {
  const n = closes.length;
  const rsi = new Float64Array(n);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < n; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function evaluateTradeSeries(trades, years, initialEquity = 10000) {
  if (trades.length < 25) return null;
  let eq = initialEquity, peak = initialEquity, maxDD = 0;
  let wins = 0, losses = 0, be = 0;
  let grossWin = 0, grossLoss = 0;
  const winPcts = [], lossPcts = [];

  for (const t of trades) {
    const r = t.retPct;
    if (r > 0.05) { // clear win
      wins++;
      winPcts.push(r);
      grossWin += (eq * (r / 100));
    } else if (r < -0.05) { // clear loss
      losses++;
      lossPcts.push(Math.abs(r));
      grossLoss += Math.abs(eq * (r / 100));
    } else { // break-even
      be++;
    }
    eq = eq * (1 + r / 100);
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const effectiveTrades = wins + losses;
  if (effectiveTrades < 20) return null;

  const wr = (wins / trades.length) * 100;
  const avgWin = winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0;
  const avgLoss = lossPcts.length > 0 ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : 0;
  const realizedRR = avgLoss > 0 ? avgWin / avgLoss : avgWin;

  const cagr = (Math.pow(eq / initialEquity, 1 / years) - 1) * 100;
  const calmar = maxDD > 0 ? cagr / maxDD : cagr;
  const pf = grossLoss > 0 ? grossWin / grossLoss : 99;

  return {
    totalTrades: trades.length,
    wins,
    losses,
    be,
    wr,
    avgWin,
    avgLoss,
    realizedRR,
    cagr,
    maxDD,
    calmar,
    pf,
    totalGain: ((eq - initialEquity) / initialEquity) * 100
  };
}

const holyGrailCandidates = [];

// ============================================================================
// SIMULATION ENGINE WITH BREAK-EVEN TRIGGER & TRAILING STOP
// ============================================================================
function testBreakEvenEngine(bars, symbol, label, is4H = true) {
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const ema50 = computeEMA(closes, 50);
  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);
  const rsi14 = computeRSI(closes, 14);

  // We test different hours/days, break-even activation levels, and profit targets
  const sessions = is4H
    ? [
        { name: 'European Sweep (04 UTC)', hours: [4] },
        { name: 'London Open (08 UTC)', hours: [8] },
        { name: 'Dual Session (04 & 08 UTC)', hours: [4, 8] },
        { name: 'US Open (12 & 16 UTC)', hours: [12, 16] },
        { name: 'Overnight Drift (20 UTC)', hours: [20] }
      ]
    : [
        { name: 'Weekend Inflow (Fri Close)', days: [5], hold: 3 },
        { name: 'Mon-Wed-Fri Active Drift', days: [1, 3, 5], hold: 1 },
        { name: 'Turn-of-Month (Day 27-4)', tom: true, hold: 4 }
      ];

  const beTriggers = [0.4, 0.5, 0.6, 0.7, 0.8]; // ATR gain before moving stop to entry + buffer
  const tpLevels = [0.8, 1.0, 1.2, 1.5, 2.0];    // ATR target
  const initialSLs = [1.0, 1.25, 1.5, 2.0, 2.5]; // Initial ATR stop loss

  for (const sess of sessions) {
    for (const beTrig of beTriggers) {
      for (const tpMult of tpLevels) {
        if (tpMult < beTrig) continue; // TP must be >= BE trigger
        for (const slMult of initialSLs) {
          for (const rsiMin of [40, 45, 50, 55]) {
            for (const maxHold of (is4H ? [6, 8, 10] : [2, 3, 4])) {
              const trades = [];
              let inTrade = false;
              let entryPrice = 0, currentSL = 0, tpPrice = 0, beTriggerPrice = 0;
              let beMoved = false, entryIdx = 0;

              for (let i = 200; i < n; i++) {
                const dt = new Date(times[i]);
                const h = dt.getUTCHours();
                const dow = dt.getUTCDay();
                const dom = dt.getUTCDate();

                if (inTrade) {
                  const barsHeld = i - entryIdx;
                  let exited = false;
                  let exitPrice = 0;

                  // 1. Check if Break-Even trigger was reached
                  if (!beMoved && highs[i] >= beTriggerPrice) {
                    currentSL = entryPrice + 0.05 * atr14[i]; // move to slight profit (break-even + fee buffer)
                    beMoved = true;
                  }

                  // 2. Check Exits (Target, Stop, or Max Hold)
                  if (highs[i] >= tpPrice && lows[i] <= currentSL) {
                    exitPrice = opens[i] >= tpPrice ? tpPrice : currentSL;
                    exited = true;
                  } else if (highs[i] >= tpPrice) {
                    exitPrice = tpPrice;
                    exited = true;
                  } else if (lows[i] <= currentSL) {
                    exitPrice = currentSL;
                    exited = true;
                  } else if (barsHeld >= maxHold) {
                    exitPrice = closes[i];
                    exited = true;
                  }

                  if (exited) {
                    trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                    inTrade = false;
                  }
                }

                // Entry logic
                let trigger = false;
                if (is4H) {
                  if (sess.hours.includes(h)) trigger = true;
                } else {
                  if (sess.days && sess.days.includes(dow)) trigger = true;
                  else if (sess.tom && (dom >= 27 || dom <= 4)) trigger = true;
                }

                if (!inTrade && trigger) {
                  if (dow === 4) continue; // avoid Thursday dump
                  if (closes[i] <= ema200[i]) continue; // bull trend only
                  if (rsi14[i] < rsiMin) continue;

                  inTrade = true;
                  entryPrice = closes[i];
                  entryIdx = i;
                  beMoved = false;
                  currentSL = entryPrice - slMult * atr14[i];
                  tpPrice = entryPrice + tpMult * atr14[i];
                  beTriggerPrice = entryPrice + beTrig * atr14[i];
                }
              }

              const stats = evaluateTradeSeries(trades, years);

              // STRICT TARGET CRITERIA:
              // 1. Win Rate: 74% - 85%
              // 2. Calmar >= 4.0
              // 3. CAGR >= 30%
              if (stats && stats.wr >= 74.0 && stats.calmar >= 4.0 && stats.cagr >= 30.0) {
                holyGrailCandidates.push({
                  id: `${symbol}_${is4H ? '4H' : '1D'}_${sess.name}_BE${beTrig}_TP${tpMult}_SL${slMult}_RSI${rsiMin}`,
                  name: `${label} ${is4H ? '4H' : 'Daily'} ${sess.name}`,
                  asset: symbol,
                  timeframe: is4H ? '4H' : '1D',
                  sampleYears: years.toFixed(1) + ' Years',
                  plannedRR: `${(tpMult / slMult).toFixed(2)} : 1`,
                  setup: `${sess.name} | Price > 200 EMA | RSI > ${rsiMin} | Excl Thu`,
                  riskRules: `BE Trigger: +${beTrig} ATR | Target: +${tpMult} ATR | Initial Stop: -${slMult} ATR | Max Hold: ${is4H ? maxHold*4 + 'h' : maxHold + 'd'}`,
                  ...stats
                });
              }
            }
          }
        }
      }
    }
  }
}

console.log('Testing ETH 4H Break-Even Engine...');
testBreakEvenEngine(datasets.eth4H, 'ETHUSDT', 'Ethereum', true);
console.log('Testing BTC 4H Break-Even Engine...');
testBreakEvenEngine(datasets.btc4H, 'BTCUSDT', 'Bitcoin', true);
console.log('Testing Gold 4H Break-Even Engine...');
testBreakEvenEngine(datasets.gold4H, 'XAUUSD', 'Gold', true);
console.log('Testing ETH Daily Break-Even Engine...');
testBreakEvenEngine(datasets.ethDaily, 'ETHUSDT', 'Ethereum', false);
console.log('Testing BTC Daily Break-Even Engine...');
testBreakEvenEngine(datasets.btcDaily, 'BTCUSDT', 'Bitcoin', false);

console.log(`\nTotal Holy Grail Configurations Found: ${holyGrailCandidates.length}`);

// Sort by Calmar Ratio
holyGrailCandidates.sort((a, b) => b.calmar - a.calmar);

console.log('\n========================================================================');
console.log('   THE HOLY GRAIL LEADERBOARD (WIN RATE 75-80% + CALMAR >= 4.0 + CAGR >= 30%)');
console.log('========================================================================\n');

holyGrailCandidates.slice(0, 15).forEach((s, idx) => {
  console.log(`#${idx + 1}: ${s.name} [${s.asset} | ${s.timeframe}]`);
  console.log(`    Win Rate: ${s.wr.toFixed(2)}% | Calmar: ${s.calmar.toFixed(2)} | CAGR: +${s.cagr.toFixed(2)}%/yr | Max DD: ${s.maxDD.toFixed(2)}%`);
  console.log(`    Realized RR: ${s.realizedRR.toFixed(2)} : 1 (Planned: ${s.plannedRR}) | Profit Factor: ${s.pf.toFixed(2)}`);
  console.log(`    Total Trades: ${s.totalTrades} (Wins: ${s.wins}, BE: ${s.be}, Losses: ${s.losses}) | Avg/Month: ${(s.totalTrades / (parseFloat(s.sampleYears)*12)).toFixed(1)}/mo`);
  console.log(`    Setup: ${s.setup}`);
  console.log(`    Risk / BE Rules: ${s.riskRules}\n`);
});

fs.writeFileSync('quant_seasonality/data/holy_grail_75wr_4calmar_30cagr.json', JSON.stringify(holyGrailCandidates, null, 2));
console.log('Saved to quant_seasonality/data/holy_grail_75wr_4calmar_30cagr.json');
