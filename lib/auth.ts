import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { getAdminPassword } from "./env";

const COOKIE_NAME = "ctlf_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
type AuthUser = { id: string; username: string };

type SessionPayload = {
  sub: string;
  username: string;
  exp: number;
};

function sessionSecret(): Buffer {
  const base = process.env.APP_ENCRYPTION_KEY ?? getAdminPassword();
  return crypto.createHash("sha256").update(`session:${base}`).digest();
}

function base64UrlEncode(input: Buffer | string): string {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return value.toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(value: string): string {
  return base64UrlEncode(crypto.createHmac("sha256", sessionSecret()).update(value).digest());
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function buildSessionToken(user: AuthUser): string {
  const payload: SessionPayload = {
    sub: user.id,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = sign(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload?.sub || !payload?.username || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setAuthSession(user: AuthUser): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, buildSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAuthSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const payload = parseSessionToken(token);
  if (!payload) return null;

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, username: true },
  });

  return user;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function authenticateAdmin(username: string, password: string): Promise<AuthUser | null> {
  const user = await db.user.findUnique({ where: { username } });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, username: user.username };
}

export async function bootstrapAdminIfMissing(): Promise<void> {
  const existing = await db.user.findFirst({ where: { username: "admin" } });
  if (existing) return;

  const passwordHash = await bcrypt.hash(getAdminPassword(), 12);
  await db.user.create({
    data: {
      username: "admin",
      passwordHash,
    },
  });
}

