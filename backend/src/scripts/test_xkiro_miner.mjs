// Test xKiro Qwen 3.8 Max AI generation
const prompt = `You are an elite quantitative researcher specializing in TradingView Pine Script v6 for Gold (FOREXCOM:XAUUSD) M5.
Generate a high-performance institutional trading strategy suitable for Prop Firm instant accounts (FundedSquad / Pipstone Capital).

Key Architecture:
1. Version: //@version=6
2. Use indicator("...", overlay=true) with the following tracking arrays:
   var int[] sigDir = array.new_int()
   var float[] sigEntry = array.new_float()
   var float[] sigSL = array.new_float()
   var float[] sigTP = array.new_float()
   var int[] sigResult = array.new_int()
   var int[] sigBar = array.new_int()
   var string[] monthKeys = array.new_string()
   var int[] monthWins = array.new_int()
   var int[] monthLosses = array.new_int()
   var float[] monthR = array.new_float()
   var float cumulativeR = 0.0
   var float maxDrawdown = 0.0
   var float peakR = 0.0
   var int lastBias = 0
3. ZERO lookahead bias. Confirmed on candle close only.
4. Take Profit: MUST be 20 to 40 pips (which on XAUUSD is 2.0 to 4.0 points price distance).
5. Stop Loss: 10 to 18 pips (1.0 to 1.8 points price distance).
6. DO NOT plot red/green dotted lines. Only boxes/lines or clean visuals.
7. Return ONLY valid Pine Script code inside \`\`\`pinescript ... \`\`\` block.`;

async function main() {
  console.log('Sending request to xKiro API...');
  const res = await fetch('https://api.xkiro.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer sk-xt-92b1514899be71b1d700d78ab565445a89ae43a224ee1805'
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-max:free',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    console.error('API Error:', data);
    return;
  }
  const content = data.choices[0].message.content;
  console.log('API Response received, length:', content.length);
  console.log('Snippet:\n', content.slice(0, 400));
}

main().catch(console.error);
