const fs = require('fs');

const candles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const N = candles.length;
console.log(`Loaded ${N} candles.`);

// Strategy 1 official trades baseline
const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8');

function calcEMA(len) {
  const ema = new Float64Array(N);
  const k = 2 / (len + 1);
  let s = 0;
  for (let i = 0; i < len; i++) s += candles[i].close;
  ema[len - 1] = s / len;
  for (let i = len; i < N; i++) ema[i] = candles[i].close * k + ema[i - 1] * (1 - k);
  return ema;
}

function calcSMA(len) {
  const sma = new Float64Array(N);
  let s = 0;
  for (let i = 0; i < len; i++) s += candles[i].close;
  sma[len - 1] = s / len;
  for (let i = len; i < N; i++) {
    s += candles[i].close - candles[i - len].close;
    sma[i] = s / len;
  }
  return sma;
}

function calcStDev(len, sma) {
  const sd = new Float64Array(N);
  for (let i = len - 1; i < N; i++) {
    let v = 0;
    const m = sma[i];
    for (let j = 0; j < len; j++) {
      const d = candles[i - j].close - m;
      v += d * d;
    }
    sd[i] = Math.sqrt(v / len);
  }
  return sd;
}

function calcRSI(len = 14) {
  const rsi = new Float64Array(N);
  let g = 0, l = 0;
  for (let i = 1; i <= len; i++) {
    const d = candles[i].close - candles[i - 1].close;
    if (d > 0) g += d; else l -= d;
  }
  let ag = g / len, al = l / len;
  rsi[len] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  for (let i = len + 1; i < N; i++) {
    const d = candles[i].close - candles[i - 1].close;
    ag = (ag * (len - 1) + (d > 0 ? d : 0)) / len;
    al = (al * (len - 1) + (d < 0 ? -d : 0)) / len;
    rsi[i] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  }
  return rsi;
}

function calcATR(len = 14) {
  const tr = new Float64Array(N);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < N; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const atr = new Float64Array(N);
  let s = 0;
  for (let i = 0; i < len; i++) s += tr[i];
  atr[len - 1] = s / len;
  for (let i = len; i < N; i++) {
    atr[i] = (atr[i - 1] * (len - 1) + tr[i]) / len;
  }
  return atr;
}

const ema50 = calcEMA(50);
const ema200 = calcEMA(200);
const rsi14 = calcRSI(14);
const atr14 = calcATR(14);

// Get calendar day for each candle
const candleDay = new Int32Array(N);
const candleHour = new Int32Array(N);
for (let i = 0; i < N; i++) {
  const d = new Date(candles[i].openTime);
  candleDay[i] = d.getUTCDate();
  candleHour[i] = d.getUTCHours();
}

// Fast simulation engine with daily circuit breakers
function simulateWithBreaker(signals, tp, sl, maxLosses = 1, maxTrades = 2) {
  let wins = 0, losses = 0, inPos = false, posType = null, ep = 0, slP = 0, tpP = 0, epIdx = 0;
  const trades = [];
  let peak = 0, maxDD = 0, runningPnl = 0;

  let curDay = -1;
  let dayTrades = 0;
  let dayLosses = 0;

  const months = {
    '2026-08': { trades: 0, wins: 0, r: 0 },
    '2026-09': { trades: 0, wins: 0, r: 0 },
    '2026-10': { trades: 0, wins: 0, r: 0 },
    '2026-11': { trades: 0, wins: 0, r: 0 }
  };

  for (let i = 200; i < N; i++) {
    const c = candles[i];
    const day = candleDay[i];

    if (day !== curDay) {
      curDay = day;
      dayTrades = 0;
      dayLosses = 0;
    }

    if (inPos) {
      let closed = false, pnl = 0, isWin = false;
      if (posType === 'LONG') {
        if (c.low <= slP) {
          losses++;
          pnl = slP - ep;
          isWin = false;
          closed = true;
          dayLosses++;
        } else if (c.high >= tpP) {
          wins++;
          pnl = tpP - ep;
          isWin = true;
          closed = true;
        }
      } else {
        if (c.high >= slP) {
          losses++;
          pnl = ep - slP;
          isWin = false;
          closed = true;
          dayLosses++;
        } else if (c.low <= tpP) {
          wins++;
          pnl = ep - tpP;
          isWin = true;
          closed = true;
        }
      }

      if (closed) {
        runningPnl += pnl;
        if (runningPnl > peak) peak = runningPnl;
        const dd = peak - runningPnl;
        if (dd > maxDD) maxDD = dd;

        const tradeObj = {
          type: posType,
          win: isWin,
          pnl,
          entryTime: candles[epIdx].openTime,
          exitTime: c.openTime
        };
        trades.push(tradeObj);

        const dt = new Date(tradeObj.entryTime);
        const mKey = dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0');
        if (months[mKey]) {
          months[mKey].trades++;
          if (isWin) months[mKey].wins++;
          months[mKey].r += (pnl / sl);
        }
        inPos = false;
      }
    }

    const canTrade = (maxLosses === 0 || dayLosses < maxLosses) && (maxTrades === 0 || dayTrades < maxTrades);

    if (!inPos && signals[i] && canTrade) {
      inPos = true;
      posType = signals[i];
      ep = c.close;
      epIdx = i;
      dayTrades++;
      if (posType === 'LONG') {
        tpP = ep + tp;
        slP = ep - sl;
      } else {
        tpP = ep - tp;
        slP = ep + sl;
      }
    }
  }

  const total = wins + losses;
  if (total < 30) return null;
  const winRate = (wins / total) * 100;
  const netProfit = runningPnl;
  const calmar = maxDD > 0 ? netProfit / maxDD : 0;

  const augR = months['2026-08'].r;
  const sepR = months['2026-09'].r;
  const octR = months['2026-10'].r;
  const novR = months['2026-11'].r;
  const totalR = augR + sepR + octR + novR;

  return {
    total,
    wins,
    losses,
    winRate,
    netProfit,
    maxDD,
    calmar,
    augR,
    sepR,
    octR,
    novR,
    totalR,
    months,
    trades
  };
}

