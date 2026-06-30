/**
 * Lighthouse storage adapter for Filecoin, ported from Echo's lib/storage.js.
 * Implements the put(bytes)->cid / get(cid)->bytes interface.
 */

import lighthouse from "@lighthouse-web3/sdk";

const DEFAULT_GATEWAY = "https://gateway.lighthouse.storage/ipfs";

export interface StorageAdapter {
  put(bytes: Uint8Array): Promise<string>;
  get(cid: string): Promise<Uint8Array>;
}

export function createLighthouseStorage(apiKey: string, options?: { gateway?: string }): StorageAdapter {
  if (!apiKey) throw new Error("Lighthouse API key is required");
  const gateway = options?.gateway ?? DEFAULT_GATEWAY;

  return {
    async put(bytes: Uint8Array): Promise<string> {
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
