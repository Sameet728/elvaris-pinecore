import { MonteCarloSimulation, MonteCarloBand } from '@/types/backtest';

// Seeded Mulberry32 PRNG for deterministic, reproducible Monte Carlo runs
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RunMonteCarloOptions {
  tradeReturnsR: number[];
  initialCapital: number;
  riskDollars: number;
  iterations?: number;
  seed?: number;
  propDrawdownCashLimit?: number;
}

export function runMonteCarlo({
  tradeReturnsR,
  initialCapital,
  riskDollars,
  iterations = 2000,
  seed = 42,
  propDrawdownCashLimit = 3000,
}: RunMonteCarloOptions): MonteCarloSimulation {
  const n = tradeReturnsR.length;
  if (n === 0) {
    return {
      iterations,
      fanBands: [],
      medianFinalEquity: initialCapital,
      p5FinalEquity: initialCapital,
      p95MaxDrawdownPct: 0,
      probProfit: 1,
      probDrawdownBreach: 0,
      riskOfRuin: 0,
      expectedMaxLossStreak: 0,
    };
  }

  const rng = mulberry32(seed);

  // Store equity curves for all iterations: curves[iter][tradeIndex]
  const finalEquities: number[] = new Array(iterations);
  const maxDrawdownsCash: number[] = new Array(iterations);
  const maxLossStreaks: number[] = new Array(iterations);
  let profitCount = 0;
  let drawdownBreachCount = 0;
  let ruinCount = 0;

  // We will sample fan bands at every trade step (or every step up to n)
  // For memory efficiency, track points at 0, 1, ..., n
  const stepEquities: number[][] = Array.from({ length: n + 1 }, () => new Array(iterations));

  for (let it = 0; it < iterations; it++) {
    let currentEquity = initialCapital;
    let peakEquity = initialCapital;
    let maxDD = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    stepEquities[0][it] = initialCapital;

    for (let i = 0; i < n; i++) {
      // Bootstrap with replacement
      const randomIndex = Math.floor(rng() * n);
      const r = tradeReturnsR[randomIndex];
      const pnlCash = r * riskDollars;

      currentEquity += pnlCash;
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }
      const dd = peakEquity - currentEquity;
      if (dd > maxDD) {
        maxDD = dd;
      }

      if (r <= 0) {
        currentLossStreak++;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      } else {
        currentLossStreak = 0;
      }

      stepEquities[i + 1][it] = currentEquity;
    }

    finalEquities[it] = currentEquity;
    maxDrawdownsCash[it] = maxDD;
    maxLossStreaks[it] = maxLossStreak;

    if (currentEquity > initialCapital) profitCount++;
    if (maxDD >= propDrawdownCashLimit) drawdownBreachCount++;
    if (currentEquity <= initialCapital * 0.5) ruinCount++; // 50% drawdown considered ruin
  }

  finalEquities.sort((a, b) => a - b);
  maxDrawdownsCash.sort((a, b) => a - b);

  // Percentiles for fan chart at each step
  const fanBands: MonteCarloBand[] = [];
  for (let step = 0; step <= n; step++) {
    const sortedStep = stepEquities[step].slice().sort((a, b) => a - b);
    fanBands.push({
      tradeIndex: step,
      p5: sortedStep[Math.floor(iterations * 0.05)],
      p25: sortedStep[Math.floor(iterations * 0.25)],
      p50: sortedStep[Math.floor(iterations * 0.50)],
      p75: sortedStep[Math.floor(iterations * 0.75)],
      p95: sortedStep[Math.floor(iterations * 0.95)],
    });
  }

  const medianFinalEquity = finalEquities[Math.floor(iterations * 0.50)];
  const p5FinalEquity = finalEquities[Math.floor(iterations * 0.05)];
  const p95MaxDrawdownCash = maxDrawdownsCash[Math.floor(iterations * 0.95)];
  const p95MaxDrawdownPct = (p95MaxDrawdownCash / initialCapital) * 100;

  const avgMaxLossStreak =
    maxLossStreaks.reduce((acc, v) => acc + v, 0) / iterations;

  return {
    iterations,
    fanBands,
    medianFinalEquity,
    p5FinalEquity,
    p95MaxDrawdownPct,
    probProfit: (profitCount / iterations) * 100,
    probDrawdownBreach: (drawdownBreachCount / iterations) * 100,
    riskOfRuin: (ruinCount / iterations) * 100,
    expectedMaxLossStreak: Math.round(avgMaxLossStreak * 10) / 10,
  };
}

