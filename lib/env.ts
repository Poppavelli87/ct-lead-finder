import { isTruthy } from "./utils";

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "change-me-admin-password";
}

export function isMockGoogleEnabled(): boolean {
  return isTruthy(process.env.MOCK_GOOGLE ?? "true");
}

export function hasValidEncryptionKey(): boolean {
  const key = process.env.APP_ENCRYPTION_KEY;
  return Boolean(key && key.length >= 32);
}

export function encryptionWarningMessage(): string | null {
  if (hasValidEncryptionKey()) return null;
  return "APP_ENCRYPTION_KEY is missing or shorter than 32 chars. Secret storage is disabled; app remains in mock-safe mode.";
}

export const DEFAULT_ADMIN_USERNAME = "admin";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

