import fs from 'fs';

// Let's modify the deduplication key so we can see all distinct session and daily strategies
const fileContent = fs.readFileSync('quant_seasonality/scripts/find_70wr_30cagr_candidates.mjs', 'utf8');

// Replace the deduplication key to preserve distinct configurations
const updated = fileContent.replace(
  'const key = `${s.asset}_${s.timeframe}_${s.name}`;',
  'const key = `${s.id}`;'
);

fs.writeFileSync('quant_seasonality/scripts/find_70wr_30cagr_candidates.mjs', updated);
