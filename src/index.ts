import "dotenv/config";
import { CoreMessage } from "ai";
import { runAgentTurn } from "./agent.js";
import { EchoMemoryClient } from "./tools/echo-memory-client.js";

const SESSION_ID = process.env.ECHO_AGENT_SESSION_ID ?? "demo-session-001";

const echo = new EchoMemoryClient({
  privateKey: process.env.ECHO_PRIVATE_KEY,
  contractAddress: process.env.ECHO_REGISTRY_CONTRACT_ADDRESS,
  rpcUrl: process.env.ECHO_RPC_URL,
});

async function main() {
  const args = process.argv.slice(2);
  const isSwitchDemo = args.includes("--demo=switch");

  if (isSwitchDemo) {
    await runSwitchDemo();
    return;
  }

  console.log("Run with --demo=switch to see the provider-switch demo.");
}

/**
 * THE MONEY SHOT.
 * Phase 1: agent runs on OpenAI, does some work, saves memory to Echo.
 * Phase 2: simulate killing the process (new messages array, no shared
 *          in-memory state) and resuming on Anthropic. The only way
 *          phase 2 knows anything from phase 1 is via load_memory ->
 *          Echo -> Filecoin.
 */
async function runSwitchDemo() {
  console.log("\n=== PHASE 1: Agent running on OpenAI ===\n");

  const phase1Messages: CoreMessage[] = [
    {
      role: "user",
      content:
        "I'm building Echo, a portable memory layer on Filecoin. Remember that I prefer " +
        "TypeScript, I'm targeting the FilecoinTLDR Cycle 2 challenge deadline of July 10, " +
        "and my main contract is EchoContextRegistry.sol with UUPS upgradeability. " +
        "Save this to memory.",
    },
  ];

  const result1 = await runAgentTurn({
    provider: "openai",
    sessionId: SESSION_ID,
    echo,
    messages: phase1Messages,
  });

  console.log("\n[OpenAI agent]:", result1.text);

  console.log("\n--- Simulating process kill: clearing all local state ---\n");
  // In a real demo, this would be a literal process exit + restart.
  // Here we just throw away phase1Messages and any in-memory state.

  console.log("=== PHASE 2: Fresh agent instance, running on Anthropic (Claude) ===\n");

  const phase2Messages: CoreMessage[] = [
    {
      role: "user",
      content: "What do you know about my project? Load your memory first.",
    },
  ];

  const result2 = await runAgentTurn({
    provider: "anthropic",
    sessionId: SESSION_ID,
    echo,
    messages: phase2Messages,
  });

  console.log("\n[Claude agent]:", result2.text);
  console.log("\n=== If Claude recalled the project details with zero re-explaining, the demo worked. ===\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
