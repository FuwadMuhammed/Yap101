// Phase 2 load test of /api/script on the Supabase-mode build (no AI key, so the route answers
// 503 "setup" right after the middleware's auth check — measures our stack, not the AI).
// Usage: node qa-report/scripts/load.mjs http://localhost:3127 http://127.0.0.1:54321
const [BASE, SB] = [process.argv[2], process.argv[3]];
const SAM = "11111111-1111-1111-1111-111111111111";
const { token } = await (await fetch(`${SB}/__mock/token?id=${SAM}`)).json();
const session = { access_token: token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r-" + SAM, user: { id: SAM, aud: "authenticated", role: "authenticated" } };
const cookie = "sb-127-auth-token=base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const body = JSON.stringify({ mode: "polish", title: "Introduce yourself", draft: "um so I make fitness videos for busy parents every morning", points: ["a", "b"], seconds: 30, previous: ["x".repeat(500)] });
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];

async function level(name, conc, total, headers) {
  const times = [], codes = {};
  let next = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < total) {
      next++;
      const s = performance.now();
      try {
        const r = await fetch(`${BASE}/api/script`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
        await r.text();
        codes[r.status] = (codes[r.status] ?? 0) + 1;
      } catch { codes.network = (codes.network ?? 0) + 1; }
      times.push(performance.now() - s);
    }
  }));
  const wall = (performance.now() - t0) / 1000;
  times.sort((a, b) => a - b);
  const r = { name, concurrency: conc, requests: total, codes, p50_ms: +pct(times, 50).toFixed(1), p95_ms: +pct(times, 95).toFixed(1), p99_ms: +pct(times, 99).toFixed(1), max_ms: +times.at(-1).toFixed(1), rps: +(total / wall).toFixed(1) };
  process.stderr.write(JSON.stringify(r) + "\n");
  return r;
}
const results = [];
for (const c of [1, 10, 25, 50]) results.push(await level("signed-in", c, c === 1 ? 200 : 500, { cookie }));
results.push(await level("no session (rejected by middleware)", 50, 500, {}));
console.log(JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
