const fs = require('fs');
const { dsSPX, dsEUR } = require('./sim_framework');

console.log('Sweeping SPX500 and EURUSD 15M...');

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
        trades.push({ entryIndex, exitIndex: i, month: ds.utcMonth[entryIndex], profit, r: profit / sl });
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
  if (trades.length < 12) return null;
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
  return { trades: trades.length, wins, wr, net, maxDD, calmar, moR };
}

// SPX500 Sweep
const spxEma50 = dsSPX.calcEMA(50);
const spxEma200 = dsSPX.calcEMA(200);
const spxRsi14 = dsSPX.calcRSI(14);
const spxAtr14 = dsSPX.atr14;

const spxMatches = [];
for (const len of [14, 20, 28]) {
  const sma = dsSPX.calcSMA(len);
  const std = dsSPX.calcStDev(len, sma);
  for (const mult of [1.8, 2.0, 2.2, 2.4, 2.6]) {
    for (const tp of [12, 15, 18, 20, 25]) {
      for (const sl of [10, 12, 15, 18, 22]) {
        if (tp < sl) continue;
        for (const sH of [13, 14]) {
          for (const eH of [18, 20]) {
            const longCond = new Uint8Array(dsSPX.n);
            const shortCond = new Uint8Array(dsSPX.n);
            for (let i = 200; i < dsSPX.n; i++) {
              const h = dsSPX.utcHour[i];
              if (h >= sH && h <= eH) {
                const upper = sma[i] + mult * std[i];
                const lower = sma[i] - mult * std[i];
                if (dsSPX.close[i] > spxEma200[i] && dsSPX.low[i] <= lower && dsSPX.close[i] > dsSPX.open[i] && spxRsi14[i] < 55) longCond[i] = 1;
                if (dsSPX.close[i] < spxEma200[i] && dsSPX.high[i] >= upper && dsSPX.close[i] < dsSPX.open[i] && spxRsi14[i] > 45) shortCond[i] = 1;
              }
            }
            const res = simulate(dsSPX, longCond, shortCond, tp, sl, 2, 1);
            if (res && res.wr >= 78.0 && res.calmar >= 4.0) {
              spxMatches.push({
                len, mult, tp, sl, sH, eH,
                trades: res.trades, wins: res.wins, wr: res.wr.toFixed(1),
                calmar: res.calmar.toFixed(1),
                augR: res.moR[7].toFixed(2), sepR: res.moR[8].toFixed(2), octR: res.moR[9].toFixed(2), novR: res.moR[10].toFixed(2),
                totR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2)
              });
            }
          }
        }
      }
    }
  }
}

spxMatches.sort((a, b) => parseFloat(b.wr) - parseFloat(a.wr) || parseFloat(b.totR) - parseFloat(a.totR));
console.log('SPX500 matches:', spxMatches.length);
spxMatches.slice(0, 10).forEach((m, i) => {
  console.log(`${i + 1}. [SPX500] Len:${m.len} Mult:${m.mult} TP:${m.tp} SL:${m.sl} Trades:${m.trades} WR:${m.wr}% Calmar:${m.calmar} Aug:+${m.augR}R Sep:+${m.sepR}R Oct:+${m.octR}R Nov:+${m.novR}R Tot:+${m.totR}R`);
});

// EURUSD Sweep
const eurEma200 = dsEUR.calcEMA(200);
const eurRsi14 = dsEUR.calcRSI(14);
const eurAtr14 = dsEUR.atr14;

const eurMatches = [];
for (const len of [14, 20, 28]) {
  const sma = dsEUR.calcSMA(len);
  const std = dsEUR.calcStDev(len, sma);
  for (const mult of [2.0, 2.2, 2.4, 2.6]) {
    for (const tp of [0.0010, 0.0012, 0.0015, 0.0018]) {
      for (const sl of [0.0010, 0.0012, 0.0015]) {
        if (tp < sl) continue;
        for (const sH of [7, 8]) {
          for (const eH of [16, 17]) {
            const longCond = new Uint8Array(dsEUR.n);
            const shortCond = new Uint8Array(dsEUR.n);
            for (let i = 200; i < dsEUR.n; i++) {
              const h = dsEUR.utcHour[i];
              if (h >= sH && h <= eH) {
                const upper = sma[i] + mult * std[i];
                const lower = sma[i] - mult * std[i];
                if (dsEUR.close[i] > eurEma200[i] && dsEUR.low[i] <= lower && dsEUR.close[i] > dsEUR.open[i] && eurRsi14[i] < 55) longCond[i] = 1;
                if (dsEUR.close[i] < eurEma200[i] && dsEUR.high[i] >= upper && dsEUR.close[i] < dsEUR.open[i] && eurRsi14[i] > 45) shortCond[i] = 1;
              }
            }
            const res = simulate(dsEUR, longCond, shortCond, tp, sl, 2, 1);
            if (res && res.wr >= 78.0 && res.calmar >= 4.0) {
              eurMatches.push({
                len, mult, tp, sl, sH, eH,
                trades: res.trades, wins: res.wins, wr: res.wr.toFixed(1),
                calmar: res.calmar.toFixed(1),
                augR: res.moR[7].toFixed(2), sepR: res.moR[8].toFixed(2), octR: res.moR[9].toFixed(2), novR: res.moR[10].toFixed(2),
                totR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2)
              });
            }
          }
        }
      }
    }
  }
}

eurMatches.sort((a, b) => parseFloat(b.wr) - parseFloat(a.wr) || parseFloat(b.totR) - parseFloat(a.totR));
console.log('EURUSD matches:', eurMatches.length);
eurMatches.slice(0, 10).forEach((m, i) => {
  console.log(`${i + 1}. [EURUSD] Len:${m.len} Mult:${m.mult} TP:${m.tp} SL:${m.sl} Trades:${m.trades} WR:${m.wr}% Calmar:${m.calmar} Aug:+${m.augR}R Sep:+${m.sepR}R Oct:+${m.octR}R Nov:+${m.novR}R Tot:+${m.totR}R`);
});