// Run Strategy 1 baseline
async function main() {
  const res = await fetch('http://127.0.0.1:3005/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script: s1Script, datasetName: 'xauusd_15m', symbol: 'FOREXCOM:XAUUSD', timeframe: '15' })
  });
  const d = await res.json();
  const s1Trades = d.result.trades;
  console.log(`Loaded Strategy 1: ${s1Trades.length} trades.`);

  const candidates = [];

  // Search parameters
  for (let bandLen of [22, 24, 26, 28, 30, 32]) {
    const sma = calcSMA(bandLen);
    for (let mult of [1.9, 2.0, 2.1, 2.2, 2.3]) {
      const sd = calcStDev(bandLen, sma);
      const upper = new Float64Array(N);
      const lower = new Float64Array(N);
      for (let i = bandLen - 1; i < N; i++) {
        upper[i] = sma[i] + mult * sd[i];
        lower[i] = sma[i] - mult * sd[i];
      }

      for (let session of [
        { name: '01-16_UTC', start: 1, end: 16, excludeH12: true },
        { name: '01-18_UTC', start: 1, end: 18, excludeH12: true },
        { name: '01-20_UTC', start: 1, end: 20, excludeH12: true },
        { name: '06-20_UTC', start: 6, end: 20, excludeH12: false },
        { name: '06-18_UTC', start: 6, end: 18, excludeH12: true },
        { name: '07-21_UTC', start: 7, end: 21, excludeH12: false }
      ]) {
        for (let tp of [13.0, 14.0, 15.0, 16.0, 17.0, 18.0]) {
          for (let sl of [13.5, 13.75, 14.0]) {
            for (let rsiFilter of [50, 52, 54]) {
              for (let emaOffset of [2.0, 3.0, 4.0, 5.0]) {
                for (let crashFilter of [1.0, 1.25, 1.5]) {
                  const signals = new Array(N);
                  for (let i = 200; i < N; i++) {
                    const h = candleHour[i];
                    if (h < session.start || h > session.end) continue;
                    if (session.excludeH12 && h === 12) continue;

                    const c = candles[i];
                    const passCrash = c.close >= (ema50[i] - crashFilter * atr14[i]);

                    if (c.close > (ema200[i] + emaOffset) && c.low <= lower[i] && c.close > c.open && rsi14[i] < rsiFilter && passCrash) {
                      signals[i] = 'LONG';
                    } else if (c.close < ema200[i] && ema50[i] < ema200[i] && c.high >= upper[i] && c.close < c.open && rsi14[i] > (100 - rsiFilter)) {
                      signals[i] = 'SHORT';
                    }
                  }

                  const sim = simulateWithBreaker(signals, tp, sl, 1, 2);
                  if (sim && sim.winRate >= 80.0 && sim.calmar >= 4.0) {
                    // Check monthly criteria: Aug >= 7.5R, Sep >= 7.5R, Oct >= 7.0R, Nov >= 1.5R, Total >= 26R
                    if (sim.augR >= 7.5 && sim.sepR >= 7.5 && sim.octR >= 7.0 && sim.novR >= 1.5 && sim.totalR >= 26.0) {
                      // Compute overlap with S1
                      let shared = 0;
                      for (const t of sim.trades) {
                        if (s1Trades.some(s1t => Math.abs(s1t.entryTime - t.entryTime) <= 45 * 60 * 1000)) {
                          shared++;
                        }
                      }
                      const jaccard = (shared / (sim.trades.length + s1Trades.length - shared)) * 100;

                      candidates.push({
                        params: { bandLen, mult, session: session.name, tp, sl, rsiFilter, emaOffset, crashFilter },
                        sim,
                        sharedWithS1: shared,
                        jaccardS1: jaccard
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`\nFound ${candidates.length} candidates satisfying >=80% WR, Calmar > 4.0, and high monthly R!`);

  // Filter candidates that are NOT identical to S1 (e.g. jaccard < 60% or different session/lookback)
  candidates.sort((a, b) => b.sim.totalR - a.sim.totalR || a.jaccardS1 - b.jaccardS1);

  fs.writeFileSync('exact_8r_candidates.json', JSON.stringify(candidates.slice(0, 50), null, 2));

  console.log('\nTop 10 High-Yield Candidates:');
  candidates.slice(0, 10).forEach((c, idx) => {
    const s = c.sim;
    console.log(`\n#${idx + 1} Session: ${c.params.session} | L${c.params.bandLen} M${c.params.mult} TP${c.params.tp} SL${c.params.sl} | Trades=${s.total} | WR=${s.winRate.toFixed(1)}% | Calmar=${s.calmar.toFixed(1)} | TotR=+${s.totalR.toFixed(2)}R`);
    console.log(`    Aug: +${s.augR.toFixed(2)}R | Sep: +${s.sepR.toFixed(2)}R | Oct: +${s.octR.toFixed(2)}R | Nov: +${s.novR.toFixed(2)}R`);
    console.log(`    Overlap with S1: ${c.sharedWithS1}/${s.total} trades (${c.jaccardS1.toFixed(1)}% Jaccard)`);
    console.log(`    Params:`, c.params);
  });
}

main().catch(console.error);

