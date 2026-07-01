# Echo Agent

An AI agent whose memory is portable across providers — encrypted, Filecoin-anchored,
and owned by the user. Built on [Echo](https://github.com/Mayorken/Echo) for the
**FilecoinTLDR Builder Challenge — Cycle 2** (theme: AI agent using Filecoin for
memory, logs, datasets, or proofs).

## The story

Echo (Cycle 1, 1st place) proved a user-owned, encrypted, Filecoin-anchored memory
layer for AI conversations. Echo Agent extends that to autonomous agents: an agent's
working memory — facts, decisions, project context — lives on Filecoin instead of in
a single process's RAM. Kill the agent, switch it from Gemini to Groq, and it picks
up exactly where it left off. No re-explaining. No starting over.

## Architecture

```
Agent (Vercel AI SDK)
 ├─ Provider: Gemini (gemini-2.5-flash)        ─┐
 ├─ Provider: Groq (llama-3.3-70b-versatile)   ─┤  swappable — same tool interface
 └─ Tools:
      save_memory → EchoMemoryClient.save() → encrypt (AES-256-GCM) → Synapse SDK upload → CommP
      load_memory → EchoMemoryClient.load() → Synapse SDK download → decrypt → inject into context
```

`src/tools/echo-memory-client.ts` wraps the [Synapse SDK](https://github.com/FilOzone/synapse-sdk)
(Filecoin Onchain Cloud). Snapshots are encrypted client-side before upload, so
storage providers only ever see ciphertext. Everything else (agent loop, tools,
CLI) talks to that interface and doesn't know or care how memory is persisted.

A local pointer file (`.data/session-pointers.json`) maps `sessionId -> latest
CommP` as a stand-in for an on-chain registry contract — swap this for a real
registry read/write once that contract is wired in.

## Setup

```bash
npm install
cp .env.example .env
# fill in GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, SYNAPSE_PRIVATE_KEY,
# SYNAPSE_RPC_URL, and ECHO_ENCRYPTION_KEY
```

## Run the demo

```bash
npm run demo:switch
```

This runs the kill-and-resurrect flow: Phase 1 agent runs on Gemini, saves memory
to Filecoin via Synapse. Phase 2 simulates a fresh process on Groq, loads memory,
and continues with zero re-explaining.

## TODO before submission

- [ ] Confirm `@filoz/synapse-sdk` upload/download API surface against the latest
      release (version pinned in `package.json` is a placeholder)
- [ ] Fund the Synapse account / approve storage payment (Filecoin Pay) so
      `storage.upload()` succeeds on calibration testnet
- [ ] Replace the local `.data/session-pointers.json` pointer file with a real
      on-chain registry (EchoContextRegistry.sol) lookup
- [ ] Confirm `gemini-2.5-flash` / `llama-3.3-70b-versatile` model strings are
      current at build time
- [ ] Add a real "process kill" (two separate `node` invocations sharing only the
      Filecoin-backed session, not a simulated in-process reset) for the recorded demo
- [ ] Optional: add a `log_action` tool that writes a tamper-evident record of each
      tool call to Filecoin (re-uses the same CommP proof pattern as memory) —
      strengthens the "proofs" angle of the theme alongside "memory"
- [ ] Record the walkthrough video (script pattern: same as the Cycle 1 demo —
      hook → problem → live demo → proof → close)
- [ ] Write the submission blurb (reuse the Echo Cycle 1 voice: short, concrete,
      one differentiator up front)

## Milestone plan (Jun 29 – Jul 10)

**Jun 29 – Jul 3 (register + scaffold)**
- Jun 29–30: Register on Loops House. Scaffold repo (done — this repo).
- Jul 1–2: Wire real Synapse SDK into `echo-memory-client.ts`. Get `save`/`load`
  actually round-tripping through Filecoin (not stubs) — done, pending funded
  testnet account for a live upload/download test.
- Jul 3: End-to-end test of the single-provider flow (agent saves + loads memory
  correctly on one provider, e.g. Gemini only). Lock registration before deadline.

**Jul 4 – Jul 10 (build + submit window)**
- Jul 4: Confirm Groq provider wiring. Get the literal two-process kill-and-resurrect
  demo working (not simulated — actually kill and restart).
- Jul 5: Add the proof/log angle if time allows (`log_action` tool — strengthens
  theme coverage beyond just memory).
- Jul 6–7: Polish CLI output / build a minimal web UI if time allows (optional —
  CLI demo is sufficient, polish only if ahead of schedule).
- Jul 8: Record the walkthrough video. Multiple takes if needed.
- Jul 9: Write submission blurb, prepare repo (README, clean commit history,
  license). Push to `Landrush-ltd` or personal org per your preference.
- Jul 10: Submit. Buffer day — do not start anything new.

## Tech stack

- **Agent framework:** Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/groq`) —
  TypeScript-native, unified tool-calling across providers, minimal overhead
- **Memory:** AES-256-GCM client-side encryption + [Synapse SDK](https://github.com/FilOzone/synapse-sdk)
  (Filecoin Onchain Cloud / Warm Storage)
- **Language:** TypeScript / Node 18+
