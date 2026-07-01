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

Every action the agent takes is also logged as a tamper-evident record on Filecoin —
each entry gets its own content-addressed CID, and the full audit trail is anchored
on-chain as a single verifiable proof.

## Architecture

```
Agent (Vercel AI SDK)
 ├─ Provider: OpenAI (gpt-4o)      ─┐
 ├─ Provider: Anthropic (Claude)   ─┤  swappable — same tool interface
 └─ Tools:
      save_memory   → encrypt → Synapse SDK (Filecoin Onchain Cloud) → on-chain registry
      load_memory   → on-chain lookup → Synapse download → decrypt → inject
      log_action    → encrypt → Synapse (individual CID per action)
      flush_action_log → batch manifest → Synapse + on-chain anchor
```

### How it works

```
save_memory flow:
  snapshot → JSON → AES-256-GCM encrypt(derived key) → synapse.storage.upload
  → contract.updateMemory(cid, keccak256(plaintext)) → { cid, txHash }

load_memory flow:
  contract.getMemory(wallet) → [cid, integrityHash]
  → synapse.storage.download(cid) → decrypt → verify keccak256 === integrityHash → snapshot

log_action flow:
  action record → encrypt → synapse.storage.upload → { cid, integrityHash }
  (accumulated in memory, flushed on-chain via flush_action_log)
```

### Project structure

```
src/
├── agent.ts                    # Agent loop (generateText + tools)
├── providers.ts                # OpenAI / Anthropic provider switching
├── index.ts                    # CLI entry point + demo scripts
├── echo/                       # TypeScript port of Echo SDK core
│   ├── client.ts               # EchoClient: contract + storage + crypto
│   ├── crypto.ts               # AES-256-GCM encrypt/decrypt + key derivation
│   ├── storage.ts              # Storage adapters (Synapse SDK / Lighthouse)
│   ├── abi.json                # EchoMemoryRegistry V3 contract ABI
│   └── index.ts                # Barrel export
└── tools/
    ├── echo-memory-client.ts   # High-level memory + action log client
    └── memory-tools.ts         # Vercel AI SDK tool definitions
```

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Required | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | Yes | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | Yes | https://console.anthropic.com/settings/keys |
| `ECHO_PRIVATE_KEY` | Yes | Your wallet private key (same as Echo deployment) |
| `ECHO_REGISTRY_CONTRACT_ADDRESS` | Yes | Pre-filled in `.env.example` (Calibration testnet) |
| `ECHO_RPC_URL` | Yes | Pre-filled in `.env.example` |
| `ECHO_STORAGE_PROVIDER` | No | `synapse` (default, recommended) or `lighthouse` |
| `ECHO_LIGHTHOUSE_API_KEY` | Only if lighthouse | https://files.lighthouse.storage |

### Wallet funding (Calibration testnet)

The wallet needs tFIL for gas and tUSDFC for storage payments:

1. **tFIL**: https://faucet.calibnet.chainsafe-fil.io — paste your wallet address
2. **tUSDFC**: https://forest-explorer.chainsafe.dev/faucet/calibration

## Run the demo

### Combined (in-process)

```bash
npm run demo:switch
```

Both phases run in one process. Memory still round-trips through Filecoin — not
shared in-memory.

### Two-process (the real proof)

```bash
# Terminal 1: Agent runs on OpenAI, saves memory to Filecoin, exits
npm run demo:save

# Close the terminal. Open a new one.

# Terminal 2: Fresh process, Agent runs on Claude, loads from Filecoin
npm run demo:load
```

If Claude recalls the project details with zero re-explaining, the demo worked —
context survived a process kill AND a provider switch, backed entirely by Filecoin.

## Agent tools

| Tool | What it does |
|---|---|
| `save_memory` | Encrypts facts + summary → uploads to Filecoin → anchors CID on-chain |
| `load_memory` | Reads CID from on-chain → fetches from Filecoin → decrypts → injects into context |
| `log_action` | Records a single agent action to Filecoin (encrypted, content-addressed CID) |
| `flush_action_log` | Batches all logged actions into a manifest → uploads + anchors on-chain |

## Live deployment

Uses the same contract as Echo:

| | |
|---|---|
| **Proxy (permanent address)** | `0x962C42f208d89D5bF1698E3397BC78176D70cE0c` |
| **Network** | Filecoin Calibration (chainId 314159) |
| **Explorer** | https://calibration.filscan.io/address/0x962C42f208d89D5bF1698E3397BC78176D70cE0c |

## Why Filecoin

The portability promise only works if the storage is genuinely permanent and
user-controlled. Filecoin's perpetual-storage mechanism means context doesn't
disappear when a company shuts down. Content addressing (CIDs) makes every
record tamper-evident by design. And programmable access control via FVM means
the user's permissions are code on a public network, not a policy someone
could quietly change.

## Tech stack

- **Agent framework:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`)
- **Memory + proofs:** Echo SDK (AES-256-GCM encryption, Filecoin/FVM on-chain registry)
- **Storage:** Synapse SDK (@filoz/synapse-sdk) — Filecoin Onchain Cloud with PDP proofs
- **Smart contract:** EchoMemoryRegistry V3 (UUPS upgradeable, OpenZeppelin v5)
- **Language:** TypeScript / Node 18+
