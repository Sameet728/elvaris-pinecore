import fs from 'fs';
import { PineTS } from 'pinets';

const candles1h = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));
const candles15m = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));
const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

console.log('--- TESTING HIGH FREQUENCY FRONTIER FOR >10R/MONTH & >80% WIN RATE ---');

const makeCode = (tp, sl, blen, bmult, rsiL, beTrigger) => `//@version=6
strategy("HF_Frontier", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0)

atr = ta.atr(14)
ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${blen})
dev = ${bmult} * ta.stdev(close, ${blen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

longCond = close > ema200 and low <= lower and close > open and rsi < ${rsiL} and strategy.position_size == 0
shortCond = close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > ${100 - rsiL} and strategy.position_size == 0

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

async function testGrid(dataset, tfName, tfCode, configs) {
  console.log(`\nTesting ${tfName}... (${configs.length} configs)`);
  const matches = [];

  for (const c of configs) {
    try {
      const code = makeCode(c.tp, c.sl, c.blen, c.bmult, c.rsiL, c.beTrigger);
      const p = new PineTS(dataset, 'XAUUSD', tfCode);
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

      const totalR = net / c.sl;
      const monthly = {};
      trades.forEach(t => {
        const d = new Date(t.entry_time);
        const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        monthly[mKey] = (monthly[mKey] || 0) + (t.profit / c.sl);
      });
      const mKeys = Object.keys(monthly);
      const avgMoR = totalR / Math.max(mKeys.length, 1);

      if (wr >= 75.0 && calmar >= 4.0 && realRR >= 0.98) {
        console.log(`🎯 [${tfName}] TP:$${c.tp} (${c.tp*10}p) | SL:$${c.sl} (${c.sl*10}p) | BB(${c.blen},${c.bmult}) | Trades:${trades.length} | WR:${wr.toFixed(1)}% | Net:+$${net.toFixed(1)} (+${totalR.toFixed(1)}R) | ${avgMoR.toFixed(1)}R/mo | Calmar:${calmar.toFixed(2)} | Real R:R: 1:${realRR.toFixed(2)}`);
        matches.push({ ...c, tfName, tfCode, trades: trades.length, wins: wins.length, losses: losses.length, wr, net, dd, calmar, realRR, avgWin, avgLoss, totalR, avgMoR, monthly });
      }
    } catch (e) {}
  }

  matches.sort((a, b) => b.avgMoR - a.avgMoR);
  return matches;
}

async function main() {
  // 1. High-frequency 1H: TP $8 to $12 (80-120 pips), SL $6 to $10, BB 1.6 to 2.1
  const hf1hConfigs = [];
  for (const sl of [6.0, 8.0, 10.0]) {
    for (const tp of [sl * 1.0, sl * 1.25, sl * 1.5]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.6, 1.8, 2.0]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.4]) {
              hf1hConfigs.push({ tp, sl, blen, bmult, rsiL, beTrigger, minTrades: 50 });
            }
          }
        }
      }
    }
  }

  // 2. 15M: TP $6 to $10 (60-100 pips), SL $5 to $8, BB 1.8 to 2.2
  const m15Configs = [];
  for (const sl of [5.0, 6.0, 7.0]) {
    for (const tp of [sl * 1.0, sl * 1.25, sl * 1.5]) {
      for (const blen of [20, 25]) {
        for (const bmult of [1.8, 2.0, 2.2]) {
          for (const rsiL of [45, 50]) {
            for (const beTrigger of [0.0, 0.35, 0.45]) {
              m15Configs.push({ tp, sl, blen, bmult, rsiL, beTrigger, minTrades: 30 });
            }
          }
        }
      }
    }
  }

  const res1h = await testGrid(candles1h, '1H High Frequency', '60', hf1hConfigs);
  const res15m = await testGrid(candles15m, '15M Scalp Frontier', '15', m15Configs);

  console.log('\n=== TOP 3 HIGH-FREQUENCY 1H MATCHES ===');
  res1h.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1}: WR:${c.wr.toFixed(1)}% | Trades:${c.trades} | Net:+$${c.net.toFixed(1)} (+${c.totalR.toFixed(1)}R) | ${c.avgMoR.toFixed(1)}R/mo | Calmar:${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} | Params: TP=$${c.tp}, SL=$${c.sl}, BB(${c.blen},${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}`);
  });

  console.log('\n=== TOP 3 15M MATCHES ===');
  res15m.slice(0, 3).forEach((c, i) => {
    console.log(`#${i+1}: WR:${c.wr.toFixed(1)}% | Trades:${c.trades} | Net:+$${c.net.toFixed(1)} (+${c.totalR.toFixed(1)}R) | ${c.avgMoR.toFixed(1)}R/mo | Calmar:${c.calmar.toFixed(2)} | Real R:R: 1:${c.realRR.toFixed(2)} | Params: TP=$${c.tp}, SL=$${c.sl}, BB(${c.blen},${c.bmult}), RSI<${c.rsiL}, BE=${c.beTrigger}`);
  });
}

main().catch(console.error);
