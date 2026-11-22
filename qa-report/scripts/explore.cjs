/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Phase 2 exploratory session, recorded as a script so every finding is reproducible.
// Charter: "use the editor the way real people do: gestures, reloads, odd pastes, changing their mind".
// Usage: node qa-report/scripts/explore.cjs http://localhost:3124
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3124";
const start = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
const PROF = { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" };
const out = [];
async function x(id, title, fn) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => { errors.push("dialog:" + d.message()); d.dismiss(); });
  await p.goto(BASE + "/terms");
  await p.evaluate((pr) => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: pr })); }, PROF);
  let r; try { r = await fn(p, ctx); } catch (e) { r = { kind: "FAIL", actual: "Exception: " + e.message.split("\n")[0] }; }
  if (errors.filter((e) => !e.startsWith("dialog")).length) r = { kind: "FAIL", actual: `${r.actual}; errors: ${errors.join(" | ")}` };
  out.push({ id, title, ...r }); process.stderr.write(`${id} ${r.kind} ${title} :: ${r.actual}\n`); await b.close();
}
const open = async (p, id = 2) => { await p.waitForTimeout(100);
  await p.goto(`${BASE}/record?prompt=${id}`, { waitUntil: "networkidle" }); const e = p.getByRole("button", { name: "Edit" }); if (await e.count()) await e.click(); else await p.getByRole("radio", { name: "Read a script" }).click(); await p.locator("#script-text").waitFor(); };

