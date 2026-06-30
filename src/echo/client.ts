/**
 * EchoClient — TypeScript port of the core Echo SDK (echo-sdk.js).
 * Talks to the EchoMemoryRegistry contract on FEVM + Lighthouse storage.
 */

import { ethers } from "ethers";
import { encrypt, decrypt } from "./crypto.js";
import type { StorageAdapter } from "./storage.js";
import abi from "./abi.json" with { type: "json" };

export class EchoClient {
  private contract: ethers.Contract;
  private storage: StorageAdapter;
  private signerAddress: string | null = null;

  constructor(
    rpcUrl: string,
    contractAddress: string,
    signer: ethers.Signer,
    storage: StorageAdapter,
  ) {
    const runner = new ethers.NonceManager(signer);
    this.contract = new ethers.Contract(contractAddress, abi, runner);
    this.storage = storage;
  }

  async getSignerAddress(): Promise<string> {
    if (!this.signerAddress) {
      this.signerAddress = await (this.contract.runner as ethers.NonceManager).getAddress();
    }
    return this.signerAddress;
  }

  async saveMemory(memoryObject: unknown, encryptionKey: Uint8Array): Promise<{ cid: string; integrityHash: string; txHash: string }> {
    const plaintext = new TextEncoder().encode(JSON.stringify(memoryObject));
    const integrityHash = ethers.keccak256(plaintext);

    const encrypted = await encrypt(plaintext, encryptionKey);
    const cid = await this.storage.put(encrypted);

    const tx = await this.contract.updateMemory(cid, integrityHash);
    const receipt = await tx.wait();
    return { cid, integrityHash, txHash: receipt.hash };
  }

  async loadMemory(userAddress: string, decryptionKey: Uint8Array): Promise<unknown | null> {
    const [cid, integrityHash] = await this.contract.getMemory(userAddress);
    if (!cid) return null;

    const encrypted = await this.storage.get(cid);
    const plaintext = await decrypt(encrypted, decryptionKey);

    const computedHash = ethers.keccak256(plaintext);
    if (computedHash !== integrityHash) {
      throw new Error("Memory integrity check failed: retrieved data does not match on-chain hash");
    }
    return JSON.parse(new TextDecoder().decode(plaintext));
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
