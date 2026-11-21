// A tiny stand-in for Supabase (Auth + PostgREST), enough for the record screen, the script
// editor and /api/script to run in their real signed-in mode. Not a general mock.
// Usage: node --experimental-strip-types qa-report/scripts/mock-supabase.mjs 54321
// Control endpoints (for tests): POST /__mock/profile/<userId> (JSON patch), POST /__mock/auth-down (true/false),
// POST /__mock/revoke/<token>, GET /__mock/log
import http from "node:http";
import { buildTrack } from "../../src/lib/curriculum.ts";

const PORT = Number(process.argv[2] ?? 54321);
const start = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const profiles = {
  "11111111-1111-1111-1111-111111111111": { id: "11111111-1111-1111-1111-111111111111", display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" },
  "22222222-2222-2222-2222-222222222222": { id: "22222222-2222-2222-2222-222222222222", display_name: "Alex", niche: "tech", platform: "youtube", confidence: 4, level: "pro", goal: "hooks", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "evening" },
  "33333333-3333-3333-3333-333333333333": { id: "33333333-3333-3333-3333-333333333333", display_name: "Priya", niche: "food,travel", platform: "instagram", confidence: 3, level: "intermediate", goal: "storytelling", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "midday" },
};
const prompts = ["beginner", "intermediate", "pro"].flatMap((l) => ["confidence", "storytelling", "clarity", "on_camera", "hooks"].flatMap((g) => buildTrack(l, g)));
const revoked = new Set();
let authDown = false;
let dbDown = false;
let authDelayMs = 0;
const refreshes = [];
const log = [];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
/** HS256-looking token; supabase-js verifies HS tokens by calling /auth/v1/user, which we answer. */
export const tokenFor = (id, ttl = 86400) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + ttl, email: `${id.slice(0, 4)}@test.local`, n: Math.random() })}.sig`;
const userOf = (req) => {
  const t = (req.headers.authorization ?? "").replace(/^Bearer\s+/, "");
  if (!t || revoked.has(t) || t.split(".").length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
    if (claims.exp < Date.now() / 1000) return null; // expired access token
    const sub = claims.sub;
    return profiles[sub] ? { id: sub, aud: "authenticated", role: "authenticated", email: `${sub.slice(0, 4)}@test.local`, app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" } : null;
  } catch { return null; }
};

function send(res, req, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": req.headers.origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS", "access-control-expose-headers": "content-range", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let body = "";
  for await (const c of req) body += c;
  const user = userOf(req);
  log.push({ t: new Date().toISOString(), method: req.method, path: url.pathname + url.search, user: user?.id ?? null });
  if (req.method === "OPTIONS") return send(res, req, 204);

  // --- test controls ---
  if (url.pathname === "/__mock/log") return send(res, req, 200, log);
  if (url.pathname === "/__mock/auth-down") { authDown = JSON.parse(body); return send(res, req, 200, { authDown }); }
  if (url.pathname.startsWith("/__mock/revoke/")) { revoked.add(decodeURIComponent(url.pathname.split("/").pop())); return send(res, req, 200, {}); }
  if (url.pathname.startsWith("/__mock/profile/")) { Object.assign(profiles[url.pathname.split("/").pop()], JSON.parse(body)); return send(res, req, 200, {}); }
  if (url.pathname === "/__mock/token") return send(res, req, 200, { token: tokenFor(url.searchParams.get("id"), Number(url.searchParams.get("ttl") ?? 86400)) });
  if (url.pathname === "/__mock/db-down") { dbDown = JSON.parse(body); return send(res, req, 200, { dbDown }); }
  if (url.pathname === "/__mock/auth-delay") { authDelayMs = JSON.parse(body); return send(res, req, 200, { authDelayMs }); }
  if (url.pathname === "/__mock/refreshes") return send(res, req, 200, refreshes);

  // --- auth ---
  if (url.pathname === "/auth/v1/user") {
    if (authDelayMs) await new Promise((r) => setTimeout(r, authDelayMs));
    if (authDown) return send(res, req, 500, { message: "auth down" });
    return user ? send(res, req, 200, user) : send(res, req, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (url.pathname === "/auth/v1/logout") return send(res, req, 204);
  if (url.pathname === "/auth/v1/token") {
    // Refresh: "r-<userId>" tokens are valid; each refresh issues a fresh access token.
    let rt = "";
    try { rt = JSON.parse(body).refresh_token ?? ""; } catch {}
    const id = rt.startsWith("r-") ? rt.slice(2) : null;
    refreshes.push({ t: new Date().toISOString(), id, ok: Boolean(id && profiles[id]) });
    if (!id || !profiles[id]) return send(res, req, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
    const access_token = tokenFor(id);
    return send(res, req, 200, { access_token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r-" + id, user: { id, aud: "authenticated", role: "authenticated", email: `${id.slice(0, 4)}@test.local`, app_metadata: {}, user_metadata: {} } });
  }

  // --- PostgREST ---
  const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?(\w+)/);
  if (m && dbDown) return send(res, req, 503, { message: "database unavailable" });
  if (m) {
    const object = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    if (m[1]) return send(res, req, 200, m[2] === "current_streak" ? 0 : null);
    if (!user) return send(res, req, object ? 406 : 200, object ? { message: "no rows" } : []);
    const filters = [...url.searchParams.entries()].filter(([k, v]) => k !== "select" && k !== "order" && v.startsWith("eq."));
    const match = (row) => filters.every(([k, v]) => String(row[k]) === v.slice(3));
    let rows = [];
    if (m[2] === "profiles") rows = Object.values(profiles).filter((p) => p.id === user.id).filter(match);
    else if (m[2] === "prompts") rows = prompts.filter(match).map((p) => ({ ...p, active: true }));
    else rows = []; // yaps, feedback: a fresh account
    if (req.method === "HEAD") return send(res, req, 200, undefined, { "content-range": `*/${rows.length}` });
    if (object) return rows.length ? send(res, req, 200, rows[0]) : send(res, req, 406, { code: "PGRST116", message: "no rows" });
    return send(res, req, 200, rows, { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
  }
  send(res, req, 404, { message: "not mocked" });
});
server.listen(PORT, () => console.log(`mock supabase on ${PORT}`));
