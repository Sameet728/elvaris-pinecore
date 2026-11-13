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

async function getS1Entries() {
  const pts = new PineTS(pineCandles, 'FOREXCOM:XAUUSD', '15');
  await pts.ready();
  const res = await pts.run(s1Script);
  const trades = res.strategy.closedtrades;
  console.log('S1 Trade Count:', trades.length);
  const s1EntryTimes = new Set();
  const entries = trades.map(t => {
    const entryT = t.entry_time || pineCandles[t.entry_bar_index]?.openTime;
    s1EntryTimes.add(entryT);
    return {
      bar: t.entry_bar_index,
      time: entryT,
      timeStr: new Date(entryT).toISOString(),
      dir: t.size > 0 ? 'LONG' : 'SHORT',
      pnl: t.profit
    };
  });
  fs.writeFileSync('s1_entries.json', JSON.stringify({ entries, timestamps: Array.from(s1EntryTimes) }, null, 2));
  console.log('Saved 46 S1 entry timestamps to s1_entries.json');
}
getS1Entries();

