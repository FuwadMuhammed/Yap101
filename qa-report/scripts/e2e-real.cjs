/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// J1 + J2 in a real browser against the real-AI server (2 AI calls). Screenshots as evidence.
const { chromium } = require("playwright");
const path = require("path");
const BASE = process.argv[2] ?? "http://localhost:3125";
const SHOTS = path.join(__dirname, "..", "evidence", "shots");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/terms");
  const start = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  await p.evaluate((start) => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Maya", niche: "food", platform: "instagram", confidence: 2, level: "beginner", goal: "storytelling", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "evening" } })); }, start);
  const out = {};
  // J1: day 2 suggestion → edit → save → close → reopen
  await p.goto(`${BASE}/record?prompt=${1 * 100 + 2}`.replace("102", "102"), { waitUntil: "networkidle" }); // beginner+storytelling = combo 1
  await p.getByRole("radio", { name: "Read a script" }).click();
  let t0 = Date.now();
  await p.getByRole("button", { name: "Use our suggestion" }).click();
  await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0, null, { timeout: 60000 });
  out.j1_ms = Date.now() - t0;
  out.j1_title = await p.locator("section p.font-display").innerText();
  out.j1_suggestion = await p.inputValue("#script-text");
  await p.screenshot({ path: path.join(SHOTS, "REAL-J1-suggestion.png") });
  await p.locator("#script-text").press("End");
  await p.locator("#script-text").type("\nI'm still learning, and that's okay.");
  await p.getByRole("button", { name: "Save script" }).click();
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Edit" }).click();
  out.j1_reopened_has_edit = (await p.inputValue("#script-text")).includes("I'm still learning, and that's okay.");
  // J2: own draft → polish → compare → save → reopen
  const draft = "ok so um last tuesday i made my nans lasagne recipe for 6 friends and honestly i burnt the top but everyone still ate 2 plates lol";
  await p.fill("#script-text", draft);
  t0 = Date.now();
  await p.getByRole("button", { name: "Polish it for me" }).click();
  await p.getByText("Polished version").waitFor({ timeout: 60000 });
  out.j2_ms = Date.now() - t0;
  out.j2_original = draft;
  out.j2_polished = await p.inputValue("#script-text");
  out.j2_facts_kept = ["Tuesday|tuesday", "lasagne|lasagna", "6|six", "burnt|burned", "2|two"].map((f) => [f, new RegExp(f).test(out.j2_polished)]);
  await p.screenshot({ path: path.join(SHOTS, "REAL-J2-polished.png") });
  await p.getByRole("button", { name: "Save script" }).click();
  await p.reload({ waitUntil: "networkidle" });
  out.j2_persisted = JSON.parse(await p.evaluate(() => localStorage.getItem("yap101-scripts")))["102"]?.join("\n") === out.j2_polished;
  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
