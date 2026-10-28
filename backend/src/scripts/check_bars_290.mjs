import fs from 'fs';

const candles = JSON.parse(fs.readFileSync('data/xauusd_5m_tv.json', 'utf8'));

// Check what sweeps and setups exist around bar 290..300 in simTrades
import { execSync } from 'child_process';
console.log('Inspecting bars 280-320 in simTrades logic...');
