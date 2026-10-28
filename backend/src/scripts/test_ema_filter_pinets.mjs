import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testEMAFilter() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const tests = [
    { name: 'Baseline 51 trades', longFilter: 'true', shortFilter: 'true' },
    { name: 'Short: close < ema50', longFilter: 'true', shortFilter: 'close < ema50' },
    { name: 'Short: close < ema50 + 2.0', longFilter: 'true', shortFilter: 'close < (ema50 + 2.0)' },
    { name: 'Short: close < ema50 + 4.0', longFilter: 'true', shortFilter: 'close < (ema50 + 4.0)' },
    { name: 'Long: close > ema200 + 4.0', longFilter: 'close > (ema200 + 4.0)', shortFilter: 'true' },
    { name: 'Long: close > ema200 + 5.0', longFilter: 'close > (ema200 + 5.0)', shortFilter: 'true' },
    { name: 'Long: close > ema200 + 4.0 & Short: close < ema50 + 2.0', longFilter: 'close > (ema200 + 4.0)', shortFilter: 'close < (ema50 + 2.0)' },
    { name: 'Long: close > ema200 + 3.0 & Short: close < ema50 + 3.0', longFilter: 'close > (ema200 + 3.0)', shortFilter: 'close < (ema50 + 3.0)' },
    { name: 'Long: close > ema200 + 5.0 & Short: close < ema50', longFilter: 'close > (ema200 + 5.0)', shortFilter: 'close < ema50' }
  ];

  for (const t of tests) {
    const code = `//@version=5
strategy("TestFilter", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 28)
dev = 2.1 * ta.stdev(close, 28)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= 1 and hour <= 20)

longSig = inActiveSession and close > ema200 and ${t.longFilter} and low <= lower and close > open and rsi < 52 and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and ${t.shortFilter} and high >= upper and close < open and rsi > 48 and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - 14.0
    tpP := ep + 18.0
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + 14.0
    tpP := ep - 18.0
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

    const res = await p.run(code);
    const trades = res.strategy.closedtrades || [];
    const wins = trades.filter(tr => tr.profit > 0);
    const wr = (wins.length / trades.length) * 100;

    const mR = {};
    const mW = {};
    const mL = {};
    for (const tr of trades) {
      const m = new Date(tr.entry_time).toISOString().substring(0, 7);
      mR[m] = (mR[m] || 0) + (tr.profit / 14.0);
      if (tr.profit > 0) mW[m] = (mW[m] || 0) + 1;
      else mL[m] = (mL[m] || 0) + 1;
    }

    const netR = res.strategy.netprofit / 14.0;
    const maxDD = (res.strategy.max_drawdown || 1) / 14.0;
    const calmar = maxDD > 0 ? (netR / maxDD) : 0;

    console.log(`\n--- ${t.name} ---`);
    console.log(`Trades: ${trades.length} | Wins: ${wins.length} | Losses: ${trades.length - wins.length} | Win Rate: ${wr.toFixed(2)}% | Net: +${netR.toFixed(2)}R | MaxDD: ${maxDD.toFixed(2)}R | Calmar: ${calmar.toFixed(2)}`);
    console.log(`Monthly R: Aug=+${mR['2026-08']?.toFixed(2)}R (${mW['2026-08']}W/${mL['2026-08']}L) | Sep=+${mR['2026-09']?.toFixed(2)}R (${mW['2026-09']}W/${mL['2026-09']}L) | Oct=+${mR['2026-10']?.toFixed(2)}R (${mW['2026-10']}W/${mL['2026-10']}L)`);
  }
}

testEMAFilter().catch(console.error);
