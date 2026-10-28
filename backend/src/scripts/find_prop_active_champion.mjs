import fs from 'fs';
import { PineTS } from 'pinets';

const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const candles15m = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const candles30m = JSON.parse(fs.readFileSync('data/xauusd_30m_tv.json', 'utf8'));

// Universal clean strategy template with zero lookahead bias
const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger, emaTrendLen, useTrend) => `//@version=6
strategy("ActiveChampion", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

atr = ta.atr(14)
emaTrend = ta.ema(close, ${emaTrendLen})
emaFast = ta.ema(close, 50)
basis = ta.sma(close, ${blen})
dev = ${bmult} * ta.stdev(close, ${blen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

trendLong = ${useTrend} ? (close > emaTrend) : true
trendShort = ${useTrend} ? (close < emaTrend and emaFast < emaTrend) : true

longCond = trendLong and low <= lower and close > open and rsi < ${rsiL} and strategy.position_size == 0
shortCond = trendShort and high >= upper and close < open and rsi > (100 - rsiL) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na
var bool isBE = false

if longCond
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    isBE := false
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortCond
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
    isBE := false
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)

if strategy.position_size != 0
    dir = strategy.position_size > 0 ? 1 : -1
    currentGain = dir == 1 ? (high - ep) : (ep - low)

    ${beTrigger > 0 ? `
    if not isBE and currentGain >= ${sl} * ${beTrigger}
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true
    ` : ''}

    exitComment = isBE ? "BREAKEVEN" : "SL HIT"
    strategy.exit(dir == 1 ? "Exit Long" : "Exit Short", dir == 1 ? "Long" : "Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss=exitComment)
`;

async function testTf(candles, tfName, tfCode, configs) {
  console.log(`\nEvaluating ${tfName}... (${configs.length} configs)`);
  const list = [];

  for (const c of configs) {
    try {
      const code = makeCode(c.tp, c.sl, c.blen, c.bmult, c.rsiL, c.beTrigger, c.emaTrendLen, c.useTrend);
      const p = new PineTS(candles, 'XAUUSD', tfCode);
      await p.ready();
      const res = await p.run(code);
      const s = res.strategy;
      const trades = s.closedtrades || [];

      if (trades.length < c.minTrades) continue;

      const wins = trades.filter(t => t.profit > 0);
      const losses = trades.filter(t => t.profit <= 0);
      const wr = (wins.length / trades.length) * 100;
      const net = s.netprofit;
      const dd = s.max_drawdown || 1;
      const calmar = net / dd;

      const avgWin = wins.reduce((acc, t) => acc + t.profit, 0) / (wins.length || 1);
      const avgLoss = losses.length ? Math.abs(losses.reduce((acc, t) => acc + t.profit, 0) / losses.length) : 1;
      const realRR = avgWin / avgLoss;

      // Monthly breakdown
      const monthly = {};
      trades.forEach(t => {
        const d = new Date(t.entry_time);
        const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        monthly[mKey] = (monthly[mKey] || 0) + (t.profit / c.sl);
      });
      const mKeys = Object.keys(monthly);
      const totalR = net / c.sl;
      const avgMonthlyR = totalR / Math.max(mKeys.length, 1);

      list.push({
        tfName, tfCode, ...c,
        trades: trades.length, wins: wins.length, losses: losses.length,
        wr, net, dd, calmar, realRR, avgWin, avgLoss, totalR, avgMonthlyR, monthly
      });
    } catch (e) {}
  }

  // Filter and sort
  const passed = list.filter(x => x.wr >= 70.0 && x.realRR >= 0.95 && x.calmar >= 3.5);
  passed.sort((a, b) => (b.avgMonthlyR * b.wr) - (a.avgMonthlyR * a.wr));
  return { passed, all: list };
}

