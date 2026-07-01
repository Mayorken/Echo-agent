import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EchoMemoryClient } from "./tools/echo-memory-client.js";
import { runSwitchDemo } from "./demo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_ID = process.env.ECHO_AGENT_SESSION_ID ?? "demo-session-001";
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(express.static(path.resolve(__dirname, "..", "public")));

app.get("/api/demo/switch", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const echo = new EchoMemoryClient({
    privateKey: process.env.SYNAPSE_PRIVATE_KEY,
    rpcUrl: process.env.SYNAPSE_RPC_URL,
  });

  try {
    await runSwitchDemo({
      echo,
      sessionId: SESSION_ID,
      emit: (event) => res.write(`data: ${JSON.stringify(event)}\n\n`),
    });
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", phase: "gemini", message: err?.message ?? String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Echo Agent demo site running at http://localhost:${PORT}`);
});
