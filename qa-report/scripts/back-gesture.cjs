/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// BUG-28 verification: Back closes the editor sheet; after closing it any way, one more Back
// leaves the page (no dead history entries). Usage: node qa-report/scripts/back-gesture.cjs http://localhost:3124
const { chromium, devices } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3124";
const out = [];
(async () => {
  const b = await chromium.launch();
  for (const [id, how] of [["B1", "back"], ["B2", "save"], ["B3", "x"], ["B4", "escape"]]) {
    const ctx = await b.newContext(devices["Pixel 7"]); const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(BASE + "/terms");
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" } })); });
    await p.goto(BASE + "/home", { waitUntil: "networkidle" });
    await p.locator('a[href^="/record?prompt="]').first().click();
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.locator("#script-text").fill("My draft for the back test.");
    if (how === "back") await p.goBack();
    if (how === "save") await p.getByRole("button", { name: "Save script" }).click();
    if (how === "x") await p.getByRole("button", { name: "Close without saving" }).click();
    if (how === "escape") await p.keyboard.press("Escape");
    await p.waitForTimeout(600);
    const afterClose = { url: p.url().replace(BASE, ""), sheetOpen: await p.locator("#script-text").count() > 0, prep: await p.getByRole("button", { name: /Turn on camera/ }).count() > 0, saved: await p.getByText("My draft for the back test.").count() > 0 };
    await p.goBack();
    await p.waitForTimeout(800);
    const afterBack = p.url().replace(BASE, "");
    const pass = afterClose.url.startsWith("/record") && !afterClose.sheetOpen && afterClose.prep && afterBack === "/home" && !errors.length && (how !== "save" || afterClose.saved);
    out.push({ id, how, status: pass ? "PASS" : "FAIL", afterClose, afterBack, errors });
    process.stderr.write(`${id} ${pass ? "PASS" : "FAIL"} close by ${how}: stayed on ${afterClose.url}, sheet open=${afterClose.sheetOpen}, prep card=${afterClose.prep}${how === "save" ? `, script saved=${afterClose.saved}` : ""}; one more Back → ${afterBack}${errors.length ? "; errors " + errors.join("|") : ""}\n`);
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
})();
