import fs from 'fs';

// Load all datasets
const datasets = {
  btcDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_daily.json', 'utf8')),
  btc4H: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_4h.json', 'utf8')),
  btc1H: JSON.parse(fs.readFileSync('quant_seasonality/data/btcusdt_1h.json', 'utf8')),
  ethDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_daily.json', 'utf8')),
  eth4H: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_4h.json', 'utf8')),
  eth1H: JSON.parse(fs.readFileSync('quant_seasonality/data/ethusdt_1h.json', 'utf8')),
  goldDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_daily.json', 'utf8')),
  gold4H: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_4h.json', 'utf8')),
  gold1H: JSON.parse(fs.readFileSync('quant_seasonality/data/xauusd_1h.json', 'utf8')),
  qqqDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_daily.json', 'utf8')),
  qqq4H: JSON.parse(fs.readFileSync('quant_seasonality/data/qqq_4h.json', 'utf8')),
  spyDaily: JSON.parse(fs.readFileSync('quant_seasonality/data/spy_daily.json', 'utf8')),
  spy4H: JSON.parse(fs.readFileSync('quant_seasonality/data/spy_4h.json', 'utf8'))
};

console.log('========================================================================');
console.log('   MISSION /GOAL: SEARCH FOR WIN RATE >= 75% AND REWARD >= RISK (RR >= 1.0) ');
console.log('   TESTING MEAN REVERSION, EXTREME PANIC DIPS, SEASONAL SURGES, CONNORS RSI');
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

function computeSMA(arr, period) {
  const n = arr.length;
  const res = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < period; i++) s += arr[i];
  res[period - 1] = s / period;
  for (let i = period; i < n; i++) {
    s += arr[i] - arr[i - period];
    res[i] = s / period;
  }
  return res;
}

function computeATR(highs, lows, closes, period = 14) {
  const n = highs.length;
  const tr = new Float64Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  const atr = new Float64Array(n);
  let s = 0;
  for (let i = 0; i < period; i++) s += tr[i];
  atr[period - 1] = s / period;
  for (let i = period; i < n; i++) atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  return atr;
}

