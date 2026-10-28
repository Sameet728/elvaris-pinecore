import http from 'http';
import lzma from 'lzma';

async function testBi5() {
  // Test a known trading hour on Friday 2024-05-03 at 14:00 UTC
  // In Dukascopy datafeed:
  // Month is typically 0-indexed (e.g. May = 04)
  // File is typically e.g. 14h_ticks.bi5
  const testUrls = [
    'http://datafeed.dukascopy.com/datafeed/XAUUSD/2024/04/03/14h_ticks.bi5',
    'http://datafeed.dukascopy.com/datafeed/XAUUSD/2024/05/03/14h_ticks.bi5',
    'http://datafeed.dukascopy.com/datafeed/XAUUSD/2024/04/03/10h_ticks.bi5',
    'http://datafeed.dukascopy.com/datafeed/XAUUSD/2024/05/03/10h_ticks.bi5',
  ];

  for (const url of testUrls) {
    try {
      console.log(`Testing ${url}...`);
      const buf = await downloadBuffer(url);
      console.log(`  Downloaded ${buf.length} bytes`);
      if (buf.length > 0) {
        console.log(`  Decompressing with LZMA...`);
        const decompressed = await decompressLzma(buf);
        console.log(`  Decompressed ${decompressed.length} bytes (${decompressed.length / 20} ticks)!`);
        
        // Parse first 3 ticks
        parseTicks(decompressed, new Date('2024-05-03T14:00:00Z').getTime());
        break;
      }
    } catch (e) {
      console.log(`  Failed:`, e);
    }
  }
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve(Buffer.alloc(0));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function decompressLzma(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    lzma.decompress(buf, (result: string | number[] | Buffer, error: Error | null) => {
      if (error) {
        reject(error);
      } else if (Buffer.isBuffer(result)) {
        resolve(result);
      } else if (Array.isArray(result)) {
        resolve(Buffer.from(result));
      } else {
        resolve(Buffer.from(result, 'binary'));
      }
    });
  });
}

function parseTicks(buffer: Buffer, hourStartMs: number) {
  const tickCount = Math.floor(buffer.length / 20);
  console.log(`  Parsing ${tickCount} ticks:`);
  for (let i = 0; i < Math.min(5, tickCount); i++) {
    const offset = i * 20;
    const timeMs = buffer.readUInt32BE(offset);
    const askInt = buffer.readUInt32BE(offset + 4);
    const bidInt = buffer.readUInt32BE(offset + 8);
    const askVol = buffer.readFloatBE(offset + 12);
    const bidVol = buffer.readFloatBE(offset + 16);

    // Divisor for Gold/XAUUSD is 1000
    const ask = askInt / 1000;
    const bid = bidInt / 1000;
    console.log(`    Tick ${i + 1}: +${timeMs}ms -> Ask: ${ask.toFixed(3)}, Bid: ${bid.toFixed(3)}, AskVol: ${askVol.toFixed(2)}, BidVol: ${bidVol.toFixed(2)}`);
  }
}

testBi5();
