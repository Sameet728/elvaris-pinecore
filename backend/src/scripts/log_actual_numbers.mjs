import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function inspectRuns() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const tests = [
    // Baseline
    { name: 'Baseline 18/14 RSI 52 wick 0', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.0, sStart: 1, sEnd: 20 },
    { name: 'Wick 0.05', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.05, sStart: 1, sEnd: 20 },
    { name: 'Wick 0.10', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.10, sStart: 1, sEnd: 20 },
    { name: 'Wick 0.15', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.15, sStart: 1, sEnd: 20 },
    { name: 'Wick 0.20', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.20, sStart: 1, sEnd: 20 },
    { name: 'Wick 0.25 (Apex)', tp: 17.0, sl: 14.0, rsi: 54, wick: 0.25, sStart: 6, sEnd: 20 },
    // Session variations
    { name: 'Session 0-20', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.0, sStart: 0, sEnd: 20 },
    { name: 'Session 2-20', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.0, sStart: 2, sEnd: 20 },
    { name: 'Session 1-21', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.0, sStart: 1, sEnd: 21 },
    { name: 'Session 1-22', tp: 18.0, sl: 14.0, rsi: 52, wick: 0.0, sStart: 1, sEnd: 22 },
    // TP variations
    { name: 'TP 16 / SL 12', tp: 16.0, sl: 12.0, rsi: 52, wick: 0.0, sStart: 1, sEnd: 20 },
    { name: 'TP 16 / SL 14', tp: 16.0, sl: 14.0, rsi: 52, wick: 0.0, sStart: 1, sEnd: 20 },
    { name: 'TP 20 / SL 14', tp: 20.0, sl: 14.0, rsi: 52, wick: 0.0, sStart: 1, sEnd: 20 },
    // RSI variations
    { name: 'RSI 50', tp: 18.0, sl: 14.0, rsi: 50, wick: 0.0, sStart: 1, sEnd: 20 },
    { name: 'RSI 48', tp: 18.0, sl: 14.0, rsi: 48, wick: 0.0, sStart: 1, sEnd: 20 },
    { name: 'RSI 55', tp: 18.0, sl: 14.0, rsi: 55, wick: 0.0, sStart: 1, sEnd: 20 }
  ];

  for (const t of tests) {
    const code = `//@version=5
strategy("${t.name.replace(/[^a-zA-Z0-9]/g, '')}", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, 30)
dev = 2.2 * ta.stdev(close, 30)
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

body = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
wickLongOk = lowerWick >= (body * ${t.wick})
wickShortOk = upperWick >= (body * ${t.wick})

inActiveSession = (hour >= ${t.sStart} and hour <= ${t.sEnd})

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < ${t.rsi} and wickLongOk and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${t.rsi}) and wickShortOk and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${t.sl}
    tpP := ep + ${t.tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${t.sl}
    tpP := ep - ${t.tp}
    strategy.entry("Short", strategy.short)
    strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL)
`;

    const res = await p.run(code);
    const trades = res.strategy.closedtrades || [];
    const wins = trades.filter(tr => tr.profit > 0);
    const wr = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;

    const mProfit = {};
    const mTrades = {};
    const mWins = {};
    for (const tr of trades) {
      const d = new Date(tr.entry_time);
      const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      mProfit[m] = (mProfit[m] || 0) + tr.profit;
      mTrades[m] = (mTrades[m] || 0) + 1;
      if (tr.profit > 0) mWins[m] = (mWins[m] || 0) + 1;
    }

    const rAug = (mProfit['2026-08'] || 0) / t.sl;
    const rSep = (mProfit['2026-09'] || 0) / t.sl;
    const rOct = (mProfit['2026-10'] || 0) / t.sl;

    console.log(`${t.name.padEnd(30)} | Trades: ${trades.length} | WR: ${wr.toFixed(1)}% | Aug: ${rAug >= 0 ? '+' : ''}${rAug.toFixed(1)}R | Sep: ${rSep >= 0 ? '+' : ''}${rSep.toFixed(1)}R | Oct: ${rOct >= 0 ? '+' : ''}${rOct.toFixed(1)}R | Total: +${(res.strategy.netprofit / t.sl).toFixed(1)}R`);
  }
}

inspectRuns().catch(console.error);
