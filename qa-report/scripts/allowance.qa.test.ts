// Guest allowance + AI-provider failure harness. Real /api/script route code; only the AI call,
// Supabase auth and the cookie jar are faked. Each test prints what it observed.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ writeScript: vi.fn(), cookie: undefined as string | undefined }));
vi.mock("@/lib/ai-script", async () => {
  class AiBusyError extends Error {}
  class AiKeyError extends Error {}
  return { AiBusyError, AiKeyError, aiProvider: () => "openrouter", writeScript: h.writeScript };
});
vi.mock("@/lib/data/mode", () => ({ envDemo: false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (h.cookie ? { value: h.cookie } : undefined) }) }));

const load = async () => (await import("@/app/api/script/route")).POST;
const body = JSON.stringify({ mode: "suggest", title: "Introduce yourself" });
const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/script", { method: "POST", headers, body });
const slowScript = () => new Promise((r) => setTimeout(() => r({ kind: "script", lines: ["Hi."], message: "" }), 50));
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0].split("=").slice(1).join("=");

beforeEach(() => {
  vi.resetModules(); // a fresh module = a fresh server instance (empty per-IP memory)
  h.writeScript.mockReset();
  h.cookie = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("guest allowance (3 a day)", () => {
  it("R1 baseline: same IP, cookie carried, 4th request is blocked", async () => {
    const POST = await load();
    h.writeScript.mockImplementation(slowScript);
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await POST(req({ "x-real-ip": "10.1.1.1" }));
      statuses.push(res.status);
      h.cookie = cookieOf(res) ?? h.cookie;
    }
    console.log("R1 statuses", statuses);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("R2 race: 10 simultaneous requests from one fresh guest", async () => {
    const POST = await load();
    h.writeScript.mockImplementation(slowScript);
    const res = await Promise.all(Array.from({ length: 10 }, () => POST(req({ "x-real-ip": "10.2.2.2" }))));
    const ok = res.filter((r) => r.status === 200).length;
    console.log("R2 successes out of 10 concurrent:", ok, "AI calls made:", h.writeScript.mock.calls.length);
    expect.soft(ok, "only 3 should succeed").toBe(3);
  });

  it("R3 spoofed IP header + no cookie: unlimited", async () => {
    const POST = await load();
    h.writeScript.mockImplementation(slowScript);
    let ok = 0;
    for (let i = 0; i < 10; i++) if ((await POST(req({ "x-forwarded-for": `172.20.0.${i}` }))).status === 200) ok++;
    console.log("R3 successes with a new X-Forwarded-For each time:", ok, "of 10");
    expect.soft(ok, "only 3 should succeed").toBe(3);
  });

  it("R4 cookie dropped, same IP, new server instance: allowance resets", async () => {
    let POST = await load();
    h.writeScript.mockImplementation(slowScript);
    for (let i = 0; i < 3; i++) await POST(req({ "x-real-ip": "10.4.4.4" }));
    const blocked = (await POST(req({ "x-real-ip": "10.4.4.4" }))).status;
    vi.resetModules();
    POST = await load();
    const afterNewInstance = (await POST(req({ "x-real-ip": "10.4.4.4" }))).status;
    console.log("R4 same instance 4th:", blocked, "| new instance, no cookie:", afterNewInstance);
    expect(blocked).toBe(429);
    expect.soft(afterNewInstance, "should still be blocked").toBe(429);
  });

  it("R5 a forged cookie is ignored (signature check)", async () => {
    const POST = await load();
    h.writeScript.mockImplementation(slowScript);
    const day = new Date().toISOString().slice(0, 10);
    h.cookie = `${day}.0.forged-signature`;
    const res = await POST(req({ "x-real-ip": "10.5.5.5" }));
    console.log("R5 forged cookie ->", res.status, cookieOf(res)?.split(".").slice(0, 2).join("."));
    expect(res.status).toBe(200);
  });

  it("R6 a valid exhausted cookie blocks even from a new IP", async () => {
    let POST = await load();
    h.writeScript.mockImplementation(slowScript);
    for (let i = 0; i < 3; i++) h.cookie = cookieOf(await POST(req({ "x-real-ip": "10.6.6.6" })));
    vi.resetModules();
    POST = await load();
    const res = await POST(req({ "x-real-ip": "10.9.9.9" }));
    console.log("R6 exhausted cookie, new IP + instance ->", res.status);
    expect(res.status).toBe(429);
  });

  it("R7 suggest and polish share one allowance", async () => {
    const POST = await load();
    h.writeScript.mockImplementation(slowScript);
    const polish = JSON.stringify({ mode: "polish", title: "X", draft: "hi I am Sam and I make videos" });
    const s = [];
    for (const b of [body, polish, body, polish]) {
      const res = await POST(new Request("http://localhost/api/script", { method: "POST", headers: { "x-real-ip": "10.7.7.7" }, body: b }));
      s.push(res.status);
      h.cookie = cookieOf(res) ?? h.cookie;
    }
    console.log("R7 suggest/polish/suggest/polish:", s);
    expect(s).toEqual([200, 200, 200, 429]);
  });

  it("R8 failed AI calls don't use the allowance", async () => {
    const POST = await load();
    h.writeScript.mockRejectedValue(new Error("upstream down"));
    const s = [];
    for (let i = 0; i < 5; i++) s.push((await POST(req({ "x-real-ip": "10.8.8.8" }))).status);
    h.writeScript.mockImplementation(slowScript);
    const after = (await POST(req({ "x-real-ip": "10.8.8.8" }))).status;
    console.log("R8 5 failures:", s, "then success:", after);
    expect(after).toBe(200);
  });

  it("R9 AI timeout (abort) maps to 502 upstream, JSON body", async () => {
    const POST = await load();
    h.writeScript.mockRejectedValue(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    const res = await POST(req({ "x-real-ip": "10.10.10.10" }));
    console.log("R9 timeout ->", res.status, await res.text());
    expect(res.status).toBe(502);
  });
});
