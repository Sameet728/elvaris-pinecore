const XKIRO_API_KEY = 'sk-xt-92b1514899be71b1d700d78ab565445a89ae43a224ee1805';
const XKIRO_MODEL = 'qwen/qwen3.8-max:free';

async function test() {
  console.log('Sending request to xKiro API...');
  const res = await fetch('https://api.xkiro.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XKIRO_API_KEY}`
    },
    body: JSON.stringify({
      model: XKIRO_MODEL,
      temperature: 0.7,
      messages: [{ role: 'user', content: 'Say hello and confirm you are ready to optimize trading strategies in JSON format {"ready": true, "msg": "hello"}.' }]
    })
  });

  const json = await res.json();
  console.log('Status:', res.status);
  console.log('Response:', JSON.stringify(json, null, 2));
}

test().catch(console.error);
