import fs from 'fs';

const ethDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8'));
const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));

console.log('--- Simulating 50/50 Dual-Asset Portfolio: BTC Daily + ETH Daily (Both RR >= 1.0) ---');

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

// Align dates between BTC and ETH daily
const ethMap = new Map();
ethDaily.forEach(b => {
  const dStr = new Date(b.time).toISOString().substring(0, 10);
  ethMap.set(dStr, b);
});

const commonBars = [];
btcDaily.forEach(b => {
  const dStr = new Date(b.time).toISOString().substring(0, 10);
  if (ethMap.has(dStr)) {
    commonBars.push({
      date: dStr,
      time: b.time,
      btc: b,
      eth: ethMap.get(dStr)
    });
  }
});

commonBars.sort((a, b) => a.time - b.time);
const n = commonBars.length;
const years = (commonBars[n - 1].time - commonBars[0].time) / (1000 * 60 * 60 * 24 * 365.25);

console.log(`Common Daily History: ${commonBars[0].date} to ${commonBars[n - 1].date} (${years.toFixed(1)} Years, ${n} Days)`);

const btcCloses = commonBars.map(b => b.btc.close);
const ethCloses = commonBars.map(b => b.eth.close);
const btcEMA = computeEMA(btcCloses, 200);
const ethEMA = computeEMA(ethCloses, 200);

let eq = 10000, peak = 10000, maxDD = 0;
let btcTrades = 0, ethTrades = 0, portWins = 0, portLosses = 0;
const portRets = [];
const winPcts = [], lossPcts = [];

for (let i = 200; i < n; i++) {
  const b = commonBars[i];
  const dt = new Date(b.time);
  const dow = dt.getUTCDay();
  const dom = dt.getUTCDate();

  // BTC Signal: Monday, Wednesday, Friday Close (Bull Regime)
  let btcRet = 0;
  if ((dow === 1 || dow === 3 || dow === 5) && b.btc.close > btcEMA[i]) {
    btcRet = ((b.btc.close - b.btc.open) / b.btc.open) * 100;
    btcTrades++;
  }

  // ETH Signal: Turn of Month (Day 27 - Day 4, Excl Thu, Bull Regime)
  let ethRet = 0;
  if ((dom >= 27 || dom <= 4) && dow !== 4 && b.eth.close > ethEMA[i]) {
    ethRet = ((b.eth.close - b.eth.open) / b.eth.open) * 100;
    ethTrades++;
  }

  // Portfolio daily return (50% allocation each)
  const portDailyRet = (btcRet * 0.5) + (ethRet * 0.5);

  if (btcRet !== 0 || ethRet !== 0) {
    if (portDailyRet > 0) {
      portWins++;
      winPcts.push(portDailyRet);
    } else if (portDailyRet < 0) {
      portLosses++;
      lossPcts.push(Math.abs(portDailyRet));
    }
    eq = eq * (1 + portDailyRet / 100);
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
}

const totalActiveDays = portWins + portLosses;
const wr = (portWins / totalActiveDays) * 100;
const cagr = (Math.pow(eq / 10000, 1 / years) - 1) * 100;
const calmar = maxDD > 0 ? cagr / maxDD : 0;
const avgWin = winPcts.reduce((a, b) => a + b, 0) / winPcts.length;
const avgLoss = lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length;
const realizedRR = avgWin / avgLoss;

console.log('\n--- PORTFOLIO ENSEMBLE RESULTS ---');
console.log(`Win Rate: ${wr.toFixed(1)}% | Realized RR: ${realizedRR.toFixed(2)} : 1 (Avg Win: +${avgWin.toFixed(2)}% vs Avg Loss: -${avgLoss.toFixed(2)}%)`);
console.log(`Yearly CAGR: +${cagr.toFixed(1)}%/yr | Total Gain: +${((eq - 10000)/100).toFixed(0)}%`);
console.log(`Max Drawdown: ${maxDD.toFixed(1)}% | Calmar Ratio: ${calmar.toFixed(2)}`);
console.log(`Total Active Trading Days: ${totalActiveDays} (BTC trades: ${btcTrades}, ETH trades: ${ethTrades})`);
