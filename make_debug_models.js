const fs = require('fs');

// Let's modify search_zero_match_strategies.js to relax the filter to wr >= 70.0 and trades >= 15
// and see what the best win rates actually are for each model!

const code = fs.readFileSync('search_zero_match_strategies.js', 'utf8')
  .replace(/ev\.wr >= 80\.0 && ev\.trades >= \d+ && ev\.calmar >= 4\.0/g, 'ev.wr >= 68.0 && ev.trades >= 15');

fs.writeFileSync('debug_models.js', code);
console.log('Created debug_models.js');

