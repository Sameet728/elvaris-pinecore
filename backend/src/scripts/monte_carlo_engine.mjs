import fs from 'fs';

// Load existing 4-case comparison trades
const rawData = JSON.parse(fs.readFileSync('src/scripts/case4_comparison.json'));

/**
 * Monte Carlo Bootstrap Engine
 * Runs N iterations of trade resampling with replacement to generate
 * realistic probability distributions for Drawdown, Equity, and Calmar Ratio.
 */
function runMonteCarlo(trades, iterations = 5000, sequenceLength = null) {
  // Filter for resolved trades only
  const closedTrades = trades
    .filter(t => t.result === 'WIN' || t.result === 'LOSS')
    .map(t => {
      let r = t.profitR;
      // Exact dynamic R for Case 1
      if (t.result === 'WIN' && t.entryPrice && t.takeProfit && t.stopLoss) {
        const risk = Math.abs(t.entryPrice - t.stopLoss);
        const rew = Math.abs(t.takeProfit - t.entryPrice);
        if (risk > 0 && Math.abs(t.profitR - 2) < 0.01 && t.entryPrice !== t.takeProfit) {
          r = rew / risk;
        }
      } else if (t.result === 'LOSS') {
        r = -1.0;
      }
      return r;
    });

  const N = sequenceLength || closedTrades.length;
  if (closedTrades.length === 0) return null;

  const simMaxDDs = [];
  const simFinalRs = [];
  const simCalmars = [];
  const simMaxConsLosses = [];

  for (let iter = 0; iter < iterations; iter++) {
    let cumR = 0;
    let peak = 0;
    let maxDD = 0;
    let consL = 0;
    let maxConsL = 0;

    for (let i = 0; i < N; i++) {
      // Bootstrap with replacement
      const randIdx = Math.floor(Math.random() * closedTrades.length);
      const r = closedTrades[randIdx];

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
    simMaxConsLosses.push(maxConsL);

    // Calmar: Total R / Max DD (with min DD cap of 0.5 to avoid division by zero)
    const effDD = Math.max(maxDD, 0.5);
    simCalmars.push(cumR > 0 ? cumR / effDD : 0);
  }

  // Sort results for percentiles
  simMaxDDs.sort((a, b) => a - b);
  simFinalRs.sort((a, b) => a - b);
  simCalmars.sort((a, b) => a - b);
  simMaxConsLosses.sort((a, b) => a - b);

  const p = (arr, pct) => arr[Math.floor((pct / 100) * arr.length)];

  // Risk of Ruin: Probability that DD exceeds 10R or 15R
  const probDDExceeds10R = (simMaxDDs.filter(d => d >= 10).length / iterations) * 100;
  const probDDExceeds15R = (simMaxDDs.filter(d => d >= 15).length / iterations) * 100;
  const probLosingAccount = (simFinalRs.filter(r => r <= 0).length / iterations) * 100;

  return {
    sampleTrades: closedTrades.length,
    simulatedSequenceLength: N,
    iterations,
    // Drawdown
    dd_median: Number(p(simMaxDDs, 50).toFixed(2)),
    dd_95thWorst: Number(p(simMaxDDs, 95).toFixed(2)),
    dd_99thWorst: Number(p(simMaxDDs, 99).toFixed(2)),
    // Returns
    r_median: Number(p(simFinalRs, 50).toFixed(2)),
    r_5thWorst: Number(p(simFinalRs, 5).toFixed(2)),
    r_95thBest: Number(p(simFinalRs, 95).toFixed(2)),
    // Calmar Ratio
    calmar_median: Number(p(simCalmars, 50).toFixed(2)),
    calmar_5thWorst: Number(p(simCalmars, 5).toFixed(2)), // conservative 95% confidence floor
    calmar_95thBest: Number(p(simCalmars, 95).toFixed(2)),
    // Max Consecutive Losses
    consLoss_median: p(simMaxConsLosses, 50),
    consLoss_95thWorst: p(simMaxConsLosses, 95),
    // Risk Metrics
    probDDExceeds10R: Number(probDDExceeds10R.toFixed(1)),
    probDDExceeds15R: Number(probDDExceeds15R.toFixed(1)),
    probLosingAccount: Number(probLosingAccount.toFixed(1)),
  };
}

console.log('=== MONTE CARLO SIMULATION (5,000 ITERATIONS) FOR THE 4 CASES ===\n');

const cases = [
  { name: 'Case 3: Pre-Set Limit @ Mid (1:2 RR)', trades: rawData.case3.trades },
  { name: 'Case 1: Market on Close (Dynamic RR)', trades: rawData.case1.trades },
  { name: 'Case 2: Market on Close (1:2 RR)', trades: rawData.case2.trades },
  { name: 'Case 4A: Close -> Limit @ Mid Pullback', trades: rawData.case4A.trades },
  { name: 'Case 4B: Close -> Limit @ Edge Pullback', trades: rawData.case4B.trades },
];

const mcResults = {};

for (const c of cases) {
  const res = runMonteCarlo(c.trades, 5000);
  mcResults[c.name] = res;
  console.log(`>>> ${c.name} <<<`);
  console.log(`Median Return: +${res.r_median} R (95% CI: ${res.r_5thWorst} R to ${res.r_95thBest} R)`);
  console.log(`Median Max DD: -${res.dd_median} R | 95% Worst-Case DD: -${res.dd_95thWorst} R`);
  console.log(`Median Calmar: ${res.calmar_median} | 95% Worst-Case Calmar: ${res.calmar_5thWorst}`);
  console.log(`Max Cons Losses (95% Worst): ${res.consLoss_95thWorst}`);
  console.log(`Risk of DD >= 10R: ${res.probDDExceeds10R}% | Risk of Losing Account: ${res.probLosingAccount}%`);
  console.log('------------------------------------------------------------\n');
}

fs.writeFileSync('src/scripts/mc_cases_results.json', JSON.stringify(mcResults, null, 2));
