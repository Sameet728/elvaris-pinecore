import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testBEAndFineTP() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const configs = [];

  // Fine TP variations: 18.0, 18.5, 19.0, 19.5, 20.0
  // Fine SL variations: 13.0, 13.5, 14.0
  // Band length: 28, 30, 32
  // Band mult: 2.1, 2.2, 2.3, 2.4
  // RSI filter: 50, 52, 54
  for (const tp of [18.0, 18.5, 19.0, 19.5, 20.0]) {
    for (const sl of [13.0, 13.5, 14.0]) {
      for (const bLen of [28, 30, 32]) {
        for (const bMult of [2.1, 2.2, 2.3]) {
          for (const rsiF of [50, 52]) {
            configs.push({ tp, sl, bLen, bMult, rsiF });
          }
        }
      }
    }
  }

  console.log(`Testing ${configs.length} fine-tuned TP/SL/Band variations...`);

  const qualifiers = [];

  for (const c of configs) {
    const code = `//@version=5
strategy("FineTune", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${c.bLen})
dev = ${c.bMult} * ta.stdev(close, ${c.bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= 1 and hour <= 20)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < ${c.rsiF} and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${c.rsiF}) and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${c.sl}
    tpP := ep + ${c.tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${c.sl}
    tpP := ep - ${c.tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

    try {
      const res = await p.run(code);
      const trades = res.strategy.closedtrades || [];
      if (trades.length < 25) continue;

      const wins = trades.filter(t => t.profit > 0);
      const wr = (wins.length / trades.length) * 100;

      const mProfit = {};
      const mTrades = {};
      const mWins = {};
      for (const t of trades) {
        const d = new Date(t.entry_time);
        const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        mProfit[m] = (mProfit[m] || 0) + t.profit;
        mTrades[m] = (mTrades[m] || 0) + 1;
        if (t.profit > 0) mWins[m] = (mWins[m] || 0) + 1;
      }

      const rAug = (mProfit['2026-08'] || 0) / c.sl;
      const rSep = (mProfit['2026-09'] || 0) / c.sl;
      const rOct = (mProfit['2026-10'] || 0) / c.sl;

      const netR = res.strategy.netprofit / c.sl;
      const maxDD_R = (res.strategy.max_drawdown || 1) / c.sl;
      const calmar = maxDD_R > 0 ? (netR / maxDD_R) : 0;

      // Condition: Aug >= 10, Sep >= 10, Oct >= 8, WR >= 80%
      // Also log if close
      if (rAug >= 10.0 && rSep >= 10.0 && rOct >= 8.0 && wr >= 80.0) {
        qualifiers.push({ c, trades: trades.length, wins: wins.length, wr, netR, maxDD_R, calmar, rAug, rSep, rOct });
        console.log(`🏆 QUALIFIER! TP: $${c.tp} / SL: $${c.sl} | BB(${c.bLen}, ${c.bMult}) | RSI<${c.rsiF} -> Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Aug: +${rAug.toFixed(1)}R | Sep: +${rSep.toFixed(1)}R | Oct: +${rOct.toFixed(1)}R | Calmar: ${calmar.toFixed(1)}`);
      } else if (rAug >= 9.8 && rSep >= 9.8 && rOct >= 7.8 && wr >= 76.0) {
        console.log(`   NEAR: TP: $${c.tp} / SL: $${c.sl} | BB(${c.bLen}, ${c.bMult}) | RSI<${c.rsiF} -> Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Aug: +${rAug.toFixed(1)}R | Sep: +${rSep.toFixed(1)}R | Oct: +${rOct.toFixed(1)}R | Calmar: ${calmar.toFixed(1)}`);
      }
    } catch (e) {
      // ignore
    }
  }

  console.log(`\nCompleted. Qualifiers found: ${qualifiers.length}`);
}

testBEAndFineTP().catch(console.error);
