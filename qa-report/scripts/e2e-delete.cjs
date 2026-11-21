/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// E32: "Delete my guest data" on the profile page leaves scripts and suggestions behind.
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3124";
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + "/terms");
  const start = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  await p.evaluate((start) => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" } })); localStorage.setItem("yap101-scripts", '{"2":["Private script."]}'); localStorage.setItem("yap101-suggestions", '{"2":["Cached."]}'); }, start);
  await p.goto(BASE + "/profile", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Delete my guest data" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/profile"));
  const left = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k).slice(0, 60)])));
  console.log(JSON.stringify({ E32_storageAfterDelete: left }, null, 2));
  await b.close();
})();
