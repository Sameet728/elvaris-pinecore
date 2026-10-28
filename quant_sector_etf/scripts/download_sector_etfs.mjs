import { getCandles } from '@mathieuc/tradingview';
import fs from 'fs';
import path from 'path';

const outDir = 'c:/Users/samee/Desktop/Pine/quant_sector_etf/data';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 18 Key Sector, Thematic & Asset Class ETFs on NSE
const etfs = [
  { symbol: 'NSE:NIFTYBEES', sector: 'Index_Largecap', name: 'Nifty 50 ETF', file: 'niftybees_daily.json' },
  { symbol: 'NSE:JUNIORBEES', sector: 'Index_Next50', name: 'Nifty Next 50 ETF', file: 'juniorbees_daily.json' },
  { symbol: 'NSE:MID150BEES', sector: 'Index_Midcap', name: 'Nifty Midcap 150 ETF', file: 'mid150bees_daily.json' },
  { symbol: 'NSE:BANKBEES', sector: 'Banking', name: 'Nifty Bank ETF', file: 'bankbees_daily.json' },
  { symbol: 'NSE:PSUBNKBEES', sector: 'Banking_PSU', name: 'Nifty PSU Bank ETF', file: 'psubnkbees_daily.json' },
  { symbol: 'NSE:PVTBANIETF', sector: 'Banking_Private', name: 'Nifty Private Bank ETF', file: 'pvtbanietf_daily.json' },
  { symbol: 'NSE:ITBEES', sector: 'Technology', name: 'Nifty IT ETF', file: 'itbees_daily.json' },
  { symbol: 'NSE:PHARMABEES', sector: 'Healthcare', name: 'Nifty Pharma ETF', file: 'pharmabees_daily.json' },
  { symbol: 'NSE:AUTOBEES', sector: 'Automobile', name: 'Nifty Auto ETF', file: 'autobees_daily.json' },
  { symbol: 'NSE:METALIETF', sector: 'Metals', name: 'Nifty Metal ETF', file: 'metalietf_daily.json' },
  { symbol: 'NSE:FMCGIETF', sector: 'FMCG', name: 'Nifty FMCG ETF', file: 'fmcgietf_daily.json' },
  { symbol: 'NSE:CPSEETF', sector: 'Energy_PSU', name: 'CPSE ETF', file: 'cpseetf_daily.json' },
  { symbol: 'NSE:ICICIB22', sector: 'CPSE_Govt', name: 'Bharat 22 ETF', file: 'icicib22_daily.json' },
  { symbol: 'NSE:GOLDBEES', sector: 'Precious_Metals', name: 'Nippon Gold ETF', file: 'goldbees_daily.json' },
  { symbol: 'NSE:HDFCGOLD', sector: 'Precious_Metals', name: 'HDFC Gold ETF', file: 'hdfcgold_daily.json' },
  { symbol: 'NSE:SILVERBEES', sector: 'Precious_Metals', name: 'Nippon Silver ETF', file: 'silverbees_daily.json' },
  { symbol: 'NSE:MON100', sector: 'Global_Tech', name: 'Motilal Nasdaq 100 ETF', file: 'mon100_daily.json' },
  { symbol: 'NSE:MAFANG', sector: 'Global_Tech', name: 'Mirae NYSE FANG+ ETF', file: 'mafang_daily.json' }
];

async function downloadAll() {
  console.log(`Starting download of ${etfs.length} Sector and Thematic ETFs from NSE...`);
  const manifest = [];

  for (const etf of etfs) {
    console.log(`\nFetching ${etf.name} (${etf.symbol})...`);
    try {
      const raw = await getCandles({
        symbol: etf.symbol,
        timeframe: 'D',
        count: 10000
      });

      if (!raw || raw.length === 0) {
        console.warn(`⚠️ No candles returned for ${etf.symbol}`);
        continue;
      }

      const formatted = raw.map(bar => ({
        time: bar.time > 1e11 ? bar.time : bar.time * 1000,
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        volume: Number(bar.volume || 0)
      }));

      // Sort chronologically
      formatted.sort((a, b) => a.time - b.time);

      const filePath = path.join(outDir, etf.file);
      fs.writeFileSync(filePath, JSON.stringify(formatted, null, 2), 'utf8');

      const startDate = new Date(formatted[0].time).toISOString().substring(0, 10);
      const endDate = new Date(formatted[formatted.length - 1].time).toISOString().substring(0, 10);

      manifest.push({
        symbol: etf.symbol,
        name: etf.name,
        sector: etf.sector,
        file: etf.file,
        bars: formatted.length,
        startDate,
        endDate,
        latestPrice: formatted[formatted.length - 1].close
      });

      console.log(`✅ Saved ${formatted.length} bars to ${etf.file} (${startDate} to ${endDate})`);
    } catch (err) {
      console.error(`❌ Error fetching ${etf.symbol}:`, err.message);
    }
  }

  // Save manifest
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`\n🎉 All Sector ETF data downloaded successfully! Manifest created with ${manifest.length} assets.`);
}

downloadAll();
