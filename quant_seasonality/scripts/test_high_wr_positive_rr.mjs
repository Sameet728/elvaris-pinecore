import fs from 'fs';

const btcDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8'));
const ethDaily = JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8'));

console.log('--- Testing Bitcoin & Ethereum Macro Anomaly Models for High WR + RR >= 1.0 + CAGR >= 30% ---');

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

function testAsset(bars, name) {
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const times = bars.map(b => b.time);

  const ema200 = computeEMA(closes, 200);
  const rsi14 = computeRSI(closes, 14);

  // Model 1: Weekend Anomaly (Buy Friday Close -> Sell Monday Close) in Bull Market
  {
    let eq = 100, peak = 100, maxDD = 0, wins = 0, total = 0;
    const winRets = [], lossRets = [];
    for (let i = 200; i < n - 3; i++) {
      const d = new Date(times[i]).getUTCDay();
      if (d === 5 && closes[i] > ema200[i]) { // Friday Close
        const exitPrice = closes[i + 3]; // Monday Close
        const ret = ((exitPrice - closes[i]) / closes[i]) * 100;
        total++;
        if (ret > 0) {
          wins++;
          winRets.push(ret);
        } else {
          lossRets.push(Math.abs(ret));
        }
        eq = eq * (1 + ret / 100);
        if (eq > peak) peak = eq;
        const dd = ((peak - eq) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
      }
    }
    const wr = (wins / total) * 100;
    const avgWin = winRets.reduce((a, b) => a + b, 0) / winRets.length;
    const avgLoss = lossRets.reduce((a, b) => a + b, 0) / lossRets.length;
    const rr = avgWin / avgLoss;
    const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;
    console.log(`[${name} Weekend Engine (Fri->Mon Close)]`);
    console.log(`  WR: ${wr.toFixed(1)}% | RR: ${rr.toFixed(2)} : 1 (Avg Win: +${avgWin.toFixed(1)}% vs Avg Loss: -${avgLoss.toFixed(1)}%)`);
    console.log(`  CAGR: +${cagr.toFixed(1)}%/yr | Total: +${(eq - 100).toFixed(0)}% | MaxDD: ${maxDD.toFixed(1)}% | Calmar: ${(cagr/maxDD).toFixed(2)} | Trades: ${total}\n`);
  }

  // Model 2: Turn of the Month (Days 27 through 4)
  {
    let eq = 100, peak = 100, maxDD = 0, wins = 0, total = 0;
    const winRets = [], lossRets = [];
    for (let i = 200; i < n; i++) {
      const dt = new Date(times[i]);
      const dom = dt.getUTCDate();
      const dow = dt.getUTCDay();
      if ((dom >= 27 || dom <= 4) && dow !== 4 && closes[i] > ema200[i]) {
        const ret = ((closes[i] - opens[i]) / opens[i]) * 100;
        total++;
        if (ret > 0) {
          wins++;
          winRets.push(ret);
        } else {
          lossRets.push(Math.abs(ret));
        }
        eq = eq * (1 + ret / 100);
        if (eq > peak) peak = eq;
        const dd = ((peak - eq) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
      }
    }
    const wr = (wins / total) * 100;
    const avgWin = winRets.reduce((a, b) => a + b, 0) / winRets.length;
    const avgLoss = lossRets.reduce((a, b) => a + b, 0) / lossRets.length;
    const rr = avgWin / avgLoss;
    const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;
    console.log(`[${name} Turn-of-Month Drift (Day 27-4, Excl Thu)]`);
    console.log(`  WR: ${wr.toFixed(1)}% | RR: ${rr.toFixed(2)} : 1 (Avg Win: +${avgWin.toFixed(1)}% vs Avg Loss: -${avgLoss.toFixed(1)}%)`);
    console.log(`  CAGR: +${cagr.toFixed(1)}%/yr | Total: +${(eq - 100).toFixed(0)}% | MaxDD: ${maxDD.toFixed(1)}% | Calmar: ${(cagr/maxDD).toFixed(2)} | Trades: ${total}\n`);
  }

  // Model 3: Active Mon-Wed-Fri Bull Drift
  {
    let eq = 100, peak = 100, maxDD = 0, wins = 0, total = 0;
    const winRets = [], lossRets = [];
    for (let i = 200; i < n; i++) {
      const dt = new Date(times[i]);
      const dow = dt.getUTCDay();
      if ((dow === 1 || dow === 3 || dow === 5) && closes[i] > ema200[i]) {
        const ret = ((closes[i] - opens[i]) / opens[i]) * 100;
        total++;
        if (ret > 0) {
          wins++;
          winRets.push(ret);
        } else {
          lossRets.push(Math.abs(ret));
        }
        eq = eq * (1 + ret / 100);
        if (eq > peak) peak = eq;
        const dd = ((peak - eq) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
      }
    }
    const wr = (wins / total) * 100;
    const avgWin = winRets.reduce((a, b) => a + b, 0) / winRets.length;
    const avgLoss = lossRets.reduce((a, b) => a + b, 0) / lossRets.length;
    const rr = avgWin / avgLoss;
    const cagr = (Math.pow(eq / 100, 1 / years) - 1) * 100;
    console.log(`[${name} Active Mon-Wed-Fri Drift Engine]`);
    console.log(`  WR: ${wr.toFixed(1)}% | RR: ${rr.toFixed(2)} : 1 (Avg Win: +${avgWin.toFixed(1)}% vs Avg Loss: -${avgLoss.toFixed(1)}%)`);
    console.log(`  CAGR: +${cagr.toFixed(1)}%/yr | Total: +${(eq - 100).toFixed(0)}% | MaxDD: ${maxDD.toFixed(1)}% | Calmar: ${(cagr/maxDD).toFixed(2)} | Trades: ${total}\n`);
  }
}

testAsset(btcDaily, 'Bitcoin (BTCUSDT)');
testAsset(ethDaily, 'Ethereum (ETHUSDT)');
