/* eslint-disable -- standalone Node/Playwright measurement script, not app code */
// Page performance per route (demo build, signed-in demo user with a few yaps), median of N cold loads.
// Usage: node optimization-reports/scripts/perf.cjs http://localhost:3124 [runs] > out.json
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3124";
const RUNS = Number(process.argv[3] ?? 3);
const ROUTES = ["/", "/login", "/home", "/record?prompt=2", "/history", "/track", "/profile", "/feedback/FIRST", "/onboarding", "/terms"];
const med = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

(async () => {
  const b = await chromium.launch();
  const results = {};
  for (const route of ROUTES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await b.newContext({ viewport: { width: 400, height: 860 } });
      const p = await ctx.newPage();
      await p.goto(BASE + "/terms");
      const firstId = await p.evaluate(() => {
        const id = crypto.randomUUID();
        const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
        localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, profile: { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: day(3), onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" },
          yaps: [1, 2].map((n, i) => ({ id: i ? crypto.randomUUID() : id, prompt_id: 1 + i, title: "Yap " + n, media: "audio", duration_seconds: 20, local_date: day(2 - i), created_at: new Date().toISOString(), feedback: null })) }));
        return id;
      });
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Performance.enable");
      let js = 0, total = 0, reqs = 0;
      p.on("response", async (r) => {
        reqs++;
        const len = Number((await r.allHeaders())["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
        total += len;
        if (r.request().resourceType() === "script") js += len;
      });
      await p.addInitScript(() => {
        window.__lcp = 0; window.__cls = 0; window.__long = 0;
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
      });
      const url = BASE + route.replace("FIRST", firstId);
      await p.goto(url, { waitUntil: "networkidle" });
      await p.waitForTimeout(500);
      const m = await p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, lcp: window.__lcp, cls: window.__cls, tbt: window.__long, dom: document.getElementsByTagName("*").length }; });
      const heap = (await cdp.send("Performance.getMetrics")).metrics.find((x) => x.name === "JSHeapUsedSize").value;
      runs.push({ ...m, js, total, reqs, heap });
      await ctx.close();
    }
    const k = Object.keys(runs[0]);
    results[route] = Object.fromEntries(k.map((x) => [x, Math.round(med(runs.map((r) => r[x])) * (x === "cls" ? 1000 : 1)) / (x === "cls" ? 1000 : 1)]));
    process.stderr.write(`${route} ${JSON.stringify(results[route])}\n`);
  }
  await b.close();
  console.log(JSON.stringify({ at: new Date().toISOString(), base: BASE, runs: RUNS, results }, null, 2));
})();
