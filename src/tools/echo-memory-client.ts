/**
 * EchoMemoryClient
 * ------------------------------------------------------------------
 * Wraps the Synapse SDK (github.com/FilOzone/synapse-sdk) to persist
 * agent memory snapshots on Filecoin Onchain Cloud (Warm Storage).
 *
 * Snapshots are AES-256-GCM encrypted client-side before upload, so
 * Synapse's storage providers only ever see ciphertext. Synapse hands
 * back a CommP per upload; we keep a small local pointer file
 * (sessionId -> latest CommP) as a stand-in for the on-chain
 * registry contract (EchoContextRegistry.sol) until that piece is
 * wired in — everything else (encryption, storage, retrieval) is real.
 * ------------------------------------------------------------------
 */

import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Synapse } from "@filoz/synapse-sdk";

export interface MemorySnapshot {
  sessionId: string;
  summary: string;          // human-readable rolling summary of the conversation
  facts: string[];          // discrete facts/preferences the agent has learned
  lastProvider: "gemini" | "groq";
  updatedAt: string;        // ISO timestamp
}

export interface MemoryReceipt {
  commp: string;      // Filecoin CommP (piece commitment) returned by Synapse upload
  verified: boolean;
}

const POINTER_FILE = path.resolve(process.cwd(), ".data", "session-pointers.json");

export class EchoMemoryClient {
  private synapse?: Synapse;

  constructor(private opts: {
    privateKey?: string;
    rpcUrl?: string;
  }) {}

  private getSynapse(): Synapse {
    if (!this.synapse) {
      if (!this.opts.privateKey) {
        throw new Error("SYNAPSE_PRIVATE_KEY is required to talk to Filecoin Onchain Cloud.");
      }
      const account = privateKeyToAccount(this.opts.privateKey as Hex);
      this.synapse = Synapse.create({
        account,
        transport: this.opts.rpcUrl ? http(this.opts.rpcUrl) : undefined,
        source: "echo-agent",
      });
    }
    return this.synapse;
  }

  /**
   * Encrypts and persists a memory snapshot via Synapse. Returns a
   * receipt (PieceCID) the agent/demo can display and use to recall
   * the snapshot later.
   */
  async save(snapshot: MemorySnapshot): Promise<MemoryReceipt> {
    const synapse = this.getSynapse();
    const plaintext = Buffer.from(JSON.stringify(snapshot), "utf8");
    const ciphertext = encrypt(plaintext, this.encryptionKey());

    console.log(`[synapse] uploading encrypted snapshot for session ${snapshot.sessionId}...`);
    const result = await this.uploadWithFallback(synapse, ciphertext);
    console.log(`[synapse] uploaded. PieceCID=${result.pieceCid}`);

    await this.setPointer(snapshot.sessionId, String(result.pieceCid));

    return { commp: String(result.pieceCid), verified: true };
  }

  /**
   * Synapse's default upload path requires one of a small "endorsed"
   * provider set to pass a live health check. On calibration testnet
   * those endorsed providers are frequently down, so on that specific
   * failure we retry against other active providers in turn (some listed
   * providers are unreliable dev/test nodes, so one candidate isn't enough).
   */
  private async uploadWithFallback(synapse: Synapse, data: Uint8Array) {
    try {
      return await synapse.storage.upload(data);
    } catch (err) {
      if (!isRecoverableProviderError(err)) throw err;

      console.log("[synapse] endorsed providers unhealthy, trying other active providers...");
      const active = await synapse.providers.getAllActiveProviders();
      let lastErr = err;

      for (const provider of active.filter((p) => p.isActive)) {
        try {
          console.log(`[synapse] trying provider ${provider.id} (${provider.name})...`);
          return await synapse.storage.upload(data, { providerIds: [provider.id] });
        } catch (candidateErr) {
          lastErr = candidateErr;
        }
      }
      throw lastErr;
    }
  }

  /**
   * Fetches and decrypts the latest memory snapshot for a session.
   * This is what gets called when the agent "wakes up" on a new
   * provider with no local state.
   */
  async load(sessionId: string): Promise<MemorySnapshot | null> {
    const commp = await this.getPointer(sessionId);
    if (!commp) return null;

    const synapse = this.getSynapse();
    console.log(`[synapse] downloading snapshot ${commp} for session ${sessionId}...`);
    const ciphertext = await synapse.storage.download({ pieceCid: commp });
    const plaintext = decrypt(Buffer.from(ciphertext), this.encryptionKey());

    return JSON.parse(plaintext.toString("utf8")) as MemorySnapshot;
  }

  private encryptionKey(): Buffer {
    const secret = process.env.ECHO_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error("ECHO_ENCRYPTION_KEY is required to encrypt/decrypt memory snapshots.");
    }
    // Derive a 32-byte AES-256 key from whatever passphrase the user configured.
    return createHash("sha256").update(secret).digest();
  }

  private async getPointer(sessionId: string): Promise<string | undefined> {
    const pointers = await this.readPointers();
    return pointers[sessionId];
  }

  private async setPointer(sessionId: string, commp: string): Promise<void> {
    const pointers = await this.readPointers();
    pointers[sessionId] = commp;
    await mkdir(path.dirname(POINTER_FILE), { recursive: true });
    await writeFile(POINTER_FILE, JSON.stringify(pointers, null, 2), "utf8");
  }

  private async readPointers(): Promise<Record<string, string>> {
    try {
      const raw = await readFile(POINTER_FILE, "utf8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}

function isRecoverableProviderError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("No endorsed provider available") ||
    message.includes("Failed to store on primary provider") ||
    message.includes("Network request failed")
  );
}

function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Layout: iv (12) | authTag (16) | ciphertext
  return Buffer.concat([iv, authTag, ciphertext]);
}

function decrypt(payload: Buffer, key: Buffer): Buffer {
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
