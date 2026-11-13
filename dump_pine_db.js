const { MongoClient } = require('mongodb');

const uri = 'mongodb://sameetpisal_db_user:0op4uoeZpcVTooaP@ac-ozckia6-shard-00-00.syikpx1.mongodb.net:27017,ac-ozckia6-shard-00-01.syikpx1.mongodb.net:27017,ac-ozckia6-shard-00-02.syikpx1.mongodb.net:27017/stratmarket?ssl=true&replicaSet=atlas-11286g-shard-0&authSource=admin';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('stratmarket');
  const docs = await db.collection('strategies').find({ implementationType: 'PINE_SCRIPT' }).toArray();
  console.log(`Found ${docs.length} Pine strategies:`);
  for (const d of docs) {
    console.log(`--- [${d.id}] ${d.name} (${d.slug}) ---`);
    console.log(JSON.stringify(d, null, 2));
  }
  await client.close();
}
main().catch(console.error);
