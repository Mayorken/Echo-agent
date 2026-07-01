import "dotenv/config";
import { EchoMemoryClient } from "./tools/echo-memory-client.js";
import { runSwitchDemo, DemoEvent } from "./demo.js";

const SESSION_ID = process.env.ECHO_AGENT_SESSION_ID ?? "demo-session-001";

const echo = new EchoMemoryClient({
  privateKey: process.env.SYNAPSE_PRIVATE_KEY,
  rpcUrl: process.env.SYNAPSE_RPC_URL,
});

function printEvent(event: DemoEvent) {
  switch (event.type) {
    case "phase-start":
      if (event.phase === "gemini") console.log("\n=== PHASE 1: Agent running on Gemini ===\n");
      if (event.phase === "bridge") console.log("\n--- Simulating process kill: clearing all local state ---\n");
      if (event.phase === "groq") console.log("=== PHASE 2: Fresh agent instance, running on Groq ===\n");
      break;
    case "gemini-done":
      console.log("[Gemini agent]:", event.text);
      if (event.commp) console.log(`(saved to Filecoin, CommP=${event.commp})`);
      break;
    case "groq-done":
      console.log("[Groq agent]:", event.text);
      console.log(
        event.recalled
          ? "\n=== Groq recalled the project details with zero re-explaining. Demo worked. ==="
          : "\n=== Groq did not recall prior memory. Something's off. ==="
      );
      break;
    case "error":
      console.error(`\n[${event.phase}] ERROR: ${event.message}`);
      break;
    case "complete":
      break;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isSwitchDemo = args.includes("--demo=switch");

  if (isSwitchDemo) {
    await runSwitchDemo({ echo, sessionId: SESSION_ID, emit: printEvent });
    return;
  }

  console.log("Run with --demo=switch to see the provider-switch demo, or `npm run demo:web` for the web UI.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
