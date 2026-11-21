// API test harness for POST /api/script. No AI quota is used against the demo server (no key).
// Usage: node qa-report/scripts/api-tests.mjs http://localhost:3124 > qa-report/evidence/api-demo.json
const BASE = process.argv[2] ?? "http://localhost:3124";
const URL_ = `${BASE}/api/script`;
const base = { title: "Introduce yourself", points: ["Your name and what you make", "Why you started"], skill: "Smile and start", skillTip: "", focus: "", challengeDay: 1, seconds: 30, name: "Sam", niche: "fitness", platform: "TikTok", goal: null, level: "Beginner", previous: [] };
let ipN = 0;
const ip = () => `198.51.100.${(++ipN % 250) + 1}`;

async function call(body, { raw = false, headers = {}, method = "POST" } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(URL_, { method, redirect: "manual", headers: { "Content-Type": "application/json", "x-real-ip": ip(), ...headers }, body: method === "GET" ? undefined : raw ? body : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, ms: Math.round(performance.now() - t0), json, text: json ? undefined : text.slice(0, 200), ctype: res.headers.get("content-type"), cookie: res.headers.get("set-cookie") };
  } catch (e) {
    return { status: 0, ms: Math.round(performance.now() - t0), error: String(e) };
  }
}

const cases = [
  ["A01 valid suggest", { ...base, mode: "suggest" }],
  ["A02 valid polish", { ...base, mode: "polish", draft: "um so hi i'm Sam and i i make like, fitness videos" }],
  ["A03 legacy no mode, with draft (-> polish)", { ...base, draft: "hi I am Sam and I make videos" }],
  ["A04 legacy no mode, no draft (-> suggest)", { ...base }],
  ["A05 invalid mode string", { ...base, mode: "delete-everything" }],
  ["A06 missing title", { ...base, title: undefined, mode: "suggest" }],
  ["A07 whitespace title", { ...base, title: "   ", mode: "suggest" }],
  ["A08 polish < 4 words", { ...base, mode: "polish", draft: "hi there" }],
  ["A09 polish empty draft", { ...base, mode: "polish", draft: "" }],
  ["A10 polish whitespace draft", { ...base, mode: "polish", draft: "     \n\n   " }],
  ["A11 polish emoji only (4 tokens)", { ...base, mode: "polish", draft: "😀 🎉 🔥 💪" }],
  ["A12 polish filler only", { ...base, mode: "polish", draft: "um uh um erm" }],
  ["A13 non-JSON body", "this is not json", { raw: true }],
  ["A14 JSON array body", "[1,2,3]", { raw: true }],
  ["A15 JSON null body", "null", { raw: true }],
  ["A16 empty body", "", { raw: true }],
  ["A17 wrong types", { mode: "suggest", title: 123, points: "nope", seconds: "abc", challengeDay: {}, name: ["x"] }],
  ["A18 title object", { mode: "suggest", title: { a: 1 } }],
  ["A19 huge draft 100 KB", { ...base, mode: "polish", draft: "word ".repeat(20000) }],
  ["A20 huge body 5 MB", { ...base, mode: "suggest", previous: ["x".repeat(5_000_000)] }],
  ["A21 HTML/script in draft", { ...base, mode: "polish", draft: "<script>alert(1)</script> <img src=x onerror=alert(2)> hello there friend" }],
  ["A22 SQL-like draft", { ...base, mode: "polish", draft: "'; DROP TABLE yaps; -- hello there friend" }],
  ["A23 unicode/mixed languages", { ...base, mode: "polish", draft: "Hola, je suis Sam 日本語 का परीक्षण testing" }],
  ["A24 GET method", null, { method: "GET" }],
  ["A25 seconds out of range 999", { ...base, mode: "suggest", seconds: 999 }],
  ["A26 Content-Type text/plain", JSON.stringify({ ...base, mode: "suggest" }), { raw: true, headers: { "Content-Type": "text/plain" } }],
];

const out = [];
for (const [name, body, opts] of cases) {
  const r = await call(body, opts);
  out.push({ name, ...r, lines: r.json?.lines?.length, kind: r.json?.kind, error: r.json?.error ?? r.error });
}

// Concurrency: 1, 5, 10 simultaneous valid suggest requests (each from its own test IP).
const perf = {};
for (const n of [1, 5, 10]) {
  const t0 = performance.now();
  const rs = await Promise.all(Array.from({ length: n }, () => call({ ...base, mode: "suggest" })));
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  perf[`c${n}`] = { total_ms: Math.round(performance.now() - t0), ok: rs.filter((r) => r.status === 200).length, statuses: [...new Set(rs.map((r) => r.status))], p50: ms[Math.floor(ms.length / 2)], max: ms.at(-1) };
}
// Sequential 50 requests: latency distribution.
const seq = [];
for (let i = 0; i < 50; i++) seq.push((await call({ ...base, mode: "polish", draft: "um I make fitness videos for busy moms" })).ms);
seq.sort((a, b) => a - b);
perf.seq50 = { p50: seq[25], p95: seq[47], max: seq.at(-1) };

console.log(JSON.stringify({ at: new Date().toISOString(), base: BASE, cases: out, perf }, null, 2));
