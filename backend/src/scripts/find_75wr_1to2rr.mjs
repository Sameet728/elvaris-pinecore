import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function search75WR() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const configs = [];

  // Focused high-probability parameter sets
  const slList = [8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0];
  const bLens = [25, 28, 30, 35];
  const bMults = [2.0, 2.1, 2.2, 2.3, 2.4];
  const rsiFilters = [48, 50, 52];
  const wickRatios = [0.0, 0.10, 0.15, 0.20];
  const sessionStarts = [1, 2, 6];

  for (const sl of slList) {
    for (const bLen of bLens) {
      for (const bMult of bMults) {
        for (const rsiF of rsiFilters) {
          for (const wick of wickRatios) {
            for (const sStart of sessionStarts) {
              configs.push({ sl, tp: sl * 2.0, bLen, bMult, rsiF, wick, sStart });
            }
          }
        }
      }
    }
  }

  console.log(`Testing ${configs.length} focused 1:2.0 R:R configurations on PineTS...`);

  const qualifiers = [];
  let evaluated = 0;

  for (const c of configs) {
    evaluated++;
    if (evaluated % 200 === 0) {
      console.log(`Evaluated ${evaluated}/${configs.length}... Found ${qualifiers.length} qualifiers so far.`);
    }

    const code = `//@version=5
strategy("Test75", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${c.bLen})
dev = ${c.bMult} * ta.stdev(close, ${c.bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

body = math.abs(close - open)
lowerWick = math.min(open, close) - low
upperWick = high - math.max(open, close)
wickLongOk = lowerWick >= (body * ${c.wick})
wickShortOk = upperWick >= (body * ${c.wick})

utcHour = hour(time, "UTC")
inActiveSession = (utcHour >= ${c.sStart} and utcHour <= 20) and (utcHour != 12)

longSig = inActiveSession and close > (ema200 + 4.0) and low <= lower and close > open and rsi < ${c.rsiF} and wickLongOk and strategy.position_size == 0
shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${c.rsiF}) and wickShortOk and strategy.position_size == 0

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
      if (trades.length < 20) continue;

      const wins = trades.filter(t => t.profit > 0);
      const wr = (wins.length / trades.length) * 100;
      const netR = res.strategy.netprofit / c.sl;
      const maxDDR = (res.strategy.max_drawdown || 1) / c.sl;
      const calmar = maxDDR > 0 ? (netR / maxDDR) : 0;

      if (wr >= 70.0 && calmar >= 4.0) {
        const item = {
          c,
          trades: trades.length,
          wins: wins.length,
          losses: trades.length - wins.length,
          winRate: wr,
          netR,
          maxDDR,
          calmar,
          netProfit: res.strategy.netprofit
        };
        qualifiers.push(item);
        console.log(`\n🎉 1:2 R:R QUALIFIER #${qualifiers.length}!`);
        console.log(`   Config: SL: $${c.sl} / TP: $${c.tp} (1:2.0 R:R) | BB(${c.bLen}, ${c.bMult}) | RSI<${c.rsiF} | Wick:${c.wick} | Start:${c.sStart} UTC`);
        console.log(`   Trades: ${trades.length} | WR: ${wr.toFixed(2)}% (${wins.length}W / ${trades.length - wins.length}L) | Net: +${netR.toFixed(2)}R | MaxDD: ${maxDDR.toFixed(2)}R | Calmar: ${calmar.toFixed(2)}\n`);
      }
    } catch (e) {
      // ignore
    }
  }

  console.log(`\nScan finished. Total Qualifiers found: ${qualifiers.length}`);
  fs.writeFileSync('data/qualifiers_1to2_70wr.json', JSON.stringify(qualifiers, null, 2));

  qualifiers.sort((a, b) => (b.winRate * b.calmar * b.netR) - (a.winRate * a.calmar * a.netR));

  console.log('\nTop 5 Champions:');
  for (let i = 0; i < Math.min(5, qualifiers.length); i++) {
    console.log(qualifiers[i]);
  }
}

search75WR().catch(console.error);
