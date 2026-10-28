import fs from 'fs';

const ethDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8'));

console.log('========================================================================');
console.log('      RESEARCHING ETHEREUM DAILY CALENDAR ANOMALIES (9.2 YEARS)         ');
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

const n = ethDaily.length;
const years = (ethDaily[n - 1].time - ethDaily[0].time) / (1000 * 60 * 60 * 24 * 365.25);
const closes = ethDaily.map(b => b.close);
const opens = ethDaily.map(b => b.open);
const times = ethDaily.map(b => b.time);

const ema200 = computeEMA(closes, 200);

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayStats = {};

for (let d = 0; d < 7; d++) {
  dayStats[d] = { name: dayNames[d], trades: 0, wins: 0, returns: [], eq: [100], peak: 100, maxDD: 0, grossWin: 0, grossLoss: 0 };
}

for (let i = 200; i < n; i++) {
  const d = new Date(times[i]).getUTCDay();
  const ret = ((closes[i] - opens[i]) / opens[i]) * 100;

  // Trend filter
  if (closes[i] > ema200[i]) {
    const s = dayStats[d];
    s.trades++;
    s.returns.push(ret);
    if (ret > 0) {
      s.wins++;
      s.grossWin += ret;
    } else {
      s.grossLoss += Math.abs(ret);
    }

    const prevEq = s.eq[s.eq.length - 1];
    const newEq = prevEq * (1 + ret / 100);
    s.eq.push(newEq);
    if (newEq > s.peak) s.peak = newEq;
    const dd = ((s.peak - newEq) / s.peak) * 100;
    if (dd > s.maxDD) s.maxDD = dd;
  }
}

console.log('Day\t\tTrades\tWinRate\tTotalRet%\tCAGR%\tMaxDD%\tCalmar\tProfitFactor');
console.log('--------------------------------------------------------------------------------');

for (let d = 0; d < 7; d++) {
  const s = dayStats[d];
  const wr = (s.wins / s.trades) * 100;
  const finalEq = s.eq[s.eq.length - 1];
  const totalRet = finalEq - 100;
  const cagr = (Math.pow(finalEq / 100, 1 / years) - 1) * 100;
  const calmar = s.maxDD > 0 ? cagr / s.maxDD : 0;
  const pf = s.grossLoss > 0 ? s.grossWin / s.grossLoss : 99;

  console.log(`${s.name}\t\t${s.trades}\t${wr.toFixed(1)}%\t+${totalRet.toFixed(1)}%\t+${cagr.toFixed(1)}%\t${s.maxDD.toFixed(1)}%\t${calmar.toFixed(2)}\t${pf.toFixed(2)}`);
}