function computeRSI(closes, period = 2) {
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

function evaluateTradeList(trades, years, initialEquity = 10000) {
  if (trades.length < 20) return null;
  let eq = initialEquity, peak = initialEquity, maxDD = 0;
  let wins = 0, losses = 0;
  let grossWin = 0, grossLoss = 0;
  const winPcts = [], lossPcts = [];

  for (const t of trades) {
    const r = t.retPct;
    if (r > 0) {
      wins++;
      winPcts.push(r);
      grossWin += (eq * (r / 100));
    } else if (r < 0) {
      losses++;
      lossPcts.push(Math.abs(r));
      grossLoss += Math.abs(eq * (r / 100));
    }
    eq = eq * (1 + r / 100);
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const wr = (wins / trades.length) * 100;
  const avgWin = winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0;
  const avgLoss = lossPcts.length > 0 ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : 0;
  const realizedRR = avgLoss > 0 ? avgWin / avgLoss : avgWin;

  const cagr = (Math.pow(eq / initialEquity, 1 / years) - 1) * 100;
  const calmar = maxDD > 0 ? cagr / maxDD : cagr;
  const pf = grossLoss > 0 ? grossWin / grossLoss : 99;

  return {
    tradesCount: trades.length,
    wins,
    losses,
    wr,
    avgWin,
    avgLoss,
    realizedRR,
    totalRet: ((eq - initialEquity) / initialEquity) * 100,
    cagr,
    maxDD,
    calmar,
    pf
  };
}

const discovered = [];

// ============================================================================
// 1. LARRY CONNORS 2-PERIOD RSI / 3-PERIOD RSI EXTREME CAPITULATION DIPS
// ============================================================================
function testExtremeRsiDips(bars, symbol, label, tf) {
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const times = bars.map(b => b.time);

  const sma5 = computeSMA(closes, 5);
  const sma10 = computeSMA(closes, 10);
  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);

  const rsi2 = computeRSI(closes, 2);
  const rsi3 = computeRSI(closes, 3);
  const rsi4 = computeRSI(closes, 4);

  // We test TP >= SL (Reward >= Risk: 1.0, 1.25, 1.5, 2.0)
  const brackets = [
    { tpMult: 1.0, slMult: 1.0, plannedRR: '1.00 : 1' },
    { tpMult: 1.25, slMult: 1.0, plannedRR: '1.25 : 1' },
    { tpMult: 1.5, slMult: 1.0, plannedRR: '1.50 : 1' },
    { tpMult: 1.5, slMult: 1.25, plannedRR: '1.20 : 1' },
    { tpMult: 2.0, slMult: 1.5, plannedRR: '1.33 : 1' },
    { tpMult: 2.0, slMult: 1.0, plannedRR: '2.00 : 1' },
    { tpMult: 2.5, slMult: 1.5, plannedRR: '1.67 : 1' }
  ];

  for (const rsiArr of [{ rsi: rsi2, len: 2 }, { rsi: rsi3, len: 3 }, { rsi: rsi4, len: 4 }]) {
    for (const rsiOversold of [5, 8, 10, 12, 15, 20]) {
      for (const b of brackets) {
        for (const exitRule of ['sma5', 'sma10', 'bracket_only']) {
          for (const maxHold of (tf === '1D' ? [3, 5, 7] : [6, 12, 18])) {
            const trades = [];
            let inTrade = false;
            let entryPrice = 0, slPrice = 0, tpPrice = 0, entryIdx = 0;

            for (let i = 200; i < n; i++) {
              if (inTrade) {
                const barsHeld = i - entryIdx;
                let exited = false, exitPrice = 0;

                // Stop or Take Profit hit
                if (highs[i] >= tpPrice && lows[i] <= slPrice) {
                  exitPrice = opens[i] >= tpPrice ? tpPrice : slPrice;
                  exited = true;
                } else if (highs[i] >= tpPrice) {
                  exitPrice = tpPrice;
                  exited = true;
                } else if (lows[i] <= slPrice) {
                  exitPrice = slPrice;
                  exited = true;
                } else if (exitRule === 'sma5' && closes[i] > sma5[i]) {
                  exitPrice = closes[i];
                  exited = true;
                } else if (exitRule === 'sma10' && closes[i] > sma10[i]) {
                  exitPrice = closes[i];
                  exited = true;
                } else if (barsHeld >= maxHold) {
                  exitPrice = closes[i];
                  exited = true;
                }

                if (exited) {
                  trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                  inTrade = false;
                }
              }

              if (!inTrade) {
                // Must be in strong secular bull trend
                if (closes[i] <= ema200[i]) continue;
                // Extreme oversold capitulation dip
                if (rsiArr.rsi[i] <= rsiOversold) {
                  inTrade = true;
                  entryPrice = closes[i];
                  entryIdx = i;
                  slPrice = entryPrice - b.slMult * atr14[i];
                  tpPrice = entryPrice + b.tpMult * atr14[i];
                }
              }
            }

            const stats = evaluateTradeList(trades, years);

            // STRICT TARGETS:
            // 1. Win Rate >= 74.0%
            // 2. Realized RR >= 1.0 : 1 (Average Win >= Average Loss)
            // 3. CAGR >= 25.0%
            if (stats && stats.wr >= 74.0 && stats.realizedRR >= 1.0 && stats.cagr >= 25.0) {
              discovered.push({
                name: `${label} ${tf} Connors Dip (RSI${rsiArr.len} < ${rsiOversold})`,
                asset: symbol,
                timeframe: tf,
                sampleYears: years.toFixed(1) + ' Years',
                plannedRR: b.plannedRR,
                setup: `Price > 200 EMA | RSI(${rsiArr.len}) <= ${rsiOversold} | Exit: ${exitRule.toUpperCase()}`,
                riskRules: `Target: +${b.tpMult} ATR | Stop: -${b.slMult} ATR | Max Hold: ${maxHold} bars`,
                ...stats
              });
            }
          }
        }
      }
    }
  }
}

console.log('Testing RSI Capitulation on BTC Daily...');
testExtremeRsiDips(datasets.btcDaily, 'BTCUSDT', 'Bitcoin', '1D');
console.log('Testing RSI Capitulation on ETH Daily...');
testExtremeRsiDips(datasets.ethDaily, 'ETHUSDT', 'Ethereum', '1D');
console.log('Testing RSI Capitulation on BTC 4H...');
testExtremeRsiDips(datasets.btc4H, 'BTCUSDT', 'Bitcoin', '4H');
console.log('Testing RSI Capitulation on ETH 4H...');
testExtremeRsiDips(datasets.eth4H, 'ETHUSDT', 'Ethereum', '4H');
console.log('Testing RSI Capitulation on Gold Daily...');
testExtremeRsiDips(datasets.goldDaily, 'XAUUSD', 'Gold', '1D');
console.log('Testing RSI Capitulation on QQQ Daily...');
testExtremeRsiDips(datasets.qqqDaily, 'QQQ', 'Nasdaq QQQ', '1D');

// ============================================================================
// 2. CONSECUTIVE DOWN DAYS IN SECULAR BULL TRENDS
// ============================================================================
function testConsecutiveDownDays(bars, symbol, label, tf) {
  const n = bars.length;
  const years = (bars[n - 1].time - bars[0].time) / (1000 * 60 * 60 * 24 * 365.25);
  const closes = bars.map(b => b.close);
  const opens = bars.map(b => b.open);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  const ema200 = computeEMA(closes, 200);
  const atr14 = computeATR(highs, lows, closes, 14);

  for (const conDays of [3, 4, 5]) {
    for (const tpMult of [1.0, 1.25, 1.5, 2.0]) {
      for (const slMult of [1.0, 1.25, 1.5]) {
        if (tpMult < slMult) continue; // Reward must be >= Risk
        for (const maxHold of [2, 3, 5]) {
          const trades = [];
          let inTrade = false;
          let entryPrice = 0, slPrice = 0, tpPrice = 0, entryIdx = 0;

          for (let i = 200; i < n; i++) {
            if (inTrade) {
              const barsHeld = i - entryIdx;
              let exited = false, exitPrice = 0;

              if (highs[i] >= tpPrice && lows[i] <= slPrice) {
                exitPrice = opens[i] >= tpPrice ? tpPrice : slPrice;
                exited = true;
              } else if (highs[i] >= tpPrice) {
                exitPrice = tpPrice;
                exited = true;
              } else if (lows[i] <= slPrice) {
                exitPrice = slPrice;
                exited = true;
              } else if (barsHeld >= maxHold) {
                exitPrice = closes[i];
                exited = true;
              }

              if (exited) {
                trades.push({ retPct: ((exitPrice - entryPrice) / entryPrice) * 100 });
                inTrade = false;
              }
            }

            if (!inTrade && closes[i] > ema200[i]) {
              // Check if previous conDays were all consecutive red bars
              let allRed = true;
              for (let k = 0; k < conDays; k++) {
                if (closes[i - k] >= opens[i - k]) {
                  allRed = false;
                  break;
                }
              }

              if (allRed) {
                inTrade = true;
                entryPrice = closes[i];
                entryIdx = i;
                slPrice = entryPrice - slMult * atr14[i];
                tpPrice = entryPrice + tpMult * atr14[i];
              }
            }
          }

          const stats = evaluateTradeList(trades, years);
          if (stats && stats.wr >= 74.0 && stats.realizedRR >= 1.0 && stats.cagr >= 25.0) {
            discovered.push({
              name: `${label} ${tf} Consecutive ${conDays} Dips`,
              asset: symbol,
              timeframe: tf,
              sampleYears: years.toFixed(1) + ' Years',
              plannedRR: `${(tpMult / slMult).toFixed(2)} : 1`,
              setup: `Price > 200 EMA | ${conDays} Consecutive Down Bars | Dip Buy`,
              riskRules: `Target: +${tpMult} ATR | Stop: -${slMult} ATR | Max Hold: ${maxHold} bars`,
              ...stats
            });
          }
        }
      }
    }
  }
}

console.log('Testing Consecutive Dips on BTC Daily...');
testConsecutiveDownDays(datasets.btcDaily, 'BTCUSDT', 'Bitcoin', '1D');
console.log('Testing Consecutive Dips on ETH Daily...');
testConsecutiveDownDays(datasets.ethDaily, 'ETHUSDT', 'Ethereum', '1D');
console.log('Testing Consecutive Dips on Gold Daily...');
testConsecutiveDownDays(datasets.goldDaily, 'XAUUSD', 'Gold', '1D');
console.log('Testing Consecutive Dips on QQQ Daily...');
testConsecutiveDownDays(datasets.qqqDaily, 'QQQ', 'Nasdaq QQQ', '1D');

console.log(`\nTotal Discovered Setups Meeting WR >= 74% AND RR >= 1.0: ${discovered.length}`);

// Sort by Win Rate and Calmar
discovered.sort((a, b) => (b.wr * b.calmar) - (a.wr * a.calmar));

discovered.slice(0, 10).forEach((s, idx) => {
  console.log(`\n#${idx + 1}: ${s.name} [${s.asset} | ${s.timeframe}]`);
  console.log(`    Win Rate: ${s.wr.toFixed(2)}% | Realized RR: ${s.realizedRR.toFixed(2)} : 1 (Planned: ${s.plannedRR})`);
  console.log(`    Yearly CAGR: +${s.cagr.toFixed(2)}%/yr | Max DD: ${s.maxDD.toFixed(2)}% | Calmar: ${s.calmar.toFixed(2)} | PF: ${s.pf.toFixed(2)}`);
  console.log(`    Total Trades: ${s.tradesCount} | Sample: ${s.sampleYears} | Total Return: +${s.totalRet.toFixed(1)}%`);
  console.log(`    Setup: ${s.setup}`);
  console.log(`    Risk Rules: ${s.riskRules}`);
});

fs.writeFileSync('quant_seasonality/data/strict_75wr_rr_ge_1_results.json', JSON.stringify(discovered, null, 2));
