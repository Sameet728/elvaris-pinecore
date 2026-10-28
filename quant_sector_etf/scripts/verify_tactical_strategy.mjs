import fs from 'fs';
import path from 'path';

const dataDir = 'c:/Users/samee/Desktop/Pine/quant_sector_etf/data';
const niftyBars = JSON.parse(fs.readFileSync(path.join(dataDir, 'niftybees_daily.json'), 'utf8'));

// Run standalone tactical strategy on Nifty 50
let cash = 1000000;
let position = 0; // shares
let entryPrice = 0;
let peakPrice = 0;
let trades = [];
let barsSinceRebal = 0;
const rebalanceInterval = 15;
const stopLossPct = 6.0;
const trailingDevPct = 10.0;
const smaLen = 200;

function calc13612W(bars, idx) {
  if (idx < 252) return null;
  const c = bars[idx].close;
  const r1 = (c - bars[idx - 21].close) / bars[idx - 21].close;
  const r3 = (c - bars[idx - 63].close) / bars[idx - 63].close;
  const r6 = (c - bars[idx - 126].close) / bars[idx - 126].close;
  const r12 = (c - bars[idx - 252].close) / bars[idx - 252].close;
  return 12 * r1 + 4 * r3 + 2 * r6 + 1 * r12;
}

function calcSMA(bars, idx, len) {
  if (idx < len - 1) return null;
  let s = 0;
  for (let i = 0; i < len; i++) s += bars[idx - i].close;
  return s / len;
}

const equityCurve = [];

for (let i = smaLen; i < niftyBars.length; i++) {
  const bar = niftyBars[i];
  const c = bar.close;
  const sma200 = calcSMA(niftyBars, i, smaLen);
  const score = calc13612W(niftyBars, i);

  const isBull = c > sma200;
  const isPos = score > 0;

  // Intraday / daily risk management
  if (position > 0) {
    if (c > peakPrice) peakPrice = c;
    const lossFromEntry = ((c - entryPrice) / entryPrice) * 100;
    const dropFromPeak = ((c - peakPrice) / peakPrice) * 100;

    let exitReason = null;
    if (lossFromEntry <= -stopLossPct) exitReason = 'Circuit Breaker Stop';
    else if (dropFromPeak <= -trailingDevPct) exitReason = 'Trailing Drawdown Stop';
    else if (!isBull && !isPos) exitReason = 'Trend Failure';

    if (exitReason) {
      cash += position * c * (1 - 0.0005);
      const pnlPct = ((c - entryPrice) / entryPrice) * 100;
      trades.push({
        entry: entryPrice,
        exit: c,
        pnlPct,
        reason: exitReason,
        bars: barsSinceRebal
      });
      position = 0;
      entryPrice = 0;
      peakPrice = 0;
      barsSinceRebal = 0;
    }
  }

  // Periodic Rebalance Check
  barsSinceRebal++;
  if (barsSinceRebal >= rebalanceInterval) {
    barsSinceRebal = 0;
    if (isBull && isPos) {
      if (position === 0) {
        position = Math.floor(cash / c);
        cash -= position * c * (1 + 0.0005);
        entryPrice = c;
        peakPrice = c;
      }
    } else {
      if (position > 0) {
        cash += position * c * (1 - 0.0005);
        const pnlPct = ((c - entryPrice) / entryPrice) * 100;
        trades.push({
          entry: entryPrice,
          exit: c,
          pnlPct,
          reason: 'Rebalance Exit',
          bars: barsSinceRebal
        });
        position = 0;
        entryPrice = 0;
        peakPrice = 0;
      }
    }
  }

  const curEquity = cash + (position > 0 ? position * c : 0);
  equityCurve.push({ time: bar.time, equity: curEquity, close: c });
}

const finalEq = equityCurve[equityCurve.length - 1].equity;
const totalRet = ((finalEq - 1000000) / 1000000) * 100;
const years = (niftyBars[niftyBars.length - 1].time - niftyBars[smaLen].time) / (1000 * 60 * 60 * 24 * 365.25);
const cagr = (Math.pow(finalEq / 1000000, 1 / years) - 1) * 100;

let peak = -Infinity;
let maxDD = 0;
for (const pt of equityCurve) {
  if (pt.equity > peak) peak = pt.equity;
  const dd = ((peak - pt.equity) / peak) * 100;
  if (dd > maxDD) maxDD = dd;
}

const wins = trades.filter(t => t.pnlPct > 0);
const losses = trades.filter(t => t.pnlPct <= 0);
const wr = (wins.length / trades.length) * 100;
const grossProfit = wins.reduce((s, t) => s + t.pnlPct, 0);
const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));
const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit;

console.log('--- NIFTYBEES STANDALONE TACTICAL STRATEGY VERIFICATION ---');
console.log(`Total Trades: ${trades.length}`);
console.log(`Win Rate: ${wr.toFixed(1)}% (${wins.length} W / ${losses.length} L)`);
console.log(`Profit Factor: ${pf.toFixed(2)}`);
console.log(`Total Return: +${totalRet.toFixed(1)}%`);
console.log(`CAGR: ${cagr.toFixed(2)}%`);
console.log(`Max Drawdown: ${maxDD.toFixed(2)}% (vs Buy & Hold Nifty DD 38.4%)`);
console.log(`Calmar Ratio: ${(cagr / maxDD).toFixed(2)}`);
