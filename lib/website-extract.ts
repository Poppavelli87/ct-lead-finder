import { domainFromWebsite } from "./utils";
import { isRobotsAllowed } from "./robots";

const domainRequestTimes = new Map<string, number>();

async function throttleDomain(domain: string): Promise<void> {
  const now = Date.now();
  const last = domainRequestTimes.get(domain) ?? 0;
  const minInterval = 1000;
  const waitMs = last + minInterval - now;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  domainRequestTimes.set(domain, Date.now());
}

function extractFirstMatch(regex: RegExp, text: string): string | null {
  const match = text.match(regex);
  return match?.[1] ?? match?.[0] ?? null;
}

export async function extractWebsiteSignals(website?: string | null): Promise<{
  phone: string | null;
  email: string | null;
  address: string | null;
}> {
  if (!website) {
    return { phone: null, email: null, address: null };
  }

  try {
    const normalized = website.startsWith("http") ? website : `https://${website}`;
    const url = new URL(normalized);
    const domain = domainFromWebsite(url.href);
    if (!domain) {
      return { phone: null, email: null, address: null };
    }

    await throttleDomain(domain);
    const allowed = await isRobotsAllowed(url);
    if (!allowed) {
      return { phone: null, email: null, address: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CTLeadFinderBot/1.0 (+local)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { phone: null, email: null, address: null };
    }

    const html = await res.text();
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

    const phone = extractFirstMatch(/(\+?1?[\s\-.]?(?:\(\d{3}\)|\d{3})[\s\-.]?\d{3}[\s\-.]?\d{4})/, text);
    const email = extractFirstMatch(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i, text);
    const address = extractFirstMatch(/(\d{1,6}\s+[A-Za-z0-9.'\-\s]+\s(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b[^<]{0,50})/i, text);

    return { phone, email, address };
  } catch {
    return { phone: null, email: null, address: null };
  }
}

