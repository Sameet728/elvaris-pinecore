import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_15m_tv.json', 'utf8'));

async function testConfigurations() {
  const p = new PineTS(candles, 'XAUUSD', '15');
  await p.ready();

  const results = [];

  // Carefully curated candidate parameters
  const configs = [];

  // 1. Variations in TP (18 to 22) and SL (13 to 15) with session 1-20
  for (const tp of [17.0, 18.0, 19.0, 20.0, 21.0, 22.0]) {
    for (const sl of [13.0, 14.0, 15.0]) {
      for (const bMult of [2.1, 2.2, 2.3]) {
        for (const bLen of [28, 30, 32]) {
          for (const rsiF of [50, 52, 54]) {
            for (const sStart of [0, 1]) {
              for (const sEnd of [20, 21]) {
                configs.push({ tp, sl, bLen, bMult, rsiF, sStart, sEnd, filterWick: false, longOnly: false });
              }
            }
          }
        }
      }
    }
  }

  // 2. Long only variations
  for (const tp of [16.0, 18.0, 20.0]) {
    for (const sl of [13.0, 14.0]) {
      for (const bMult of [2.0, 2.2, 2.4]) {
        for (const bLen of [25, 30]) {
          for (const rsiF of [50, 52, 55]) {
            for (const sStart of [0, 1]) {
              for (const sEnd of [20, 21]) {
                configs.push({ tp, sl, bLen, bMult, rsiF, sStart, sEnd, filterWick: false, longOnly: true });
              }
            }
          }
        }
      }
    }
  }

  console.log(`Testing ${configs.length} focused configurations directly on PineTS...`);

  let count = 0;
  for (const cfg of configs) {
    count++;
    if (count % 100 === 0) console.log(`Evaluated ${count}/${configs.length}... (Found ${results.length} qualifiers so far)`);

    const shortLogic = cfg.longOnly
      ? 'shortSig = false'
      : `shortSig = inActiveSession and close < ema200 and ema50 < ema200 and high >= upper and close < open and rsi > (100 - ${cfg.rsiF}) and strategy.position_size == 0`;

    const code = `//@version=5
strategy("TestRun", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0)

ema50 = ta.ema(close, 50)
ema200 = ta.ema(close, 200)
basis = ta.sma(close, ${cfg.bLen})
dev = ${cfg.bMult} * ta.stdev(close, ${cfg.bLen})
upper = basis + dev
lower = basis - dev
rsi = ta.rsi(close, 14)

inActiveSession = (hour >= ${cfg.sStart} and hour <= ${cfg.sEnd})

longSig = inActiveSession and close > ema200 and low <= lower and close > open and rsi < ${cfg.rsiF} and strategy.position_size == 0
${shortLogic}

var float ep = na
var float currSL = na
var float tpP = na

if longSig
    ep := close
    currSL := ep - ${cfg.sl}
    tpP := ep + ${cfg.tp}
    strategy.entry("Long", strategy.long)
    strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL)

if shortSig
    ep := close
    currSL := ep + ${cfg.sl}
    tpP := ep - ${cfg.tp}
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

      const rAug = (mProfit['2026-08'] || 0) / cfg.sl;
      const rSep = (mProfit['2026-09'] || 0) / cfg.sl;
      const rOct = (mProfit['2026-10'] || 0) / cfg.sl;

      const netR = res.strategy.netprofit / cfg.sl;
      const maxDD_R = (res.strategy.max_drawdown || 1) / cfg.sl;
      const calmar = maxDD_R > 0 ? (netR / maxDD_R) : 0;

      // Check condition: August >= 10R, September >= 10R, October >= 8R, WR >= 80%
      if (wr >= 80.0 && rAug >= 10.0 && rSep >= 10.0 && rOct >= 8.0) {
        const item = {
          cfg,
          trades: trades.length,
          wins: wins.length,
          losses: trades.length - wins.length,
          winRate: wr,
          netProfit: res.strategy.netprofit,
          netR,
          maxDD_R,
          calmar,
          rAug,
          rSep,
          rOct,
          mTrades,
          mWins,
          mProfit
        };
        results.push(item);
        console.log(`\n🎉 QUALIFIER #${results.length}!`);
        console.log(`   Config: TP: $${cfg.tp} / SL: $${cfg.sl} | BB(${cfg.bLen}, ${cfg.bMult}) | RSI<${cfg.rsiF} | Hours ${cfg.sStart}-${cfg.sEnd} | LongOnly: ${cfg.longOnly}`);
        console.log(`   Trades: ${trades.length} | WR: ${wr.toFixed(2)}% (${wins.length}W / ${trades.length - wins.length}L)`);
        console.log(`   Monthly R: Aug=+${rAug.toFixed(2)}R, Sep=+${rSep.toFixed(2)}R, Oct=+${rOct.toFixed(2)}R`);
        console.log(`   Net: +${netR.toFixed(2)}R | MaxDD: ${maxDD_R.toFixed(2)}R | Calmar: ${calmar.toFixed(2)}\n`);
      }
    } catch (e) {
      // ignore
    }
  }

  console.log(`\nFinished testing. Total Qualifiers: ${results.length}`);
  fs.writeFileSync('data/pinets_dual10r_oct8r_results.json', JSON.stringify(results, null, 2));

  // Sort by Calmar * NetR
  results.sort((a, b) => (b.calmar * b.netR) - (a.calmar * a.netR));

  if (results.length > 0) {
    console.log('\nTop 3 Grandmaster Champions:');
    for (let i = 0; i < Math.min(3, results.length); i++) {
      const r = results[i];
      console.log(`Champion #${i + 1}:`);
      console.log(JSON.stringify(r, null, 2));
    }
  }
}

testConfigurations().catch(console.error);
