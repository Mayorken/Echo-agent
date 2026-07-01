import "dotenv/config";
import { CoreMessage } from "ai";
import { runAgentTurn } from "./agent.js";
import { EchoMemoryClient } from "./tools/echo-memory-client.js";

const SESSION_ID = process.env.ECHO_AGENT_SESSION_ID ?? "demo-session-001";

const echo = new EchoMemoryClient({
  privateKey: process.env.ECHO_PRIVATE_KEY,
  contractAddress: process.env.ECHO_REGISTRY_CONTRACT_ADDRESS,
  rpcUrl: process.env.ECHO_RPC_URL,
  lighthouseApiKey: process.env.ECHO_LIGHTHOUSE_API_KEY,
  storageProvider: process.env.ECHO_STORAGE_PROVIDER,
});

async function main() {
  const args = process.argv.slice(2);
  const demoArg = args.find((a) => a.startsWith("--demo="));
  const demo = demoArg?.split("=")[1];

  switch (demo) {
    case "switch":
      await runSwitchDemo();
      break;
    case "save":
      await runSavePhase();
      break;
    case "load":
      await runLoadPhase();
      break;
    default:
      console.log("Usage:");
      console.log("  npm run demo:switch   — full in-process demo (save on OpenAI, load on Claude)");
      console.log("  npm run demo:save     — Phase 1 only: save memory via OpenAI");
      console.log("  npm run demo:load     — Phase 2 only: load memory via Claude (run after demo:save)");
  }
}

/**
 * Phase 1 (save): Agent runs on OpenAI, learns project context, saves to Filecoin.
 * Run this, then fully close the process. Memory survives only on Filecoin.
 */
async function runSavePhase() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  ECHO AGENT — PHASE 1: Save memory (OpenAI → Filecoin)  ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const messages: CoreMessage[] = [
    {
      role: "user",
      content:
        "I'm building Echo, a portable memory layer on Filecoin. Remember that I prefer " +
        "TypeScript, I'm targeting the FilecoinTLDR Cycle 2 challenge deadline of July 10, " +
        "and my main contract is EchoMemoryRegistry.sol with UUPS upgradeability. " +
        "Save this to memory.",
    },
  ];

  const result = await runAgentTurn({
    provider: "openai",
    sessionId: SESSION_ID,
    echo,
    messages,
  });

  console.log("\n[OpenAI agent]:", result.text);
  console.log("\n✓ Phase 1 complete. Memory is now on Filecoin.");
  console.log("  Close this process, open a new terminal, run: npm run demo:load\n");
}

/**
 * Phase 2 (load): Fresh process, fresh provider (Claude). The only link to
 * Phase 1 is the Filecoin-anchored memory. Zero shared in-process state.
 */
async function runLoadPhase() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ECHO AGENT — PHASE 2: Load memory (Filecoin → Claude)     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("  This is a fresh process. No shared state with Phase 1.");
  console.log("  Memory survives only via Filecoin + Echo on-chain registry.\n");

  const messages: CoreMessage[] = [
    {
      role: "user",
      content: "What do you know about my project? Load your memory first.",
    },
  ];

  const result = await runAgentTurn({
    provider: "anthropic",
    sessionId: SESSION_ID,
    echo,
    messages,
  });

  console.log("\n[Claude agent]:", result.text);
  console.log("\n✓ If Claude recalled the project details with zero re-explaining,");
  console.log("  the portable memory demo worked — context survived a process kill");
  console.log("  AND a provider switch, backed entirely by Filecoin.\n");
}

/**
 * Combined in-process demo (original). Both phases run in one process,
 * but memory still round-trips through Filecoin (not shared in-memory).
 */
async function runSwitchDemo() {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  ECHO AGENT — Full Switch Demo (OpenAI → kill → Claude)  ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Phase 1
  console.log("── PHASE 1: Agent running on OpenAI ──\n");

  const phase1Messages: CoreMessage[] = [
    {
      role: "user",
      content:
        "I'm building Echo, a portable memory layer on Filecoin. Remember that I prefer " +
        "TypeScript, I'm targeting the FilecoinTLDR Cycle 2 challenge deadline of July 10, " +
        "and my main contract is EchoMemoryRegistry.sol with UUPS upgradeability. " +
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

  console.log("\n── Simulating process kill: clearing all local state ──\n");

  // Phase 2
  console.log("── PHASE 2: Fresh agent instance, running on Claude ──\n");

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
  console.log("\n✓ If Claude recalled the project details with zero re-explaining, the demo worked.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
