/**
 * Storage adapters for Filecoin.
 * - Synapse SDK (Filecoin Onchain Cloud) — recommended
 * - Lighthouse — legacy fallback
 *
 * Both implement the same put(bytes)->cid / get(cid)->bytes interface.
 */

import { Synapse } from "@filoz/synapse-sdk";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export interface StorageAdapter {
  put(bytes: Uint8Array): Promise<string>;
  get(cid: string): Promise<Uint8Array>;
}

/**
 * Synapse SDK adapter for Filecoin Onchain Cloud.
 * Uses the official Filecoin storage SDK with PDP (Proof of Data Possession).
 */
export function createSynapseStorage(privateKey: string): StorageAdapter {
  const account = privateKeyToAccount(privateKey as Hex);
  const synapse = Synapse.create({
    account,
    source: "echo-agent",
  });

  let prepared = false;

  return {
    async put(bytes: Uint8Array): Promise<string> {
      try {
        if (!prepared) {
          const prep = await synapse.storage.prepare({
            dataSize: BigInt(bytes.byteLength),
          });
          if (prep.transaction) {
            console.log("[synapse] preparing storage account (deposit + approval)...");
            const { hash } = await prep.transaction.execute();
            console.log(`[synapse] account prepared, tx: ${hash}`);
          }
          prepared = true;
        }

        const result = await synapse.storage.upload(bytes);
        const cid = result.pieceCid.toString();
        console.log(`[synapse] uploaded to Filecoin. PieceCID=${cid}, copies=${result.copies.length}`);
        if (!result.complete) {
          console.warn(`[synapse] ${result.failedAttempts.length} copy attempt(s) failed`);
        }
        return cid;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("actor not found")) {
          throw new Error(
            "Wallet not funded. Send tFIL to your wallet from https://faucet.calibnet.chainsafe-fil.io " +
            "and tUSDFC from https://forest-explorer.chainsafe.dev/faucet/calibration before using Synapse storage."
          );
        }
        throw err;
      }
    },

    async get(cid: string): Promise<Uint8Array> {
      const bytes = await synapse.storage.download({ pieceCid: cid });
      return new Uint8Array(bytes);
    },
  };
}

/**
 * Lighthouse storage adapter (legacy fallback).
 */
export function createLighthouseStorage(apiKey: string, options?: { gateway?: string }): StorageAdapter {
  const gateway = options?.gateway ?? "https://gateway.lighthouse.storage/ipfs";

  return {
    async put(bytes: Uint8Array): Promise<string> {
      const { default: lighthouse } = await import("@lighthouse-web3/sdk");
      const buffer = Buffer.from(bytes);
      const response = await (lighthouse as any).uploadBuffer(buffer, apiKey);
      if (!response?.data?.Hash) {
        throw new Error("Lighthouse upload failed: unexpected response");
      }
      return response.data.Hash as string;
    },

    async get(cid: string): Promise<Uint8Array> {
      if (!cid || typeof cid !== "string" || !/^[a-zA-Z0-9]+$/.test(cid)) {
        throw new Error("Invalid CID format");
      }
      const url = `${gateway}/${cid}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to retrieve CID ${cid}: HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    },
  };
}
