/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Phase 2 compatibility matrix (Chromium device emulation: viewport, DPR, touch, user agent).
// Usage: node qa-report/scripts/devices.cjs http://localhost:3124
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.argv[2] ?? "http://localhost:3124";
const list = ["iPhone SE", "iPhone 13", "iPhone 15 Pro Max", "Pixel 7", "Galaxy S9+", "iPad Mini", "Galaxy Tab S4"];
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const name of [...list, "Fold 280px"]) {
    const d = devices[name] ?? { viewport: { width: 280, height: 653 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
    const ctx = await b.newContext(d); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(BASE + "/terms");
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" } })); });
    await p.goto(BASE + "/record?prompt=2", { waitUntil: "networkidle" });
    const tap = async (loc) => (d.hasTouch ? loc.tap() : loc.click());
    let r;
    try {
      await tap(p.getByRole("radio", { name: "Read a script" }));
      await tap(p.getByRole("button", { name: "Use our suggestion" }));
      await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
      const m = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, saveBottom: document.evaluate("//button[normalize-space()='Save script']", document, null, 9).singleNodeValue.getBoundingClientRect().bottom, h: innerHeight }));
      await tap(p.getByRole("button", { name: "Save script" }));
      const saved = await p.evaluate(() => !!JSON.parse(localStorage.getItem("yap101-scripts") ?? "{}")[2]);
      await p.screenshot({ path: path.join(__dirname, "..", "evidence", "shots", "phase2", `device-${name.replace(/\W+/g, "-")}.png`) });
      r = { device: name, viewport: `${d.viewport.width}×${d.viewport.height}`, status: m.overflow <= 1 && m.saveBottom <= m.h && saved && !errors.length ? "PASS" : "FAIL", actual: `overflow ${m.overflow}px; Save on screen=${m.saveBottom <= m.h}; tap-to-save worked=${saved}; errors=${errors.length}` };
    } catch (e) { r = { device: name, viewport: `${d.viewport.width}×${d.viewport.height}`, status: "FAIL", actual: e.message.split("\n")[0] }; }
    out.push(r); process.stderr.write(`${r.status} ${r.device} ${r.viewport} :: ${r.actual}\n`); await ctx.close();
  }
  await b.close(); console.log(JSON.stringify({ at: new Date().toISOString(), engine: "Chromium only (Firefox/WebKit not installed)", results: out }, null, 2));
})();
