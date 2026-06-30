/**
 * EchoMemoryClient
 * ------------------------------------------------------------------
 * Wraps the real Echo SDK to persist agent memory snapshots on Filecoin.
 *
 * Flow:
 *   save() -> JSON.stringify snapshot -> AES-256-GCM encrypt -> upload
 *             to Lighthouse (Filecoin) -> write CID + integrity hash
 *             on-chain via EchoMemoryRegistry contract
 *
 *   load() -> read CID from on-chain registry -> fetch from Lighthouse
 *             -> decrypt -> verify integrity hash -> parse JSON
 * ------------------------------------------------------------------
 */

import { ethers } from "ethers";
import { EchoClient, createLighthouseStorage, deriveKeyFromPrivateKey } from "../echo/index.js";

export interface MemorySnapshot {
  sessionId: string;
  summary: string;
  facts: string[];
  lastProvider: "openai" | "anthropic";
  updatedAt: string;
}

export interface MemoryReceipt {
  cid: string;
  txHash: string;
  verified: boolean;
}

export class EchoMemoryClient {
  private client: EchoClient | null = null;
  private encryptionKey: Uint8Array | null = null;
  private walletAddress: string | null = null;
  private readonly opts: {
    privateKey?: string;
    contractAddress?: string;
    rpcUrl?: string;
    lighthouseApiKey?: string;
  };

  constructor(opts: {
    privateKey?: string;
    contractAddress?: string;
    rpcUrl?: string;
    lighthouseApiKey?: string;
  }) {
    this.opts = opts;
  }

  private ensureInitialized(): { client: EchoClient; encryptionKey: Uint8Array } {
    if (this.client && this.encryptionKey) {
      return { client: this.client, encryptionKey: this.encryptionKey };
    }

    const { privateKey, contractAddress, rpcUrl, lighthouseApiKey } = this.opts;
    if (!privateKey || !contractAddress || !rpcUrl || !lighthouseApiKey) {
      throw new Error(
        "Missing Echo config. Set ECHO_PRIVATE_KEY, ECHO_REGISTRY_CONTRACT_ADDRESS, " +
        "ECHO_RPC_URL, and ECHO_LIGHTHOUSE_API_KEY in .env"
      );
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
    const wallet = new ethers.Wallet(privateKey, provider);
    this.walletAddress = wallet.address;

    const storage = createLighthouseStorage(lighthouseApiKey);
    this.client = new EchoClient(rpcUrl, contractAddress, wallet, storage);
    this.encryptionKey = deriveKeyFromPrivateKey(privateKey);

    return { client: this.client, encryptionKey: this.encryptionKey };
  }

  getWalletAddress(): string {
    this.ensureInitialized();
    return this.walletAddress!;
  }

  async save(snapshot: MemorySnapshot): Promise<MemoryReceipt> {
    const { client, encryptionKey } = this.ensureInitialized();

    console.log(`[echo] encrypting + saving snapshot for session ${snapshot.sessionId}...`);
    const result = await client.saveMemory(snapshot, encryptionKey);
    console.log(`[echo] saved to Filecoin. CID=${result.cid} tx=${result.txHash}`);

    return {
      cid: result.cid,
      txHash: result.txHash,
      verified: true,
    };
  }

  async load(sessionId: string): Promise<MemorySnapshot | null> {
    const { client, encryptionKey } = this.ensureInitialized();

    console.log(`[echo] fetching + decrypting snapshot for session ${sessionId}...`);
    const address = this.getWalletAddress();

    try {
      const data = await client.loadMemory(address, encryptionKey);
      if (!data) {
        console.log("[echo] no memory found on-chain.");
        return null;
      }
      console.log("[echo] memory loaded and integrity verified.");
      return data as MemorySnapshot;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("integrity check failed")) {
        console.error("[echo] WARNING: integrity check failed — data may be tampered.");
        throw err;
      }
      console.log(`[echo] load failed (may be empty): ${message}`);
      return null;
    }
  }
}
