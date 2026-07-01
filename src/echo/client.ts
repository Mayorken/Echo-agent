/**
 * EchoClient — TypeScript port of the core Echo SDK (echo-sdk.js).
 * Talks to the EchoMemoryRegistry contract on FEVM + Lighthouse storage.
 */

import { ethers } from "ethers";
import * as fs from "node:fs";
import * as path from "node:path";
import { encrypt, decrypt } from "./crypto.js";
import type { StorageAdapter } from "./storage.js";
import abi from "./abi.json" with { type: "json" };

const CID_CACHE_PATH = path.resolve(process.cwd(), ".echo-cid-cache.json");

export class EchoClient {
  private contract: ethers.Contract;
  private readContract: ethers.Contract;
  private signer: ethers.Signer;
  private storage: StorageAdapter;
  private signerAddress: string | null = null;

  constructor(
    rpcUrl: string,
    contractAddress: string,
    signer: ethers.Signer,
    storage: StorageAdapter,
  ) {
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
    this.signer = signer;
    this.contract = new ethers.Contract(contractAddress, abi, signer);
    this.readContract = new ethers.Contract(contractAddress, abi, provider);
    this.storage = storage;
  }

  async getSignerAddress(): Promise<string> {
    if (!this.signerAddress) {
      this.signerAddress = await this.signer.getAddress();
    }
    return this.signerAddress;
  }

  async saveMemory(memoryObject: unknown, encryptionKey: Uint8Array): Promise<{ cid: string; integrityHash: string; txHash: string }> {
    const plaintext = new TextEncoder().encode(JSON.stringify(memoryObject));
    const integrityHash = ethers.keccak256(plaintext);

    const encrypted = await encrypt(plaintext, encryptionKey);
    const cid = await this.storage.put(encrypted);

    let txHash = "";
    try {
      const tx = await this.contract.updateMemory(cid, integrityHash);
      const receipt = await tx.wait();
      txHash = receipt.hash;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[echo] on-chain write skipped (wallet may need gas): ${msg.slice(0, 120)}`);
      console.log(`[echo] data is safely stored on Filecoin (CID=${cid}). On-chain anchor will work once wallet is funded.`);
    }

    const address = await this.getSignerAddress();
    this.writeCidCache(address, cid, integrityHash);

    return { cid, integrityHash, txHash };
  }

  async loadMemory(userAddress: string, decryptionKey: Uint8Array): Promise<unknown | null> {
    let cid = "";
    let integrityHash = "";

    try {
      const result = await this.readContract.getMemory(userAddress);
      cid = result[0];
      integrityHash = result[1];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[echo] on-chain read failed: ${msg.slice(0, 120)}`);
    }

    if (!cid) {
      const cached = this.readCidCache(userAddress);
      if (cached) {
        console.log("[echo] using local CID cache (on-chain unavailable).");
        cid = cached.cid;
        integrityHash = cached.integrityHash;
      } else {
        return null;
      }
    }

    const encrypted = await this.storage.get(cid);
    const plaintext = await decrypt(encrypted, decryptionKey);

    const computedHash = ethers.keccak256(plaintext);
    if (integrityHash && computedHash !== integrityHash) {
      throw new Error("Memory integrity check failed: retrieved data does not match on-chain hash");
    }
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  /**
   * Encrypt and upload data to Filecoin without writing on-chain.
   * Returns the CID and integrity hash (content-addressed = tamper-evident).
   */
  async storeEncrypted(data: unknown, encryptionKey: Uint8Array): Promise<{ cid: string; integrityHash: string }> {
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const integrityHash = ethers.keccak256(plaintext);
    const encrypted = await encrypt(plaintext, encryptionKey);
    const cid = await this.storage.put(encrypted);
    return { cid, integrityHash };
  }

  private writeCidCache(address: string, cid: string, integrityHash: string): void {
    try {
      let cache: Record<string, { cid: string; integrityHash: string }> = {};
      if (fs.existsSync(CID_CACHE_PATH)) {
        cache = JSON.parse(fs.readFileSync(CID_CACHE_PATH, "utf-8"));
      }
      cache[address.toLowerCase()] = { cid, integrityHash };
      fs.writeFileSync(CID_CACHE_PATH, JSON.stringify(cache, null, 2));
    } catch {
      // non-fatal
    }
  }

  private readCidCache(address: string): { cid: string; integrityHash: string } | null {
    try {
      if (!fs.existsSync(CID_CACHE_PATH)) return null;
      const cache = JSON.parse(fs.readFileSync(CID_CACHE_PATH, "utf-8"));
      return cache[address.toLowerCase()] ?? null;
    } catch {
      return null;
    }
  }

  async grantAccess(appAddress: string): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.grantAccess(appAddress);
    return tx.wait();
  }

  async revokeAccess(appAddress: string): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.revokeAccess(appAddress);
    return tx.wait();
  }
}
