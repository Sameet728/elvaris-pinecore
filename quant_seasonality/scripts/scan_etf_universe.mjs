import { getCandles } from '@mathieuc/tradingview';

const candidates = [
  { symbol: 'NSE:NIFTYBEES', sector: 'Index', name: 'Nifty 50' },
  { symbol: 'NSE:JUNIORBEES', sector: 'Index', name: 'Nifty Next 50' },
  { symbol: 'NSE:MID150BEES', sector: 'Index', name: 'Nifty Midcap 150' },
  { symbol: 'NSE:BANKBEES', sector: 'Banking', name: 'Nifty Bank' },
  { symbol: 'NSE:PSUBNKBEES', sector: 'Banking', name: 'Nifty PSU Bank' },
  { symbol: 'NSE:PVTBANIETF', sector: 'Banking', name: 'Nifty Private Bank' },
  { symbol: 'NSE:ITBEES', sector: 'IT', name: 'Nifty IT' },
  { symbol: 'NSE:PHARMABEES', sector: 'Pharma', name: 'Nifty Pharma' },
  { symbol: 'NSE:AUTOBEES', sector: 'Auto', name: 'Nifty Auto' },
  { symbol: 'NSE:METALIETF', sector: 'Metal', name: 'Nifty Metal' },
  { symbol: 'NSE:CONSUMBEES', sector: 'Consumption', name: 'Nifty Consumption' },
  { symbol: 'NSE:FMCGIETF', sector: 'FMCG', name: 'Nifty FMCG' },
  { symbol: 'NSE:INFRABEES', sector: 'Infra', name: 'Nifty Infrastructure' },
  { symbol: 'NSE:CPSEETF', sector: 'CPSE', name: 'CPSE Public Sector' },
  { symbol: 'NSE:GOLDBEES', sector: 'Gold', name: 'Gold ETF' },
  { symbol: 'NSE:SILVERBEES', sector: 'Silver', name: 'Silver ETF' },
  { symbol: 'NSE:MON100', sector: 'Global_Tech', name: 'Nasdaq 100' },
  { symbol: 'NSE:MAFANG', sector: 'Global_Tech', name: 'NYSE FANG+' },
  { symbol: 'NSE:AXISGOLD', sector: 'Gold', name: 'Axis Gold' },
  { symbol: 'NSE:HDFCGOLD', sector: 'Gold', name: 'HDFC Gold' },
  { symbol: 'NSE:ICICIB22', sector: 'CPSE', name: 'Bharat 22' },
  { symbol: 'NSE:COMMOIETF', sector: 'Commodities', name: 'Nifty Commodities' }
];

async function scanUniverse() {
  console.log('Testing ETF symbols on TradingView NSE feed...');
  const results = [];
  for (const item of candidates) {
    try {
      const bars = await getCandles({
        symbol: item.symbol,
        timeframe: 'D',
        count: 10000
      });
      if (bars && bars.length > 50) {
        const start = new Date(bars[0].time * 1000).toISOString().slice(0, 10);
        const end = new Date(bars[bars.length - 1].time * 1000).toISOString().slice(0, 10);
        const latestVol = bars[bars.length - 1].volume || 0;
        const latestClose = bars[bars.length - 1].close || 0;
        const avgVol20 = bars.slice(-20).reduce((acc, b) => acc + (b.volume || 0), 0) / 20;
        const avgTurnover20Cr = (avgVol20 * latestClose) / 10000000; // in Crores INR

        results.push({
          symbol: item.symbol,
          name: item.name,
          sector: item.sector,
          bars: bars.length,
          start,
          end,
          latestClose,
          avgVol20: Math.round(avgVol20),
          avgTurnover20Cr: avgTurnover20Cr.toFixed(2),
          status: 'OK'
        });
        console.log(`✅ ${item.symbol.padEnd(16)} | Bars: ${String(bars.length).padEnd(5)} | Range: ${start} to ${end} | AvgVol20: ${Math.round(avgVol20).toLocaleString().padStart(9)} | Turnover: ₹${avgTurnover20Cr.toFixed(2)} Cr`);
      } else {
        console.log(`❌ ${item.symbol.padEnd(16)} | Too few bars (${bars?.length || 0})`);
      }
    } catch (e) {
      console.log(`❌ ${item.symbol.padEnd(16)} | Error: ${e.message}`);
    }
  }

  console.log(`\nScan complete: ${results.length} / ${candidates.length} valid sector ETFs found.`);
}

scanUniverse();