(async () => {
  await x("X1", "Android back gesture with the editor open and unsaved text", async (p) => {
    await p.goto(`${BASE}/home`, { waitUntil: "networkidle" });
    await p.locator('a[href^="/record?prompt="]').first().click();
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.locator("#script-text").fill("A long draft I spent five minutes writing.");
    await p.goBack();
    await p.waitForTimeout(800);
    const url = p.url().replace(BASE, "");
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const kept = await p.getByText("A long draft I spent five minutes writing.").count();
    const stayed = url.startsWith("/record");
    return { kind: stayed ? "OK" : "FINDING", severity: "P2", actual: stayed ? `Back closed the sheet and stayed on ${url} (draft discarded like X; page kept)` : `Back left the record screen (now ${url}) instead of closing the sheet; draft kept=${!!kept}` };
  });
  await x("X2", "Reload the page with unsaved text in the editor", async (p) => {
    await open(p);
    await p.locator("#script-text").fill("Unsaved words before a reload.");
    await p.reload({ waitUntil: "networkidle" });
    const kept = await p.getByText("Unsaved words before a reload.").count();
    return { kind: kept ? "OK" : "FINDING", severity: "P3", actual: `after reload the unsaved text is ${kept ? "kept" : "gone (no draft autosave, no beforeunload warning)"}` };
  });
  await x("X3", "Change level after saving scripts (re-done onboarding)", async (p) => {
    await open(p);
    await p.locator("#script-text").fill("My day two script."); await p.getByRole("button", { name: "Save script" }).click();
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("yap101-demo")); s.profile.level = "intermediate"; localStorage.setItem("yap101-demo", JSON.stringify(s)); });
    await p.goto(`${BASE}/record?prompt=102`, { waitUntil: "networkidle" });
    const shown = await p.getByText("My day two script.").count();
    const orphan = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("yap101-scripts") ?? "{}")));
    return { kind: shown ? "OK" : "FINDING", severity: "P3", actual: `new day 2 (id 102) shows old script=${!!shown}; script still stored under ids ${JSON.stringify(orphan)} and still sent to the AI as "previous"` };
  });
  await x("X4", "There's no way to delete a saved script", async (p) => {
    await open(p);
    await p.locator("#script-text").fill("A script I no longer want."); await p.getByRole("button", { name: "Save script" }).click();
    await p.getByRole("button", { name: "Edit" }).click();
    await p.getByRole("button", { name: "Clear" }).click();
    const saveDisabled = await p.getByRole("button", { name: "Save script" }).isDisabled();
    await p.keyboard.press("Escape");
    await p.getByRole("radio", { name: "My own words" }).click();
    await p.reload({ waitUntil: "networkidle" });
    const back = await p.getByRole("radio", { name: "Read a script" }).getAttribute("aria-checked");
    return { kind: "FINDING", severity: "P3", actual: `cleared box → Save disabled=${saveDisabled}; after switching to "My own words" and reloading, the day reopens in script mode=${back === "true"} with the old script` };
  });
  await x("X5", "Rotate/resize the phone mid-edit", async (p) => {
    await open(p);
    await p.locator("#script-text").fill("Typing, then I rotate the phone.");
    await p.setViewportSize({ width: 844, height: 390 });
    await p.waitForTimeout(300);
    const v = await p.inputValue("#script-text");
    const saveVisible = await p.getByRole("button", { name: "Save script" }).isVisible();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    return { kind: v.includes("rotate") && saveVisible && overflow <= 1 ? "OK" : "FINDING", actual: `text kept=${v.includes("rotate")}; Save visible in landscape=${saveVisible}; overflow ${overflow}px` };
  });
  await x("X6", "Paste Windows line endings and tabs", async (p) => {
    await open(p);
    await p.locator("#script-text").fill("Line one.\r\n\r\n\tLine two.\r\nLine three.");
    await p.getByRole("button", { name: "Save script" }).click();
    const s = await p.evaluate(() => JSON.parse(localStorage.getItem("yap101-scripts"))[2]);
    return { kind: JSON.stringify(s) === '["Line one.","Line two.","Line three."]' ? "OK" : "FINDING", actual: JSON.stringify(s) };
  });
  await x("X7", "Draft length boundary: 3,000 vs 3,001 characters", async (p) => {
    await open(p);
    const base = "word ".repeat(600).slice(0, 3000);
    await p.locator("#script-text").fill(base);
    const at = !(await p.getByRole("button", { name: "Polish it for me" }).isDisabled());
    await p.locator("#script-text").fill(base + "x");
    const over = await p.getByRole("button", { name: "Polish it for me" }).isDisabled();
    return { kind: at && over ? "OK" : "FINDING", actual: `3,000 chars → Polish enabled=${at}; 3,001 → disabled=${over}` };
  });
  await x("X8", "Steer box: 500-character cap and emoji", async (p) => {
    await open(p);
    await p.getByLabel(/Anything our suggestion should include/).fill("🔥".repeat(300) + "x".repeat(400));
    const len = (await p.getByLabel(/Anything our suggestion should include/).inputValue()).length;
    await p.getByLabel(/Anything our suggestion should include/).press("Enter");
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    return { kind: len <= 500 ? "OK" : "FINDING", actual: `steer box holds ${len} UTF-16 units (cap 500); suggestion produced` };
  });
  await x("X9", "Change of mind: suggestion → own edit → undo bar gone → Polish → Undo", async (p) => {
    await open(p);
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    await p.locator("#script-text").press("End");
    await p.locator("#script-text").type(" And that is my story.");
    const edited = await p.inputValue("#script-text");
    await p.getByRole("button", { name: "Polish it for me" }).click();
    await p.getByText("Polished version").waitFor();
    await p.getByRole("button", { name: /Back to your version/ }).click();
    const back = await p.inputValue("#script-text");
    return { kind: back === edited ? "OK" : "FINDING", severity: "P1", actual: `undo after polish returns the edited suggestion exactly=${back === edited}` };
  });
  await x("X10", "Day 30 'Introduce yourself, again' reuses the day-30 onboarding script", async (p) => {
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("yap101-demo")); s.profile.track_start_date = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10); localStorage.setItem("yap101-demo", JSON.stringify(s)); });
    await p.goto(`${BASE}/record?prompt=30`, { waitUntil: "networkidle" });
    // The preview inserts pause marks ("/") at commas, so check the editor text instead.
    await p.getByRole("button", { name: "Edit" }).click();
    const t = (await p.inputValue("#script-text")).includes("Today is day 30, and I made it.");
    return { kind: t ? "OK" : "FINDING", actual: `day-30 script shown=${!!t}` };
  });
  console.log(JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
})();
