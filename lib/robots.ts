const robotsCache = new Map<string, { checkedAt: number; allowsRoot: boolean }>();
const CACHE_TTL_MS = 1000 * 60 * 30;

function parseRobotsAllowsRoot(content: string): boolean {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  let applies = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!line || lower.startsWith("#")) continue;

    if (lower.startsWith("user-agent:")) {
      const value = line.split(":").slice(1).join(":").trim();
      applies = value === "*";
      continue;
    }

    if (applies && lower.startsWith("disallow:")) {
      const value = line.split(":").slice(1).join(":").trim();
      if (value === "/") {
        return false;
      }
    }
  }

  return true;
}

export async function isRobotsAllowed(url: URL): Promise<boolean> {
  const domain = url.hostname.toLowerCase();
  const now = Date.now();
  const cached = robotsCache.get(domain);
  if (cached && now - cached.checkedAt < CACHE_TTL_MS) {
    return cached.allowsRoot;
  }

  const robotsUrl = `${url.protocol}//${url.hostname}/robots.txt`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(robotsUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CTLeadFinderBot/1.0 (+local)",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      robotsCache.set(domain, { checkedAt: now, allowsRoot: true });
      return true;
    }

    const text = await res.text();
    const allowsRoot = parseRobotsAllowsRoot(text);
    robotsCache.set(domain, { checkedAt: now, allowsRoot });
    return allowsRoot;
  } catch {
    robotsCache.set(domain, { checkedAt: now, allowsRoot: true });
    return true;
  }
}

