import { tool } from "ai";
import { z } from "zod";
import { EchoMemoryClient, MemorySnapshot } from "./echo-memory-client.js";

export function buildMemoryTools(echo: EchoMemoryClient, sessionId: string, provider: "openai" | "anthropic") {
  return {
    save_memory: tool({
      description:
        "Save the current conversation's important facts and a rolling summary to Echo's " +
        "encrypted, Filecoin-anchored memory store. Call this whenever you learn something " +
        "worth remembering across sessions or AI providers (preferences, decisions, project context).",
      parameters: z.object({
        summary: z.string().describe("A concise rolling summary of the conversation so far"),
        facts: z.array(z.string()).describe("Discrete facts or preferences worth persisting"),
      }),
      execute: async ({ summary, facts }) => {
        const snapshot: MemorySnapshot = {
          sessionId,
          summary,
          facts,
          lastProvider: provider,
          updatedAt: new Date().toISOString(),
        };
        const receipt = await echo.save(snapshot);
        return {
          status: "saved",
          cid: receipt.cid,
          txHash: receipt.txHash,
        };
      },
    }),

    load_memory: tool({
      description:
        "Load any previously saved context for this session from Echo's memory store. " +
        "Call this at the start of a conversation to recall what's already known, " +
        "especially if you are a fresh agent instance or a different AI provider.",
      parameters: z.object({}),
      execute: async () => {
        const snapshot = await echo.load(sessionId);
        if (!snapshot) {
          return { status: "empty", message: "No prior memory found for this session." };
        }
        return {
          status: "loaded",
          summary: snapshot.summary,
          facts: snapshot.facts,
          lastProvider: snapshot.lastProvider,
          updatedAt: snapshot.updatedAt,
        };
      },
    }),
  };
}
