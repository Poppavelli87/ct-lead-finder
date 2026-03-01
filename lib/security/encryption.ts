import crypto from "crypto";
import { hasValidEncryptionKey } from "../env";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function resolveKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY is missing or too short.");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function canEncryptSecrets(): boolean {
  return hasValidEncryptionKey();
}

export function encryptSecret(secret: string): string {
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(secretEncrypted?: string | null): string | null {
  if (!secretEncrypted) return null;
  if (!canEncryptSecrets()) return null;
  const payload = Buffer.from(secretEncrypted, "base64");
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", resolveKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

