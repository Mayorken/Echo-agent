import { CoreMessage } from "ai";
import { runAgentTurn } from "./agent.js";
import { EchoMemoryClient } from "./tools/echo-memory-client.js";

export type DemoEvent =
  | { type: "phase-start"; phase: "gemini" | "bridge" | "groq" }
  | { type: "gemini-done"; text: string; commp?: string }
  | { type: "groq-done"; text: string; recalled: boolean }
  | { type: "error"; phase: "gemini" | "bridge" | "groq"; message: string }
  | { type: "complete" };

/**
 * THE MONEY SHOT.
 * Phase 1: agent runs on Gemini, does some work, saves memory to Filecoin (Synapse).
 * Phase 2: simulate killing the process (new messages array, no shared
 *          in-memory state) and resuming on Groq. The only way phase 2
 *          knows anything from phase 1 is via load_memory -> Synapse -> Filecoin.
 */
export async function runSwitchDemo(opts: {
  echo: EchoMemoryClient;
  sessionId: string;
  emit: (event: DemoEvent) => void;
}) {
  const { echo, sessionId, emit } = opts;

  emit({ type: "phase-start", phase: "gemini" });

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

  let result1;
  try {
    result1 = await runAgentTurn({
      provider: "gemini",
      sessionId,
      echo,
      messages: phase1Messages,
    });
  } catch (err) {
    emit({ type: "error", phase: "gemini", message: describeError(err) });
    return;
  }

  const saveResult = findToolResult(result1.steps, "save_memory") as { commp?: string } | undefined;

  emit({ type: "gemini-done", text: result1.text, commp: saveResult?.commp });

  emit({ type: "phase-start", phase: "bridge" });
  // In a real demo, this would be a literal process exit + restart.
  // Here we just throw away phase1Messages and any in-memory state.

  emit({ type: "phase-start", phase: "groq" });

  const phase2Messages: CoreMessage[] = [
    {
      role: "user",
      content: "What do you know about my project? Load your memory first.",
    },
  ];

  let result2;
  try {
    result2 = await runAgentTurn({
      provider: "groq",
      sessionId,
      echo,
      messages: phase2Messages,
    });
  } catch (err) {
    emit({ type: "error", phase: "groq", message: describeError(err) });
    return;
  }

  const loadResult = findToolResult(result2.steps, "load_memory") as { status?: string } | undefined;

  emit({ type: "groq-done", text: result2.text, recalled: loadResult?.status === "loaded" });
  emit({ type: "complete" });
}

/**
 * generateText's top-level `toolResults` only reflects the final step;
 * with multi-step tool calling (maxSteps > 1) the tool call we care about
 * usually happened in an earlier step, so scan all of them.
 */
function findToolResult(steps: Array<{ toolResults: Array<{ toolName: string; result: unknown }> }>, toolName: string) {
  for (const step of steps) {
    const match = step.toolResults.find((r) => r.toolName === toolName);
    if (match) return match.result;
  }
  return undefined;
}

/**
 * Synapse/Filecoin errors come back as long chained stack traces. Pull out
 * the parts a non-engineer needs (what's missing, what to do) instead of
 * dumping the raw error at the demo audience.
 */
function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("InsufficientLockupFunds") || message.includes("Insufficient USDFC")) {
    return "Your Synapse account doesn't have enough USDFC deposited to pay for storage yet. " +
      "Get testnet USDFC and deposit it via synapse.payments.deposit() before running this demo.";
  }
  if (message.includes("No endorsed provider available")) {
    return "None of Filecoin Onchain Cloud's endorsed storage providers responded to a health check " +
      "right now (a calibration-testnet infra issue, not a bug in this code). Try again shortly.";
  }
  if (message.includes("API key is missing") || message.includes("api key")) {
    return "A model provider API key is missing from .env — check GOOGLE_GENERATIVE_AI_API_KEY / GROQ_API_KEY.";
  }
  return message;
}
