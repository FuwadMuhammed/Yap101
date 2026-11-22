/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// E17b: fill localStorage until setItem throws, verify it really is full, then save a script.
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3124";
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/terms");
  const start = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  await p.evaluate((start) => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" } })); }, start);
  await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
  await p.getByRole("radio", { name: "Read a script" }).click();
  const filled = await p.evaluate(() => { let n = 0, size = 1 << 20; while (size >= 16) { try { localStorage.setItem(`fill-${n++}`, "x".repeat(size)); } catch { size >>= 1; } } try { localStorage.setItem("probe", "x".repeat(64)); return "NOT FULL"; } catch { return "FULL"; } });
  await p.fill("#script-text", "Will this persist when storage is full?");
  await p.getByRole("button", { name: "Save script" }).click();
  const shown = await p.getByText("Will this persist when storage is full?").count();
  const toasts = await p.locator("[data-sonner-toast]").allInnerTexts();
  await p.reload({ waitUntil: "networkidle" });
  const after = await p.getByText("Will this persist when storage is full?").count();
  console.log(JSON.stringify({ storage: filled, shownAfterSave: !!shown, warningToasts: toasts, presentAfterReload: !!after, errors }));
  await b.close();
})();
