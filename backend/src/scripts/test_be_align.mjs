import fs from 'fs';
import { PineTS } from 'pinets';

const candles = JSON.parse(fs.readFileSync('data/xauusd_1h_tv.json', 'utf8'));

// Test aligning F1 to F2
let code = fs.readFileSync('pine_scripts/Champion_1H_Pure_Sovereign_STRATEGY.pine', 'utf8');

// Replace the BE block
const targetOld = `    if not isBE and currentGain >= slDistInput * beTriggerR
        targetBE = dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        if (dir == 1 and close > targetBE) or (dir == -1 and close < targetBE)
            currSL := targetBE
            isBE := true`;

const targetNew = `    if not isBE and currentGain >= slDistInput * beTriggerR
        currSL := dir == 1 ? (ep + syminfo.mintick * 10) : (ep - syminfo.mintick * 10)
        isBE := true`;

code = code.replace(targetOld, targetNew);

async function test() {
  const p = new PineTS(candles, 'XAUUSD', '60');
  await p.ready();
  const res = await p.run(code);
  const s = res.strategy;
  const trades = s.closedtrades || [];
  console.log(`Aligned Results -> Trades: ${trades.length} | Net: $${s.netprofit.toFixed(2)} | DD: $${s.max_drawdown?.toFixed(2)} | WR: ${((trades.filter(t => t.profit > 0).length / trades.length) * 100).toFixed(2)}%`);
}

test().catch(console.error);
