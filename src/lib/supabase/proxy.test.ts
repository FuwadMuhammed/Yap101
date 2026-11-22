import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The middleware with Supabase faked: `signedIn` decides what getClaims returns.
const h = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/lib/data/mode", () => ({ envDemo: false, GUEST_COOKIE: "yap101-guest" }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: h.signedIn ? { claims: { sub: "u1" } } : null }) } }) }));
const { updateSession } = await import("./proxy");

const req = (path: string, cookies: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } });

beforeEach(() => {
  h.signedIn = false;
});

describe("middleware: guest cookie vs a real session (BUG-27)", () => {
  it("a signed-in user's leftover guest cookie is expired, and the request goes through", async () => {
    h.signedIn = true;
    const res = await updateSession(req("/record?prompt=2", { "yap101-guest": "1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/yap101-guest=;.*Max-Age=0/i);
  });

  it("a guest with no account still gets in, cookie kept", async () => {
    const res = await updateSession(req("/record?prompt=2", { "yap101-guest": "1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/yap101-guest=/);
  });

  it("no session and no guest cookie: pages redirect, API calls get JSON 401", async () => {
    expect((await updateSession(req("/record"))).status).toBe(307);
    const api = await updateSession(req("/api/script"));
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "unauthorized" });
  });
});
