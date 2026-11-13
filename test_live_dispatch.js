const { runRemote } = require('./vps_tool');

const dispatchTest = `
cd /opt/stratmarket/vps
cat << 'EOF' > test_dispatch.ts
import { VpsSignalDispatcher } from "./dispatcher";

async function test() {
  const dispatcher = new VpsSignalDispatcher(
    "https://strat-market-chi.vercel.app/api/internal/signals",
    "stratmarket-dev-vps-hmac-shared-secret-key-2026"
  );

  const testSignals = [
    {
      sourceEventId: "vps_test_ps01_" + Date.now(),
      strategyId: "PS-01",
      strategyVersion: "1.0.0",
      instrument: "XAUUSD",
      timeframe: "M15",
      signalType: "ENTRY" as const,
      direction: "LONG" as const,
      timestamp: new Date().toISOString(),
      entryPrice: 4105.50,
      stopLoss: 4091.75,
      targetPrice: 4119.50,
      signalProvenance: "VPS_TEST_VALIDATOR"
    },
    {
      sourceEventId: "vps_test_ps02_" + Date.now(),
      strategyId: "PS-02",
      strategyVersion: "1.0.0",
      instrument: "XAUUSD",
      timeframe: "M15",
      signalType: "ENTRY" as const,
      direction: "LONG" as const,
      timestamp: new Date().toISOString(),
      entryPrice: 4105.50,
      stopLoss: 4091.75,
      targetPrice: 4123.50,
      signalProvenance: "VPS_TEST_VALIDATOR"
    },
    {
      sourceEventId: "vps_test_ps03_" + Date.now(),
      strategyId: "PS-03",
      strategyVersion: "1.0.0",
      instrument: "XAUUSD",
      timeframe: "M15",
      signalType: "ENTRY" as const,
      direction: "LONG" as const,
      timestamp: new Date().toISOString(),
      entryPrice: 4105.50,
      stopLoss: 4091.75,
      targetPrice: 4121.50,
      signalProvenance: "VPS_TEST_VALIDATOR"
    }
  ];

  for (const sig of testSignals) {
    console.log("Dispatching test signal for " + sig.strategyId + "...");
    const res = await dispatcher.dispatchSignal(sig);
    console.log("Result for " + sig.strategyId + ":", JSON.stringify(res));
  }
}
test().catch(console.error);
EOF
npx tsx test_dispatch.ts
rm -f test_dispatch.ts
`;

console.log(runRemote(dispatchTest));