async function main() {
  // 5M Search: TP $4 to $8 (40-80 pips), SL $3 to $6, higher trade count (min 30 trades in ~1 month)
  const configs5m = [];
  for (const sl of [3.0, 4.0, 5.0]) {
    for (const tp of [sl * 1.0, sl * 1.25, sl * 1.5]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.8, 2.0, 2.2]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.4]) {
              for (const useTrend of [true, false]) {
                configs5m.push({ tp, sl, blen, bmult, rsiL, beTrigger, emaTrendLen: 200, useTrend, minTrades: 25 });
              }
            }
          }
        }
      }
    }
  }

  // 15M Search: TP $6 to $12 (60-120 pips), SL $5 to $8 (min 30 trades across 3 months)
  const configs15m = [];
  for (const sl of [5.0, 6.0, 7.0]) {
    for (const tp of [sl * 1.0, sl * 1.25, sl * 1.5]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.8, 2.0, 2.2]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.4]) {
              for (const useTrend of [true, false]) {
                configs15m.push({ tp, sl, blen, bmult, rsiL, beTrigger, emaTrendLen: 100, useTrend, minTrades: 30 });
              }
            }
          }
        }
      }
    }
  }

  // 30M Search: TP $10 to $16 (100-160 pips), SL $8 to $12 (min 30 trades across 4.5 months)
  const configs30m = [];
  for (const sl of [8.0, 10.0]) {
    for (const tp of [sl * 1.0, sl * 1.25, sl * 1.5]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.8, 2.0, 2.2]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.4]) {
              for (const useTrend of [true, false]) {
                configs30m.push({ tp, sl, blen, bmult, rsiL, beTrigger, emaTrendLen: 200, useTrend, minTrades: 25 });
              }
            }
          }
        }
      }
    }
  }

  const res5m = await testTf(candles5m, '5M', '5', configs5m);
  const res15m = await testTf(candles15m, '15M', '15', configs15m);
  const res30m = await testTf(candles30m, '30M', '30', configs30m);

  console.log(`\n=== 5M CANDIDATES FOUND: ${res5m.passed.length} ===`);
  res5m.passed.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1} [5M] Trades:${c.trades} | WR:${c.wr.toFixed(1)}% | Net:+$${c.net.toFixed(1)} (+${c.totalR.toFixed(1)}R) | ${c.avgMonthlyR.toFixed(1)}R/mo | Calmar:${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} | TP:$${c.tp} SL:$${c.sl} BB(${c.blen},${c.bmult}) Trend:${c.useTrend} BE:${c.beTrigger}`);
    console.log('Monthly R:', c.monthly);
  });

  console.log(`\n=== 15M CANDIDATES FOUND: ${res15m.passed.length} ===`);
  res15m.passed.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1} [15M] Trades:${c.trades} | WR:${c.wr.toFixed(1)}% | Net:+$${c.net.toFixed(1)} (+${c.totalR.toFixed(1)}R) | ${c.avgMonthlyR.toFixed(1)}R/mo | Calmar:${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} | TP:$${c.tp} SL:$${c.sl} BB(${c.blen},${c.bmult}) Trend:${c.useTrend} BE:${c.beTrigger}`);
    console.log('Monthly R:', c.monthly);
  });

  console.log(`\n=== 30M CANDIDATES FOUND: ${res30m.passed.length} ===`);
  res30m.passed.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1} [30M] Trades:${c.trades} | WR:${c.wr.toFixed(1)}% | Net:+$${c.net.toFixed(1)} (+${c.totalR.toFixed(1)}R) | ${c.avgMonthlyR.toFixed(1)}R/mo | Calmar:${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} | TP:$${c.tp} SL:$${c.sl} BB(${c.blen},${c.bmult}) Trend:${c.useTrend} BE:${c.beTrigger}`);
    console.log('Monthly R:', c.monthly);
  });

  fs.writeFileSync('backend/src/scripts/active_champions_results.json', JSON.stringify({
    top5m: res5m.passed.slice(0, 5),
    top15m: res15m.passed.slice(0, 5),
    top30m: res30m.passed.slice(0, 5)
  }, null, 2));
}

main().catch(console.error);
