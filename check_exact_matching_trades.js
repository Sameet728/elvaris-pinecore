const fs = require('fs');
const { PineTS } = require('./pine-backtester-nextjs/node_modules/pinets');

const rawCandles = JSON.parse(fs.readFileSync('pine-backtester-nextjs/public/data/xauusd_15m.json', 'utf8'));
const pineCandles = rawCandles.map(c => ({
  open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  openTime: c.openTime, closeTime: c.openTime + 15 * 60000
}));

const s1Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_Grandmaster_Dual10R_Oct8R_STRATEGY.pine', 'utf8')
  .replace(/var table perfTable[\s\S]*?plot\(ema50/m, 'plot(ema50')
  .replace(/if showPositionBoxes[\s\S]*?var table/m, 'var table');

const s2Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_US_Momentum_STRATEGY.pine', 'utf8');
const s3Script = fs.readFileSync('15M_Champion_Strategies/Champion_15M_London_Core_STRATEGY.pine', 'utf8');

async function getTrades(script, name) {
  const pts = new PineTS(pineCandles, 'FOREXCOM:XAUUSD', '15');
  await pts.ready();
  const res = await pts.run(script);
  return res.strategy.closedtrades.map((t, idx) => {
    const entryT = t.entry_time || pineCandles[t.entry_bar_index]?.openTime;
    const exitT = t.exit_time || pineCandles[t.exit_bar_index]?.openTime;
    return {
      id: idx + 1,
      entryBar: t.entry_bar_index,
      exitBar: t.exit_bar_index,
      entryTime: entryT,
      exitTime: exitT,
      timeStr: new Date(entryT).toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      exitTimeStr: new Date(exitT).toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      dir: t.size > 0 ? 'LONG' : 'SHORT',
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      profit: t.profit
    };
  });
}

async function analyze() {
  const t1 = await getTrades(s1Script, 'S1');
  const t2 = await getTrades(s2Script, 'S2');
  const t3 = await getTrades(s3Script, 'S3');

  console.log(`Total trades: S1 = ${t1.length}, S2 = ${t2.length}, S3 = ${t3.length}`);

  // Exact entry time match
  function findExactMatches(arrA, arrB) {
    const matches = [];
    for (const a of arrA) {
      const match = arrB.find(b => b.entryTime === a.entryTime && b.dir === a.dir);
      if (match) {
        matches.push({ a, b: match });
      }
    }
    return matches;
  }

  const m12 = findExactMatches(t1, t2);
  const m13 = findExactMatches(t1, t3);
  const m23 = findExactMatches(t2, t3);

  // Exact 3-way match (entered on exact same candle in all 3 strategies)
  const m123 = [];
  for (const a of t1) {
    const b = t2.find(x => x.entryTime === a.entryTime && x.dir === a.dir);
    const c = t3.find(x => x.entryTime === a.entryTime && x.dir === a.dir);
    if (b && c) {
      m123.push({ a, b, c });
    }
  }

  console.log('\n================ EXACT MATCHING TRADES REPORT ================');
  console.log(`\n1. S1 vs S2 Exact Entry Matches: ${m12.length} trades`);
  console.log(`   - S1 has 46 trades, S2 has 30 trades.`);
  console.log(`   - Exactly matching entries: ${m12.length}`);
  console.log(`   - S1 trades NOT in S2: ${t1.length - m12.length} (${(((t1.length - m12.length) / t1.length) * 100).toFixed(1)}% of S1)`);
  console.log(`   - S2 trades NOT in S1: ${t2.length - m12.length} (${(((t2.length - m12.length) / t2.length) * 100).toFixed(1)}% of S2)`);

  console.log(`\n2. S1 vs S3 Exact Entry Matches: ${m13.length} trades`);
  console.log(`   - S1 has 46 trades, S3 has 34 trades.`);
  console.log(`   - Exactly matching entries: ${m13.length}`);
  console.log(`   - S1 trades NOT in S3: ${t1.length - m13.length} (${(((t1.length - m13.length) / t1.length) * 100).toFixed(1)}% of S1)`);
  console.log(`   - S3 trades NOT in S1: ${t3.length - m13.length} (${(((t3.length - m13.length) / t3.length) * 100).toFixed(1)}% of S3)`);

  console.log(`\n3. S2 vs S3 Exact Entry Matches: ${m23.length} trades`);
  console.log(`   - S2 has 30 trades, S3 has 34 trades.`);
  console.log(`   - Exactly matching entries: ${m23.length}`);
  console.log(`   - S2 trades NOT in S3: ${t2.length - m23.length} (${(((t2.length - m23.length) / t2.length) * 100).toFixed(1)}% of S2)`);
  console.log(`   - S3 trades NOT in S2: ${t3.length - m23.length} (${(((t3.length - m23.length) / t3.length) * 100).toFixed(1)}% of S3)`);

  console.log(`\n4. Trades that entered on the EXACT SAME CANDLE in ALL 3 Strategies: ${m123.length} trades`);

  console.log('\n--- Listing All Exact 3-Way Overlapping Trades ---');
  for (let i = 0; i < m123.length; i++) {
    const item = m123[i];
    console.log(`${i + 1}. [${item.a.timeStr}] ${item.a.dir} @ ${item.a.entryPrice.toFixed(2)} | S1 Exit: ${item.a.exitPrice.toFixed(2)} (P:${item.a.profit.toFixed(2)}) | S2 Exit: ${item.b.exitPrice.toFixed(2)} (P:${item.b.profit.toFixed(2)}) | S3 Exit: ${item.c.exitPrice.toFixed(2)} (P:${item.c.profit.toFixed(2)})`);
  }

  // Also check if any trades in S2 or S3 are completely unique (not in any other strategy)
  const uniqueS1 = t1.filter(a => !t2.some(b => b.entryTime === a.entryTime) && !t3.some(c => c.entryTime === a.entryTime));
  const uniqueS2 = t2.filter(b => !t1.some(a => a.entryTime === b.entryTime) && !t3.some(c => c.entryTime === b.entryTime));
  const uniqueS3 = t3.filter(c => !t1.some(a => a.entryTime === c.entryTime) && !t2.some(b => b.entryTime === c.entryTime));

  console.log('\n--- Unique Trades per Strategy (Entered When NO Other Strategy Entered) ---');
  console.log(`• S1 Exclusive Unique Trades: ${uniqueS1.length}`);
  for (const u of uniqueS1) console.log(`   S1 Only: ${u.timeStr} ${u.dir} @ ${u.entryPrice} -> Profit: ${u.profit}`);

  console.log(`• S2 Exclusive Unique Trades: ${uniqueS2.length}`);
  for (const u of uniqueS2) console.log(`   S2 Only: ${u.timeStr} ${u.dir} @ ${u.entryPrice} -> Profit: ${u.profit}`);

  console.log(`• S3 Exclusive Unique Trades: ${uniqueS3.length}`);
  for (const u of uniqueS3) console.log(`   S3 Only: ${u.timeStr} ${u.dir} @ ${u.entryPrice} -> Profit: ${u.profit}`);

  fs.writeFileSync('exact_match_audit.json', JSON.stringify({ m12, m13, m23, m123, uniqueS1, uniqueS2, uniqueS3 }, null, 2));
}

analyze().catch(console.error);

