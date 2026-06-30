import { generateText, CoreMessage } from "ai";
import { getModel, ProviderName } from "./providers.js";
import { EchoMemoryClient } from "./tools/echo-memory-client.js";
import { buildMemoryTools } from "./tools/memory-tools.js";

const SYSTEM_PROMPT = `You are Echo Agent, an AI assistant whose memory persists across
sessions and across different AI providers via Echo's encrypted, Filecoin-anchored
memory layer. At the start of a conversation, use load_memory to recall any prior
context. When you learn something worth remembering (decisions, preferences, project
facts), use save_memory to persist it. Never assume you have continuity unless
load_memory confirms it.

You also maintain a tamper-evident audit trail. After performing significant actions
(saving memory, making decisions, producing important output), use log_action to
record what you did and why. Each log entry is encrypted and stored on Filecoin with
its own content-addressed CID. At the end of a session, use flush_action_log to
anchor the full audit trail on-chain as a single verifiable proof.`;

export async function runAgentTurn(opts: {
  provider: ProviderName;
  sessionId: string;
  echo: EchoMemoryClient;
  messages: CoreMessage[];
}) {
  const { provider, sessionId, echo, messages } = opts;
  const model = getModel(provider);
  const tools = buildMemoryTools(echo, sessionId, provider);

  const result = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages,
    tools,
    maxSteps: 10, // allow tool-call -> tool-result -> follow-up loops (memory + logging)
  });

  return result;
}
