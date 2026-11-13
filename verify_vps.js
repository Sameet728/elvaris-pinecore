const { runRemote } = require('./vps_tool');

const checkScript = `
cd /opt/stratmarket/vps
cat << 'EOF' > test_load.ts
import { PineStrategyRunner, PINE_STRATEGIES } from "./pine_runner/pine_evaluator";
import { VpsSignalDispatcher } from "./dispatcher";

console.log("=== PINE_STRATEGIES LOADED ===");
for (const s of PINE_STRATEGIES) {
  console.log("[" + s.id + "] " + s.name + " | Len: " + s.bandLength + ", Mult: " + s.bandMult + ", TP: $" + s.tpDist + ", SL: $" + s.slDist + ", Hours: " + s.sessionStart + "-" + s.sessionEnd);
}
const dispatcher = new VpsSignalDispatcher("https://strat-market-chi.vercel.app/api/internal/signals", "test");
const runner = new PineStrategyRunner(dispatcher);
console.log("Runner instantiated cleanly!");
EOF
npx tsx test_load.ts
rm -f test_load.ts
`;

console.log(runRemote(checkScript));
