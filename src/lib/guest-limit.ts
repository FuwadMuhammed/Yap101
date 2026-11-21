import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// A small daily allowance of "Write it for me" for guests (not signed in), so one visitor
// can't use up the shared free-model quota. Counted two ways, and the higher count wins:
//  - a signed cookie in their browser (survives across server instances), and
//  - their IP address, kept in memory (catches cleared cookies on the same instance).
// It's a speed bump, not a wall: a determined person can still get around it.

export const GUEST_DAILY_SCRIPTS = 3;
export const GUEST_COOKIE_NAME = "yap101-scripts";

const byIp = new Map<string, { day: string; n: number }>();
const today = () => new Date().toISOString().slice(0, 10);

function secret() {
  return process.env.SCRIPT_LIMIT_SECRET || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || "yap101";
}
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

function readCookie(raw: string | undefined): number {
  const [day, n, sig] = (raw ?? "").split(".");
  if (!day || !n || !sig || day !== today()) return 0;
  const want = Buffer.from(sign(`${day}.${n}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? Number(n) || 0 : 0;
}

export function clientIp(request: Request) {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** How many scripts this guest has had today. */
export function guestUsed(ip: string, cookie: string | undefined) {
  const mem = byIp.get(ip);
  return Math.max(readCookie(cookie), mem?.day === today() ? mem.n : 0);
}

/** Record one more script; returns the new cookie value to set. */
export function recordGuestScript(ip: string, used: number) {
  const day = today();
  const n = used + 1;
  if (byIp.size > 5000) byIp.clear(); // keep memory bounded on a long-lived instance
  byIp.set(ip, { day, n });
  return `${day}.${n}.${sign(`${day}.${n}`)}`;
}
