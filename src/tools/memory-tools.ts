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

    log_action: tool({
      description:
        "Record an agent action as a tamper-evident log entry on Filecoin. " +
        "Each entry is encrypted and stored with its own content-addressed CID — " +
        "anyone with the decryption key can verify the record was not altered. " +
        "Call this after performing a significant action (tool call, decision, output) " +
        "to build a verifiable audit trail of what the agent did and why.",
      parameters: z.object({
        action: z.string().describe("Name of the action performed (e.g. 'save_memory', 'code_review', 'decision')"),
        input: z.record(z.unknown()).describe("The input/parameters of the action"),
        output: z.string().describe("A concise summary of the action's result"),
      }),
      execute: async ({ action, input, output }) => {
        const receipt = await echo.logAction({
          sessionId,
          action,
          input,
          output,
          provider,
          timestamp: new Date().toISOString(),
        });
        return {
          status: "logged",
          cid: receipt.cid,
          integrityHash: receipt.integrityHash,
          entryIndex: receipt.entryIndex,
          pendingEntries: echo.getActionLogSize(),
        };
      },
    }),

    flush_action_log: tool({
      description:
        "Anchor the accumulated action log on-chain as a single verifiable proof. " +
        "Writes a manifest of all logged actions (with their individual CIDs) to Filecoin, " +
        "then records the manifest's CID and integrity hash on the FEVM smart contract. " +
        "Call this at the end of a session or when you want to create an on-chain checkpoint " +
        "of the agent's audit trail.",
      parameters: z.object({}),
      execute: async () => {
        const result = await echo.flushActionLog();
        if (!result) {
          return { status: "empty", message: "No pending action log entries to flush." };
        }
        return {
          status: "flushed",
          cid: result.cid,
          txHash: result.txHash,
          totalEntries: result.totalEntries,
        };
      },
    }),
  };
}
