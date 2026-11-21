/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// E31/E32: sign-out and "reset demo" leave the previous person's scripts on the device,
// and their scripts are sent to the AI as `previous` in the next person's requests.
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3124";
const start = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
const prof = (name) => ({ display_name: name, niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const sent = []; p.on("request", (r) => r.url().endsWith("/api/script") && sent.push(JSON.parse(r.postData())));
  await p.goto(BASE + "/terms");
  await p.evaluate((pr) => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: pr })); localStorage.setItem("yap101-scripts", JSON.stringify({ 3: ["My private story about my divorce."] })); }, prof("Sam"));
  // E31: Sam signs out from the profile page
  await p.goto(BASE + "/profile", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Sign out" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/profile"));
  const afterSignOut = await p.evaluate(() => localStorage.getItem("yap101-scripts"));
  // Alex starts on the same device
  await p.evaluate((pr) => localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: pr })), prof("Alex"));
  await p.goto(`${BASE}/record?prompt=3`, { waitUntil: "networkidle" });
  const alexSeesSams = await p.getByText("My private story about my divorce.").count();
  await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
  await p.getByRole("radio", { name: "Read a script" }).click();
  await p.getByLabel(/Anything our suggestion should include/).fill("something new");
  await p.getByRole("button", { name: "Use our suggestion" }).click();
  await p.waitForTimeout(1000);
  const leakedToAi = sent.some((s) => (s.previous ?? []).some((x) => x.includes("divorce")));
  console.log(JSON.stringify({ E31_scriptsAfterSignOut: afterSignOut, E31_nextUserSeesPreviousScript: !!alexSeesSams, E31_previousUsersScriptSentToAi: leakedToAi, previousSent: sent.at(-1)?.previous, nameSent: sent.at(-1)?.name }, null, 2));
  await b.close();
})();
