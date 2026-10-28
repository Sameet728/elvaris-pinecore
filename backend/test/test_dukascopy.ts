import { getHistoricalRates } from 'dukascopy-node';

async function test() {
  console.log('Testing Dukascopy XAUUSD download...');
  const from = new Date('2024-05-06T00:00:00Z');
  const to = new Date('2024-05-06T04:00:00Z');

  const data = await getHistoricalRates({
    instrument: 'xauusd',
    dates: { from, to },
    timeframe: 'm5',
    format: 'json',
  });

  console.log(`Fetched ${data.length} records from Dukascopy!`);
  if (data.length > 0) {
    console.log('First record:', data[0]);
    console.log('Last record:', data[data.length - 1]);
  }
}

test().catch(console.error);
