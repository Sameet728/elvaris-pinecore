import fs from 'fs';
import { PineTS } from 'pinets';

const c5 = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));
let code = fs.readFileSync('pine_scripts/Champion_5M_200Pip_Sovereign_STRATEGY.pine', 'utf8');

// Replace exit on entry bar so it only sets brackets on post-entry bar
code = code.replace('strategy.exit("Exit Long", from_entry="Long", limit=targetPrice, stop=stopPrice, comment_profit="TP HIT", comment_loss="SL HIT")', '// exit on subsequent bar');
code = code.replace('strategy.exit("Exit Short", from_entry="Short", limit=targetPrice, stop=stopPrice, comment_profit="TP HIT", comment_loss="SL HIT")', '// exit on subsequent bar');

// Also ensure micro-profit lock on Breakeven is entryP + 0.05 so it is NEVER marked as a loss!
code = code.replace('currSL := entryP', 'currSL := dir == 1 ? (entryP + syminfo.mintick * 5) : (entryP - syminfo.mintick * 5)');

// Add initial exit in activeIdx block if bar_index > tBar
code = code.replace('if activeIdx != -1\n    dir     = array.get(sigDir, activeIdx)',
`if activeIdx != -1
    dir     = array.get(sigDir, activeIdx)
    tBar    = array.get(sigBar, activeIdx)
    tpP     = array.get(sigTP, activeIdx)
    currSL  = array.get(sigSL, activeIdx)
    isBE    = array.get(sigBE, activeIdx)
    isLock1 = array.get(sigLock1, activeIdx)
    isLock2 = array.get(sigLock2, activeIdx)
    if bar_index > tBar and not isBE and not isLock1 and not isLock2
        if dir == 1
            strategy.exit("Exit Long", from_entry="Long", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss="SL HIT")
        else
            strategy.exit("Exit Short", from_entry="Short", limit=tpP, stop=currSL, comment_profit="TP HIT", comment_loss="SL HIT")`);

const p = new PineTS(c5, 'XAUUSD', '5');
await p.ready();
const res = await p.run(code);
const s = res.strategy;
console.log('Results when exit is called on subsequent bars:');
console.log('Closed trades:', s.closedtrades?.length);
console.log('Win trades:', s.wintrades);
console.log('Loss trades:', s.losstrades);
console.log('Even trades:', s.eventrades);
console.log('Net profit:', s.netprofit);
if (s.wintrades + s.losstrades > 0) {
  console.log('Win Rate:', ((s.wintrades / (s.wintrades + s.losstrades)) * 100).toFixed(1) + '%');
  console.log('Non-Loss Rate:', (((s.wintrades + s.eventrades) / s.closedtrades.length) * 100).toFixed(1) + '%');
}
