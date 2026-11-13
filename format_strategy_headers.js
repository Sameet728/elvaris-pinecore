const fs = require('fs');

const files = ['Champion_15M_London_Keltner_STRATEGY.pine', 'Champion_15M_NY_Afternoon_STRATEGY.pine'];
const dirs = ['15M_Champion_Strategies/', 'MyPine/'];

files.forEach(f => {
  dirs.forEach(dir => {
    const p = dir + f;
    if (fs.existsSync(p)) {
      let code = fs.readFileSync(p, 'utf8');
      const stratName = f.replace('.pine', '');
      const singleLine = `strategy("${stratName}", overlay=true, initial_capital=100000, default_qty_type=strategy.fixed, default_qty_value=1.0, margin_long=0, margin_short=0, commission_type=strategy.commission.cash_per_contract, commission_value=0.0, max_boxes_count=500, max_lines_count=500, max_labels_count=500)`;
      code = code.replace(/strategy\([\s\S]*?max_labels_count=500\s*\)/m, singleLine);
      fs.writeFileSync(p, code, 'utf8');
      console.log('Formatted ' + p);
    }
  });
});

