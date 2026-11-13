const fs = require('fs');
const { dsXAU, s1Set } = require('./sim_framework');

console.log('Refining Zero-Overlap Gold Strategy 3 candidates...');

const ema50 = dsXAU.calcEMA(50);
const ema200 = dsXAU.calcEMA(200);
const atr14 = dsXAU.atr14;
const rsi14 = dsXAU.calcRSI(14);

function simulate(ds, longCond, shortCond, tp, sl, maxTrades = 2, maxLoss = 1) {
  let curDay = -1;
  let dayTradeCount = 0;
  let dayLossCount = 0;
  let inTrade = false;
  let tradeType = 0;
  let entryPrice = 0;
  let entryIndex = 0;
  const trades = [];

  for (let i = 200; i < ds.n; i++) {
    const day = ds.utcDay[i];
    if (day !== curDay) {
      curDay = day; dayTradeCount = 0; dayLossCount = 0;
    }
    if (inTrade) {
      let closed = false, profit = 0;
      if (tradeType === 1) {
        if (ds.low[i] <= entryPrice - sl) { closed = true; profit = -sl; }
        else if (ds.high[i] >= entryPrice + tp) { closed = true; profit = tp; }
      } else {
        if (ds.high[i] >= entryPrice + sl) { closed = true; profit = -sl; }
        else if (ds.low[i] <= entryPrice - tp) { closed = true; profit = tp; }
      }
      if (closed) {
        trades.push({ entryIndex, exitIndex: i, month: ds.utcMonth[entryIndex], profit, r: profit / sl, entryTime: ds.time[entryIndex] });
        if (profit <= 0) dayLossCount++;
        dayTradeCount++;
        inTrade = false;
      }
    }
    if (!inTrade && dayLossCount < maxLoss && dayTradeCount < maxTrades) {
      if (longCond[i]) { inTrade = true; tradeType = 1; entryPrice = ds.close[i]; entryIndex = i; }
      else if (shortCond[i]) { inTrade = true; tradeType = -1; entryPrice = ds.close[i]; entryIndex = i; }
    }
  }
  if (trades.length < 18) return null;
  const wins = trades.filter(t => t.profit > 0).length;
  const wr = (wins / trades.length) * 100;
  const net = trades.reduce((a, b) => a + b.profit, 0);
  let peak = 0, running = 0, maxDD = 0;
  for (const t of trades) {
    running += t.profit;
    if (running > peak) peak = running;
    if (peak - running > maxDD) maxDD = peak - running;
  }
  const calmar = maxDD > 0 ? net / maxDD : 999;
  const moR = { 7: 0, 8: 0, 9: 0, 10: 0 };
  for (const t of trades) moR[t.month] = (moR[t.month] || 0) + t.r;
  return { trades: trades.length, wins, wr, net, maxDD, calmar, moR, tradesList: trades };
}

const candidates = [];

for (const len of [30, 32, 34, 36, 40]) {
  const sma = dsXAU.calcSMA(len);
  const std = dsXAU.calcStDev(len, sma);
  for (const bMult of [2.0, 2.05, 2.1, 2.15, 2.2]) {
    for (const tp of [15, 16, 17, 18]) {
      for (const sl of [13.75, 14.5]) {
        if (tp < sl) continue;
        for (const off of [2.0, 3.0, 4.0]) {
          for (const sH of [12, 13]) {
            for (const eH of [18, 19, 20]) {
              for (const rsiLong of [48, 50, 52]) {
                const longCond = new Uint8Array(dsXAU.n);
                const shortCond = new Uint8Array(dsXAU.n);
                for (let i = 200; i < dsXAU.n; i++) {
                  const h = dsXAU.utcHour[i];
                  if (h >= sH && h <= eH) {
                    const upper = sma[i] + bMult * std[i];
                    const lower = sma[i] - bMult * std[i];
                    const bull = dsXAU.close[i] > ema200[i] + off;
                    const bear = dsXAU.close[i] < ema200[i] && ema50[i] < ema200[i];
                    const passCrash = dsXAU.close[i] >= (ema50[i] - 1.25 * atr14[i]);

                    if (passCrash && bull && dsXAU.low[i] <= lower && dsXAU.close[i] > dsXAU.open[i] && rsi14[i] < rsiLong) longCond[i] = 1;
                    if (bear && dsXAU.high[i] >= upper && dsXAU.close[i] < dsXAU.open[i] && rsi14[i] > (100 - rsiLong)) shortCond[i] = 1;
                  }
                }
                const res = simulate(dsXAU, longCond, shortCond, tp, sl, 2, 1);
                if (res && res.wr >= 80.0 && res.calmar >= 5.0) {
                  let overlap = 0;
                  for (const t of res.tradesList) if (s1Set.has(t.entryTime)) overlap++;
                  if (overlap <= 3) {
                    candidates.push({
                      len, bMult, tp, sl, off, sH, eH, rsiLong,
                      trades: res.trades, wins: res.wins, wr: res.wr.toFixed(1),
                      calmar: res.calmar.toFixed(1),
                      augR: res.moR[7].toFixed(2), sepR: res.moR[8].toFixed(2), octR: res.moR[9].toFixed(2), novR: res.moR[10].toFixed(2),
                      totR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2),
                      overlap
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

// Sort candidates: November >= 0 first, then total R
candidates.sort((a, b) => {
  const novA = parseFloat(a.novR) >= 0 ? 1 : 0;
  const novB = parseFloat(b.novR) >= 0 ? 1 : 0;
  if (novA !== novB) return novB - novA;
  return parseFloat(b.totR) - parseFloat(a.totR);
});

console.log('Total Low-Overlap Gold candidates found:', candidates.length);
candidates.slice(0, 15).forEach((c, i) => {
  console.log(`${i + 1}. Len:${c.len} Mult:${c.bMult} TP:${c.tp} SL:${c.sl} Off:${c.off} Sess:${c.sH}-${c.eH} RSI:${c.rsiLong} Trades:${c.trades} WR:${c.wr}% Calmar:${c.calmar} Overlap:${c.overlap} Aug:+${c.augR}R Sep:+${c.sepR}R Oct:+${c.octR}R Nov:+${c.novR}R Tot:+${c.totR}R`);
});

