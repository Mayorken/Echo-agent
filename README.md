# Echo Agent

An AI agent whose memory is portable across providers — encrypted, Filecoin-anchored,
and owned by the user. Built on [Echo](https://github.com/Mayorken/Echo) for the
**FilecoinTLDR Builder Challenge — Cycle 2** (theme: AI agent using Filecoin for
memory, logs, datasets, or proofs).

## The story

Echo (Cycle 1, 1st place) proved a user-owned, encrypted, Filecoin-anchored memory
layer for AI conversations. Echo Agent extends that to autonomous agents: an agent's
working memory — facts, decisions, project context — lives on Filecoin instead of in
a single process's RAM. Kill the agent, switch it from OpenAI to Claude, and it picks
up exactly where it left off. No re-explaining. No starting over.

## Architecture

```
Agent (Vercel AI SDK)
 ├─ Provider: OpenAI (gpt-4o)      ─┐
 ├─ Provider: Anthropic (Claude)   ─┤  swappable — same tool interface
 └─ Tools:
      save_memory → EchoMemoryClient.save() → encrypt → Filecoin + on-chain registry
      load_memory → EchoMemoryClient.load() → fetch → decrypt → inject into context
```

`src/tools/echo-memory-client.ts` is the **only file that needs real Echo SDK wiring**.
Everything else (agent loop, tools, CLI) talks to that interface and doesn't know or
care how memory is actually persisted.

## Setup

```bash
npm install
cp .env.example .env
# fill in OPENAI_API_KEY, ANTHROPIC_API_KEY, and your Echo SDK credentials
```

## Run the demo

```bash
npm run demo:switch
```

This runs the kill-and-resurrect flow: Phase 1 agent runs on OpenAI, saves memory.
Phase 2 simulates a fresh process on Claude, loads memory, and continues with zero
re-explaining.

## TODO before submission

- [ ] Wire `EchoMemoryClient.save()` / `.load()` to the real Echo SDK
      (`github.com/Mayorken/Echo`) instead of the current stubs
- [ ] Confirm `claude-sonnet-4-5` / `gpt-4o` model strings are current at build time
- [ ] Add a real "process kill" (two separate `node` invocations sharing only the
      Filecoin-backed session, not a simulated in-process reset) for the recorded demo
- [ ] Optional: add a `log_action` tool that writes a tamper-evident record of each
      tool call to Filecoin (re-uses the same CID/tx-hash proof pattern as memory) —
      strengthens the "proofs" angle of the theme alongside "memory"
- [ ] Record the walkthrough video (script pattern: same as the Cycle 1 demo —
      hook → problem → live demo → proof → close)
- [ ] Write the submission blurb (reuse the Echo Cycle 1 voice: short, concrete,
      one differentiator up front)

## Milestone plan (Jun 29 – Jul 10)

**Jun 29 – Jul 3 (register + scaffold)**
- Jun 29–30: Register on Loops House. Scaffold repo (done — this repo).
- Jul 1–2: Wire real Echo SDK into `echo-memory-client.ts`. Get `save`/`load`
  actually round-tripping through Filecoin (not stubs).
- Jul 3: End-to-end test of the single-provider flow (agent saves + loads memory
  correctly on one provider, e.g. OpenAI only). Lock registration before deadline.

**Jul 4 – Jul 10 (build + submit window)**
- Jul 4: Wire Anthropic provider. Get the literal two-process kill-and-resurrect
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

- **Agent framework:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`) —
  TypeScript-native, unified tool-calling across providers, minimal overhead
- **Memory:** Echo SDK (AES-256-GCM client-side encryption, Filecoin/FVM on-chain
  registry, Lighthouse storage adapter)
- **Language:** TypeScript / Node 18+
