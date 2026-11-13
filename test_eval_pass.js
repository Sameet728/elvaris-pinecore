const { runRemote } = require('./vps_tool');

const testScript = `
cd /opt/stratmarket/vps
cat << 'EOF' > test_eval.ts
import { PineStrategyRunner, PINE_STRATEGIES } from "./pine_runner/pine_evaluator";
import { VpsSignalDispatcher } from "./dispatcher";

async function main() {
  const dispatcher = new VpsSignalDispatcher("https://strat-market-chi.vercel.app/api/internal/signals", "stratmarket-dev-vps-hmac-shared-secret-key-2026");
  const runner = new PineStrategyRunner(dispatcher);

  console.log("Evaluating all 3 champion strategies on live TradingView candles...");
  for (const strat of PINE_STRATEGIES) {
    console.log("Evaluating: " + strat.id + " (" + strat.name + ")...");
    await runner.evaluateStrategy(strat);
    console.log(" -> Completed without error!");
  }
}
main().catch(err => {
  console.error("Evaluation error:", err);
  process.exit(1);
});
EOF
npx tsx test_eval.ts
rm -f test_eval.ts
`;

console.log(runRemote(testScript));

