import crypto from "crypto";

export function getMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function isTruthy(value: string | null | undefined): boolean {
  if (!value) return false;
  const lowered = value.trim().toLowerCase();
  return lowered === "1" || lowered === "true" || lowered === "yes" || lowered === "on";
}

export function normalizePhone(value?: string | null): string {
  return (value ?? "").replace(/[^0-9]/g, "");
}

export function normalizeZip(value?: string | null): string {
  return (value ?? "").trim().slice(0, 5);
}

export function normalizeString(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function domainFromWebsite(website?: string | null): string | null {
  if (!website) return null;
  try {
    const withProto = website.startsWith("http") ? website : `https://${website}`;
    const url = new URL(withProto);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function hashRequest(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function sanitizeExcelCell(value: unknown): string {
  const asText = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(asText)) {
    return `'${asText}`;
  }
  return asText;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

