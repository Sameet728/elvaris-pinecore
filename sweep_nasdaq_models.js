const fs = require('fs');
const { dsNAS } = require('./sim_framework');

console.log('Sweeping NAS100 15M for High-Frequency 80% WR strategies...');

const ema9 = dsNAS.calcEMA(9);
const ema21 = dsNAS.calcEMA(21);
const ema50 = dsNAS.calcEMA(50);
const ema100 = dsNAS.calcEMA(100);
const ema200 = dsNAS.calcEMA(200);
const rsi14 = dsNAS.calcRSI(14);
const atr14 = dsNAS.atr14;

// Cache SMAs and StDevs
const sma14 = dsNAS.calcSMA(14);
const std14 = dsNAS.calcStDev(14, sma14);
const sma20 = dsNAS.calcSMA(20);
const std20 = dsNAS.calcStDev(20, sma20);
const sma34 = dsNAS.calcSMA(34);
const std34 = dsNAS.calcStDev(34, sma34);

const matches = [];

// Model 1: Bollinger Bands on NAS100
for (const smaObj of [{ len: 14, sma: sma14, std: std14 }, { len: 20, sma: sma20, std: std20 }, { len: 34, sma: sma34, std: std34 }]) {
  for (const bMult of [1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5]) {
    for (const tp of [40, 50, 60, 70, 80, 100]) {
      for (const sl of [35, 45, 55, 65, 75, 90]) {
        if (tp < sl) continue;
        for (const sH of [7, 8, 12, 13, 14]) {
          for (const eH of [17, 19, 21]) {
            const longCond = new Uint8Array(dsNAS.n);
            const shortCond = new Uint8Array(dsNAS.n);

            for (let i = 200; i < dsNAS.n; i++) {
              const h = dsNAS.utcHour[i];
              if (h >= sH && h <= eH) {
                const upper = smaObj.sma[i] + bMult * smaObj.std[i];
                const lower = smaObj.sma[i] - bMult * smaObj.std[i];
                const bull = dsNAS.close[i] > ema200[i] + 10;
                const bear = dsNAS.close[i] < ema200[i] - 10 && ema50[i] < ema200[i];

                if (bull && dsNAS.low[i] <= lower && dsNAS.close[i] > dsNAS.open[i] && rsi14[i] < 55) longCond[i] = 1;
                if (bear && dsNAS.high[i] >= upper && dsNAS.close[i] < dsNAS.open[i] && rsi14[i] > 45) shortCond[i] = 1;
              }
            }

            const res = simulate(dsNAS, longCond, shortCond, tp, sl, 2, 1);
            if (res && res.wr >= 78.0 && res.trades >= 15 && res.calmar >= 4.0) {
              matches.push({
                model: `NAS100 BB (${smaObj.len} SMA, ${bMult} sigma)`,
                sess: `${sH}-${eH}`, tp, sl,
                trades: res.trades, wins: res.wins, wr: res.wr.toFixed(1),
                calmar: res.calmar.toFixed(1), net: res.net.toFixed(1),
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

// Model 2: Keltner on NAS100
for (const kMult of [1.6, 1.8, 2.0, 2.2, 2.4, 2.6]) {
  for (const tp of [40, 50, 60, 70, 80, 100]) {
    for (const sl of [35, 45, 55, 65, 75, 90]) {
      if (tp < sl) continue;
      for (const sH of [7, 8, 12, 13, 14]) {
        for (const eH of [17, 19, 21]) {
          const longCond = new Uint8Array(dsNAS.n);
          const shortCond = new Uint8Array(dsNAS.n);

          for (let i = 200; i < dsNAS.n; i++) {
            const h = dsNAS.utcHour[i];
            if (h >= sH && h <= eH) {
              const upper = ema21[i] + kMult * atr14[i];
              const lower = ema21[i] - kMult * atr14[i];
              const bull = dsNAS.close[i] > ema200[i] + 10;
              const bear = dsNAS.close[i] < ema200[i] - 10 && ema50[i] < ema200[i];

              if (bull && dsNAS.low[i] <= lower && dsNAS.close[i] > dsNAS.open[i] && rsi14[i] < 55) longCond[i] = 1;
              if (bear && dsNAS.high[i] >= upper && dsNAS.close[i] < dsNAS.open[i] && rsi14[i] > 45) shortCond[i] = 1;
            }
          }

          const res = simulate(dsNAS, longCond, shortCond, tp, sl, 2, 1);
          if (res && res.wr >= 78.0 && res.trades >= 15 && res.calmar >= 4.0) {
            matches.push({
              model: `NAS100 Keltner (${kMult}x ATR)`,
              sess: `${sH}-${eH}`, tp, sl,
              trades: res.trades, wins: res.wins, wr: res.wr.toFixed(1),
              calmar: res.calmar.toFixed(1), net: res.net.toFixed(1),
              augR: res.moR[7].toFixed(2), sepR: res.moR[8].toFixed(2), octR: res.moR[9].toFixed(2), novR: res.moR[10].toFixed(2),
              totR: (res.moR[7] + res.moR[8] + res.moR[9] + res.moR[10]).toFixed(2)
            });
          }
        }
      }
    }
  }
}

matches.sort((a, b) => parseFloat(b.wr) - parseFloat(a.wr) || parseFloat(b.totR) - parseFloat(a.totR));
console.log('Total NAS100 matches:', matches.length);
matches.slice(0, 15).forEach((m, i) => {
  console.log(`${i + 1}. [${m.model}] Sess:${m.sess} TP:${m.tp} SL:${m.sl} Trades:${m.trades} WR:${m.wr}% Calmar:${m.calmar} Aug:+${m.augR}R Sep:+${m.sepR}R Oct:+${m.octR}R Nov:+${m.novR}R Tot:+${m.totR}R`);
});

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
  if (trades.length < 15) return null;
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

