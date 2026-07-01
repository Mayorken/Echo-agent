import { EchoMemoryClient } from "../../src/tools/echo-memory-client.js";
import { runSwitchDemo } from "../../src/demo.js";

export default async () => {
  const sessionId = process.env.ECHO_AGENT_SESSION_ID ?? "demo-session-001";
  const echo = new EchoMemoryClient({
    privateKey: process.env.SYNAPSE_PRIVATE_KEY,
    rpcUrl: process.env.SYNAPSE_RPC_URL,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runSwitchDemo({
          echo,
          sessionId,
          emit: (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", phase: "gemini", message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
};

export const config = {
  path: "/api/demo/switch",
};
