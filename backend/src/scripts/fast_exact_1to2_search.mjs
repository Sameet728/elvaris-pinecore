import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const n = candles.length;

const closes = new Float64Array(n);
const opens = new Float64Array(n);
const highs = new Float64Array(n);
const lows = new Float64Array(n);
const times = new Float64Array(n);
const hours = new Int32Array(n);
const bodies = new Float64Array(n);
const lowerWicks = new Float64Array(n);
const upperWicks = new Float64Array(n);

for (let i = 0; i < n; i++) {
  const c = candles[i];
  closes[i] = c.close;
  opens[i] = c.open;
  highs[i] = c.high;
  lows[i] = c.low;
  const t = c.openTime || c.time;
  times[i] = t;
  hours[i] = new Date(t).getUTCHours();
  bodies[i] = Math.abs(c.close - c.open);
  lowerWicks[i] = Math.min(c.open, c.close) - c.low;
  upperWicks[i] = c.high - Math.max(c.open, c.close);
}

function computeEMA(arr, period) {
  const ema = new Float64Array(n);
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  ema[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    ema[i] = arr[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function computeSMA(arr, period) {
  const sma = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  sma[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    sum += arr[i] - arr[i - period];
    sma[i] = sum / period;
  }
  return sma;
}

function computeRSI(arr, period = 14) {
  const rsi = new Float64Array(n);
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = arr[i] - arr[i - 1];
    if (diff > 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < n; i++) {
    const diff = arr[i] - arr[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return rsi;
}

function computeBB(arr, period, mult) {
  const basis = computeSMA(arr, period);
  const upper = new Float64Array(n);
  const lower = new Float64Array(n);
  for (let i = period - 1; i < n; i++) {
    let sumSq = 0;
    for (let j = 0; j < period; j++) {
      const d = arr[i - j] - basis[i];
      sumSq += d * d;
    }
    const dev = mult * Math.sqrt(sumSq / period);
    upper[i] = basis[i] + dev;
    lower[i] = basis[i] - dev;
  }
  return { upper, lower, basis };
}

const ema50 = computeEMA(closes, 50);
const ema200 = computeEMA(closes, 200);
const rsi14 = computeRSI(closes, 14);

const bbMap = new Map();
const periods = [20, 25, 28, 30, 35];
const mults = [2.0, 2.1, 2.2, 2.3, 2.4, 2.5];
for (const p of periods) {
  for (const m of mults) {
    bbMap.set(`${p}_${m}`, computeBB(closes, p, m));
  }
}

function simExact(bbKey, slDist, tpDist, rsiMax, sStart, sEnd, exclH12, wickMin, longOnly, beTrigger) {
  const bb = bbMap.get(bbKey);
  const bbLower = bb.lower;
  const bbUpper = bb.upper;
  const rsiShortMin = 100 - rsiMax;

  let inTrade = false;
  let dir = 0;
  let ep = 0;
  let currSL = 0;
  let tpP = 0;
  let beActive = false;

  const trades = [];
  let cumR = 0, peakR = 0, maxDD = 0;

  for (let i = 200; i < n - 1; i++) {
    if (inTrade) {
      const bHigh = highs[i];
      const bLow = lows[i];
      let exited = false;
      let pnlR = 0;

      if (dir === 1) {
        if (beTrigger > 0 && !beActive && bHigh >= (ep + slDist * beTrigger)) {
          currSL = ep;
          beActive = true;
        }

        if (bHigh >= tpP) {
          pnlR = 2.0; // Exact 1:2 R:R!
          exited = true;
        } else if (bLow <= currSL) {
          pnlR = beActive && currSL === ep ? 0.0 : -1.0;
          exited = true;
        }
      } else {
        if (beTrigger > 0 && !beActive && bLow <= (ep - slDist * beTrigger)) {
          currSL = ep;
          beActive = true;
        }

        if (bLow <= tpP) {
          pnlR = 2.0; // Exact 1:2 R:R!
          exited = true;
        } else if (bHigh >= currSL) {
          pnlR = beActive && currSL === ep ? 0.0 : -1.0;
          exited = true;
        }
      }

      if (exited) {
        trades.push(pnlR);
        cumR += pnlR;
        if (cumR > peakR) peakR = cumR;
        if (peakR - cumR > maxDD) maxDD = peakR - cumR;
        inTrade = false;
      }
    }

    if (!inTrade) {
      const h = hours[i];
      if (h < sStart || h > sEnd) continue;
      if (exclH12 && h === 12) continue;

      const c = closes[i];
      const o = opens[i];
      const l = lows[i];
      const hBar = highs[i];
      const r = rsi14[i];
      const b = bodies[i];

      const wickLongOk = wickMin === 0 || lowerWicks[i] >= (b * wickMin);
      const wickShortOk = wickMin === 0 || upperWicks[i] >= (b * wickMin);

      const longCond = c > (ema200[i] + 4.0) && l <= bbLower[i] && c > o && r < rsiMax && wickLongOk;
      const shortCond = !longOnly && c < ema200[i] && ema50[i] < ema200[i] && hBar >= bbUpper[i] && c < o && r > rsiShortMin && wickShortOk;

      if (longCond) {
        inTrade = true;
        dir = 1;
        ep = closes[i];
        currSL = ep - slDist;
        tpP = ep + tpDist;
        beActive = false;
      } else if (shortCond) {
        inTrade = true;
        dir = -1;
        ep = closes[i];
        currSL = ep + slDist;
        tpP = ep - tpDist;
        beActive = false;
      }
    }
  }

  if (trades.length < 20) return null;

  const wins = trades.filter(r => r > 0).length;
  const losses = trades.filter(r => r < 0).length;
  const bes = trades.filter(r => r === 0).length;
  const wr = (wins / (wins + losses)) * 100;
  const calmar = maxDD > 0 ? (cumR / maxDD) : 99;

  return {
    bbKey, slDist, tpDist, rsiMax, sStart, sEnd, exclH12, wickMin, longOnly, beTrigger,
    trades: trades.length,
    wins,
    losses,
    bes,
    winRate: wr,
    netR: cumR,
    maxDD,
    calmar
  };
}

console.log('Running ultra-fast precomputed search for 1:2 R:R (WR >= 70%, Calmar >= 4)...');

const slList = [8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0];
const rsiMaxs = [48, 50, 52, 54];
const sessionStarts = [1, 2, 6];
const sessionEnds = [19, 20];
const wickMins = [0.0, 0.10, 0.15, 0.20, 0.25];
const beTriggers = [0.0, 0.8, 1.0];

const winners = [];

for (const [bbKey] of bbMap.entries()) {
  for (const sl of slList) {
    const tp = sl * 2.0; // STRICT 1:2.0 R:R
    for (const rsiMax of rsiMaxs) {
      for (const sStart of sessionStarts) {
        for (const sEnd of sessionEnds) {
          for (const wickMin of wickMins) {
            for (const beTrigger of beTriggers) {
              for (const longOnly of [false, true]) {
                const res = simExact(bbKey, sl, tp, rsiMax, sStart, sEnd, true, wickMin, longOnly, beTrigger);
                if (!res) continue;

                if (res.winRate >= 70.0 && res.calmar >= 4.0 && res.trades >= 20) {
                  winners.push(res);
                }
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Found ${winners.length} candidate configurations meeting ALL user requirements!\n`);

// Sort by Win Rate and Calmar
winners.sort((a, b) => (b.winRate * b.calmar * b.netR) - (a.winRate * a.calmar * a.netR));

for (let i = 0; i < Math.min(10, winners.length); i++) {
  const w = winners[i];
  console.log(`Rank #${i + 1}: BB(${w.bbKey}) | SL: $${w.slDist} / TP: $${w.tpDist} (1:2.0 R:R) | RSI<${w.rsiMax} | Wick:${w.wickMin} | Hours ${w.sStart}-${w.sEnd} | BE:${w.beTrigger} | LongOnly:${w.longOnly}`);
  console.log(`   Trades: ${w.trades} | Wins: ${w.wins} | Losses: ${w.losses} | BEs: ${w.bes} | Win Rate: ${w.winRate.toFixed(2)}% | Net: +${w.netR.toFixed(2)}R | MaxDD: ${w.maxDD.toFixed(2)}R | Calmar: ${w.calmar.toFixed(2)}\n`);
}

// Now verify the top 3 with PineTS
async function verifyTopPineTS() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  console.log('=== VERIFYING TOP CANDIDATES DIRECTLY IN PINETS ===');

  for (let i = 0; i < Math.min(3, winners.length); i++) {
    const w = winners[i];
    const [bLen, bMult] = w.bbKey.split('_');

    const shortCode = w.longOnly
      ? 'shortSig = false'
      : `shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${w.rsiMax}) and wickShortOk and strategy.position_size == 0`;

    const code = `//@version=5
strategy("Verify1to2", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${bLen})
dev = ${bMult} * ta.stdev(close, ${bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

body = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
wickLongOk = lowerWick >= (body * ${w.wickMin})
wickShortOk = upperWick >= (body * ${w.wickMin})

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${w.sStart} and utcHour <= ${w.sEnd}) and (utcHour != 12)

longSig = inActiveSession and close > (ema200 + 4.0) and low <= lower and close > open and rsi < ${w.rsiMax} and wickLongOk and strategy.position_size == 0
${shortCode}

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${w.slDist}
    tpP := ep + ${w.tpDist}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${w.slDist}
    tpP := ep - ${w.tpDist}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

    const res = await p.run(code);
    const trades = res.strategy.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0);
    const wr = (wins.length / trades.length) * 100;
    const netR = res.strategy.netprofit / w.slDist;
    const maxDD = (res.strategy.max_drawdown || 1) / w.slDist;
    const calmar = maxDD > 0 ? (netR / maxDD) : 0;

    console.log(`\n🏆 PINETS VERIFIED CHAMPION #${i + 1}:`);
    console.log(`   Config: SL $${w.slDist} / TP $${w.tpDist} (1:2.0 R:R) | BB(${bLen}, ${bMult}) | RSI<${w.rsiMax} | Wick:${w.wickMin} | Hours ${w.sStart}-${w.sEnd}`);
    console.log(`   Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${trades.length - wins.length}`);
    console.log(`   Win Rate: ${wr.toFixed(2)}% | Net Profit: $${res.strategy.netprofit.toFixed(2)} (+${netR.toFixed(2)}R)`);
    console.log(`   Max Drawdown: $${res.strategy.max_drawdown?.toFixed(2)} (${maxDD.toFixed(2)}R) | Calmar: ${calmar.toFixed(2)}`);

    const mR = {};
    const mW = {};
    const mL = {};
    for (const t of trades) {
      const m = new Date(t.entry_time).toISOString().substring(0, 7);
      mR[m] = (mR[m] || 0) + (t.profit / w.slDist);
      if (t.profit > 0) mW[m] = (mW[m] || 0) + 1;
      else mL[m] = (mL[m] || 0) + 1;
    }
    console.log(`   Monthly R:`, mR);
  }
}

verifyTopPineTS().catch(console.error);
