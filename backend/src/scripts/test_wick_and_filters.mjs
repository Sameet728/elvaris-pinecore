import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testWickAndFilters() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const wickRatios = [0.0, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20];
  const rsiFilters = [48, 50, 52, 54];
  const tpList = [17.0, 18.0, 19.0, 20.0];
  const slList = [13.0, 14.0];

  console.log(`Starting targeted test for wick ratios, RSI, TP, and SL...`);

  const qualifiers = [];

  for (const wick of wickRatios) {
    for (const rsiF of rsiFilters) {
      for (const tp of tpList) {
        for (const sl of slList) {
          const code = `//@version=5
strategy("TestFilter", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

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
wickLongOk = lowerWick >= (body * ${wick})
wickShortOk = upperWick >= (body * ${wick})

inActiveSession = (hour >= 1 and hour <= 20)

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < ${rsiF} and wickLongOk and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${rsiF}) and wickShortOk and strategy.position_size == 0

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${sl}
    tpP := ep + ${tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${sl}
    tpP := ep - ${tp}
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

            const rAug = (mProfit['2026-08'] || 0) / sl;
            const rSep = (mProfit['2026-09'] || 0) / sl;
            const rOct = (mProfit['2026-10'] || 0) / sl;

            const netR = res.strategy.netprofit / sl;
            const maxDD_R = (res.strategy.max_drawdown || 1) / sl;
            const calmar = maxDD_R > 0 ? (netR / maxDD_R) : 0;

            if (rAug >= 10.0 && rSep >= 10.0 && rOct >= 8.0 && wr >= 80.0) {
              qualifiers.push({
                wick, rsiF, tp, sl,
                trades: trades.length,
                wins: wins.length,
                losses: trades.length - wins.length,
                winRate: wr,
                netR,
                maxDD_R,
                calmar,
                rAug,
                rSep,
                rOct,
                mTrades,
                mWins,
                mProfit
              });
              console.log(`🎯 QUALIFIER: Wick: ${wick} | RSI<${rsiF} | TP: $${tp} / SL: $${sl} -> Trades: ${trades.length} | WR: ${wr.toFixed(2)}% | Net: +${netR.toFixed(2)}R | Aug: +${rAug.toFixed(2)}R | Sep: +${rSep.toFixed(2)}R | Oct: +${rOct.toFixed(2)}R | Calmar: ${calmar.toFixed(2)}`);
            } else if (rAug >= 9.5 && rSep >= 9.5 && rOct >= 7.5 && wr >= 78.0) {
              console.log(`   NEAR MISS: Wick: ${wick} | RSI<${rsiF} | TP: $${tp} / SL: $${sl} -> Trades: ${trades.length} | WR: ${wr.toFixed(2)}% | Net: +${netR.toFixed(2)}R | Aug: +${rAug.toFixed(2)}R | Sep: +${rSep.toFixed(2)}R | Oct: +${rOct.toFixed(2)}R`);
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }
  }

  console.log(`\nFound ${qualifiers.length} qualifiers.`);
  fs.writeFileSync('data/wick_test_qualifiers.json', JSON.stringify(qualifiers, null, 2));
}

testWickAndFilters().catch(console.error);
