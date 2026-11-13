const { MongoClient } = require('mongodb');

const uri = 'mongodb://sameetpisal_db_user:0op4uoeZpcVTooaP@ac-ozckia6-shard-00-00.syikpx1.mongodb.net:27017,ac-ozckia6-shard-00-01.syikpx1.mongodb.net:27017,ac-ozckia6-shard-00-02.syikpx1.mongodb.net:27017/stratmarket?ssl=true&replicaSet=atlas-11286g-shard-0&authSource=admin';

async function check() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('stratmarket');
  const sigs = await db.collection('signals').find().sort({ _id: -1 }).limit(6).toArray();
  console.log('=== LATEST SIGNALS IN PRODUCTION DATABASE ===');
  for (const s of sigs) {
    console.log(`[${s.id}] Strategy: ${s.strategyId} | Type: ${s.signalType} ${s.direction} | Price: $${s.entryPrice} | SL: $${s.stopLoss} | TP: $${s.targetPrice} | Time: ${s.timestamp}`);
  }
  await client.close();
}
check().catch(console.error);

