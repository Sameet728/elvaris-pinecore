const fs = require('fs');
const d = JSON.parse(fs.readFileSync('monte_carlo_portfolio_audit.json', 'utf8'));

console.log('=================================================================================================================================');
console.log('PORTFOLIO COMPARISON & 10,000-RUN MONTE CARLO AUDIT (TRADEIFY EVALUATION $100K ACCOUNT)');
console.log('=================================================================================================================================');
console.log('Rank | Portfolio Name                                         | Trades | WR (Emp) | MC WR Mean (95% CI)  | MC Calmar | Pass Rate | Collisions');
console.log('---------------------------------------------------------------------------------------------------------------------------------');

// 1. Sort by Monte Carlo Calmar (Median)
d.sort((a, b) => parseFloat(b.mc.calmarMedian) - parseFloat(a.mc.calmarMedian));

d.forEach((p, i) => {
  const padName = p.name.padEnd(52).slice(0, 52);
  const trades = String(p.tradesCount).padStart(6);
  const wrEmp = (p.empirical.wr + '%').padStart(8);
  const mcWR = (p.mc.wrMean + '% [' + p.mc.wrP5 + '%-' + p.mc.wrP95 + '%]').padEnd(21);
  const mcCalmar = (p.mc.calmarMedian + ' [' + p.mc.calmarP5 + '-' + p.mc.calmarP95 + ']').padEnd(16);
  const pass = (p.mc.passRate + '%').padStart(9);
  const col = String(p.collisions).padStart(10);
  console.log(`#${String(i+1).padStart(2)} | ${padName} | ${trades} | ${wrEmp} | ${mcWR} | ${mcCalmar} | ${pass} | ${col}`);
});

console.log('\n=================================================================================================================================');
console.log('SORTED BY MONTE CARLO WIN RATE (HIGHEST TO LOWEST):');
console.log('=================================================================================================================================');
d.sort((a, b) => parseFloat(b.mc.wrMean) - parseFloat(a.mc.wrMean));

d.forEach((p, i) => {
  const padName = p.name.padEnd(52).slice(0, 52);
  const trades = String(p.tradesCount).padStart(6);
  const wrEmp = (p.empirical.wr + '%').padStart(8);
  const mcWR = (p.mc.wrMean + '% [' + p.mc.wrP5 + '%-' + p.mc.wrP95 + '%]').padEnd(21);
  const mcCalmar = (p.mc.calmarMedian + ' [' + p.mc.calmarP5 + '-' + p.mc.calmarP95 + ']').padEnd(16);
  const pass = (p.mc.passRate + '%').padStart(9);
  const col = String(p.collisions).padStart(10);
  console.log(`#${String(i+1).padStart(2)} | ${padName} | ${trades} | ${wrEmp} | ${mcWR} | ${mcCalmar} | ${pass} | ${col}`);
});

