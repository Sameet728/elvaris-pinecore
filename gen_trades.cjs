const fs = require('fs');

const entryTs = 1791570000000;
const entryIdx = 7444;

const sampleTrades = [];
sampleTrades.push({
  id: 20,
  bar: entryIdx,
  time: entryTs,
  direction: 'SHORT',
  entryPrice: 4196.0975,
  stopLoss: 4203.6464,
  takeProfit: 4180.9997,
  result: 'OPEN',
  profitR: 0.0,
});

const tradeDefs = [
  { dir: 'SHORT', res: 'WIN',  r: 2.0, daysAgo: 0.02, entry: 4197.375, sl: 4202.10, tp: 4187.925 },
  { dir: 'SHORT', res: 'WIN',  r: 2.0, daysAgo: 0.5, entry: 4186.42, sl: 4198.12, tp: 4163.01 },
  { dir: 'SHORT', res: 'WIN',  r: 2.0, daysAgo: 0.9, entry: 4180.80, sl: 4193.07, tp: 4156.26 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 1.4, entry: 4181.32, sl: 4172.10, tp: 4199.75 },
  { dir: 'SHORT', res: 'WIN',  r: 2.0, daysAgo: 2.0, entry: 4192.65, sl: 4202.10, tp: 4173.75 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 2.6, entry: 4189.34, sl: 4179.80, tp: 4208.42 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 3.2, entry: 4176.50, sl: 4168.00, tp: 4193.50 },
  { dir: 'SHORT', res: 'LOSS', r: -1.0, daysAgo: 3.8, entry: 4165.20, sl: 4174.50, tp: 4146.60 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 4.5, entry: 4158.40, sl: 4149.20, tp: 4176.80 },
  { dir: 'SHORT', res: 'WIN',  r: 2.0, daysAgo: 5.1, entry: 4172.90, sl: 4181.30, tp: 4156.10 },
  { dir: 'SHORT', res: 'LOSS', r: -1.0, daysAgo: 5.8, entry: 4160.10, sl: 4168.90, tp: 4142.50 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 6.4, entry: 4148.80, sl: 4139.50, tp: 4167.40 },
  { dir: 'SHORT', res: 'LOSS', r: -1.0, daysAgo: 7.2, entry: 4135.20, sl: 4143.80, tp: 4118.00 },
  { dir: 'LONG',  res: 'LOSS', r: -1.0, daysAgo: 7.9, entry: 4140.50, sl: 4131.20, tp: 4159.10 },
  { dir: 'SHORT', res: 'LOSS', r: -1.0, daysAgo: 8.5, entry: 4152.00, sl: 4161.40, tp: 4133.20 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 9.3, entry: 4128.60, sl: 4119.00, tp: 4147.80 },
  { dir: 'SHORT', res: 'WIN',  r: 2.0, daysAgo: 10.1, entry: 4145.30, sl: 4154.50, tp: 4126.90 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 11.0, entry: 4118.20, sl: 4109.10, tp: 4136.40 },
  { dir: 'LONG',  res: 'WIN',  r: 2.0, daysAgo: 12.2, entry: 4105.70, sl: 4096.50, tp: 4124.10 },
];

for (let j = 0; j < tradeDefs.length; j++) {
  const td = tradeDefs[j];
  const tTime = entryTs - Math.round(td.daysAgo * 86400000);
  const bIdx = Math.max(0, entryIdx - Math.round((td.daysAgo * 86400000) / 300000));
  sampleTrades.push({
    id: 19 - j,
    bar: bIdx,
    time: tTime,
    direction: td.dir,
    entryPrice: td.entry,
    stopLoss: td.sl,
    takeProfit: td.tp,
    result: td.res,
    profitR: td.r,
  });
}

const lines = [];
for (const t of sampleTrades) {
    lines.push(`        { id: ${t.id}, bar: ${t.bar}, time: ${t.time}, direction: '${t.direction}', entryPrice: ${t.entryPrice}, stopLoss: ${t.stopLoss}, takeProfit: ${t.takeProfit}, result: '${t.result}', profitR: ${t.profitR} },`);
}
fs.writeFileSync('trades.txt', lines.join('\n'));
