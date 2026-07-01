/**
 * AES-256-GCM encryption for Echo context, ported from Echo's lib/crypto.js.
 * Uses Node's built-in crypto module (this runs server-side in the agent).
 */

import crypto from "node:crypto";

const IV_LENGTH = 12;

export async function generateKey(): Promise<Uint8Array> {
  return new Uint8Array(crypto.randomBytes(32));
}

export function deriveKeyFromPrivateKey(privateKey: string): Uint8Array {
  const hash = crypto.createHash("sha256").update(privateKey).update("echo-agent-memory").digest();
  return new Uint8Array(hash);
}

export async function encrypt(plaintext: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  if (!keyBytes || keyBytes.length !== 32) {
    throw new Error("Encryption key must be exactly 32 bytes");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyBytes), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return concat(new Uint8Array(iv), new Uint8Array(ciphertext), new Uint8Array(tag));
}

export async function decrypt(packed: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  if (!keyBytes || keyBytes.length !== 32) {
    throw new Error("Decryption key must be exactly 32 bytes");
  }
  if (!packed || packed.length < IV_LENGTH + 16) {
    throw new Error("Ciphertext too short (missing IV or auth tag)");
  }
  const iv = packed.slice(0, IV_LENGTH);
  const tag = packed.slice(packed.length - 16);
  const ciphertext = packed.slice(IV_LENGTH, packed.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyBytes), Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  return new Uint8Array(plaintext);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
