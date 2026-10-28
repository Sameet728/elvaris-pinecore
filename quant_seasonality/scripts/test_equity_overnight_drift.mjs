import fs from 'fs';

const spyDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/spy_daily.json', 'utf8'));
const qqqDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_daily.json', 'utf8'));

console.log('========================================================================');
console.log('   TESTING 30-YEAR OVERNIGHT EQUITY DRIFT ANOMALY (SPY & QQQ)          ');
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

function analyzeOvernight(bars, name) {
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const times = bars.map(b => b.time);

  const ema200 = computeEMA(closes, 200);

  // Strategy 1: Pure Overnight (Buy Close of day i-1, Sell Open of day i)
  // Strategy 2: Pure Daytime (Buy Open of day i, Sell Close of day i)
  // Strategy 3: Overnight + 200 EMA Filter

  for (const filter of ['none', 'ema200']) {
    let eqOvernight = 100, peakON = 100, maxDD_ON = 0, winsON = 0, totalON = 0;
    let grossWinON = 0, grossLossON = 0;
    const retsON = [];

    for (let i = 200; i < n; i++) {
      const prevClose = closes[i - 1];
      const currOpen = opens[i];

      const trendPass = filter === 'none' || prevClose > ema200[i - 1];
      if (trendPass) {
        const retON = ((currOpen - prevClose) / prevClose) * 100;
        totalON++;
        retsON.push(retON);
        if (retON > 0) {
          winsON++;
          grossWinON += retON;
        } else {
          grossLossON += Math.abs(retON);
        }

        eqOvernight = eqOvernight * (1 + retON / 100);
        if (eqOvernight > peakON) peakON = eqOvernight;
        const dd = ((peakON - eqOvernight) / peakON) * 100;
        if (dd > maxDD_ON) maxDD_ON = dd;
      }
    }

    const wr = (winsON / totalON) * 100;
    const cagr = (Math.pow(eqOvernight / 100, 1 / years) - 1) * 100;
    const pf = grossLossON > 0 ? grossWinON / grossLossON : 99;
    const calmar = maxDD_ON > 0 ? cagr / maxDD_ON : 0;
    const mean = retsON.reduce((a, b) => a + b, 0) / totalON;
    const variance = retsON.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totalON;
    const sharpe = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0;

    console.log(`[${name} Overnight Drift | Filter: ${filter}]`);
    console.log(`  Sample: ${years.toFixed(1)} Years | Trades: ${totalON} | Win Rate: ${wr.toFixed(2)}%`);
    console.log(`  Total Gain: +${(eqOvernight - 100).toFixed(1)}% | CAGR: +${cagr.toFixed(2)}% | Max DD: ${maxDD_ON.toFixed(2)}%`);
    console.log(`  Calmar Ratio: ${calmar.toFixed(2)} | Profit Factor: ${pf.toFixed(2)} | Sharpe: ${sharpe.toFixed(2)}\n`);
  }
}

analyzeOvernight(spyDaily, 'SPY (S&P 500)');
analyzeOvernight(qqqDaily, 'QQQ (Nasdaq 100)');
