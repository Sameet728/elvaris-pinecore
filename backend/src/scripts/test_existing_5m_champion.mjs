import fs from 'fs';
import { PineTS } from 'pinets';

const candles5m = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
const code = fs.readFileSync('pine_scripts/Champion_80to100Pip_Dual10R_STRATEGY_NativeOrders.pine', 'utf8');

async function test() {
  console.log(`Running Champion_80to100Pip_Dual10R_STRATEGY_NativeOrders on ${candles5m.length} 5M candles...`);
  try {
    const p = new PineTS(candles5m, 'XAUUSD', '5');
    await p.ready();
    const res = await p.run(code);
    const s = res.strategy;
    const trades = s.closedtrades || [];
    const wins = trades.filter(t => t.profit > 0);
    const losses = trades.filter(t => t.profit <= 0);
    const wr = trades.length ? (wins.length / trades.length) * 100 : 0;
    const calmar = s.netprofit / (s.max_drawdown || 1);

    console.log('\n=== 5M DUAL 10R NATIVE ORDERS RESULT ===');
    console.log(`Total Trades: ${trades.length}`);
    console.log(`Wins: ${wins.length} | Losses: ${losses.length}`);
    console.log(`Win Rate: ${wr.toFixed(2)}%`);
    console.log(`Net Profit: $${s.netprofit.toFixed(2)}`);
    console.log(`Max Drawdown: $${s.max_drawdown?.toFixed(2)}`);
    console.log(`Calmar Ratio: ${calmar.toFixed(2)}`);

    const monthly = {};
    trades.forEach(t => {
      const d = new Date(t.entry_time);
      const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      monthly[mKey] = (monthly[mKey] || 0) + t.profit;
    });
    console.log('Monthly Breakdown:', monthly);

    trades.slice(-5).forEach((t, i) => {
      const d = new Date(t.entry_time);
      console.log(`Trade #${trades.length - 5 + i + 1} | ${d.toISOString()} | Entry: ${t.entry_price} | Exit: ${t.exit_price} | PnL: $${t.profit.toFixed(2)}`);
    });
  } catch (e) {
    console.error('Execution error:', e);
  }
}

test().catch(console.error);
