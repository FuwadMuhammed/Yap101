/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Phase 2 (G): does the script editor break the surrounding app? Daily Yap navigation → record
// with a saved script → fake-camera recording → feedback → history → track, on the demo build.
// Usage: node qa-report/scripts/integration.cjs http://localhost:3124
const { chromium } = require("playwright");
const path = require("path");
const BASE = process.argv[2] ?? "http://localhost:3124";
const SHOTS = path.join(__dirname, "..", "evidence", "shots", "phase2");
const out = [];
const step = (id, title, status, actual) => { out.push({ id, title, status, actual }); process.stderr.write(`${id} ${status} ${title} :: ${actual}\n`); };

(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, permissions: ["camera", "microphone"] });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const start = new Date(Date.now() - 1 * 864e5).toISOString().slice(0, 10);
  await p.goto(BASE + "/terms");
  await p.evaluate((start) => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" } })); }, start);
  try {
    // G1 Daily Yap navigation: home → today's yap
    await p.goto(BASE + "/home", { waitUntil: "networkidle" });
    const link = p.locator('a[href^="/record?prompt="]').first();
    const href = await link.getAttribute("href");
    await link.click();
    await p.waitForURL(/\/record\?prompt=/);
    await p.getByRole("radio", { name: "Read a script" }).waitFor();
    const h1 = await p.locator("h1", { hasText: /fitness|niche/ }).first().innerText();
    step("G1", "Home → today's yap opens the record screen for day 2", href === "/record?prompt=2" && /fitness/.test(h1) ? "PASS" : "FAIL", `link ${href}; heading "${h1}"`);

    // G2 Script editor → prep card
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.locator("#script-text").fill("I got into fitness after a hard year.\nNow I help busy parents move every day.");
    await p.getByRole("button", { name: "Save script" }).click();
    const card = await p.getByText("I got into fitness after a hard year.").count();
    step("G2", "Saved script shows on the prep card", card ? "PASS" : "FAIL", `card shows script=${!!card}`);

    // G3 Recording handoff + teleprompter input
    await p.getByRole("button", { name: /Turn on camera/ }).click();
    await p.getByRole("button", { name: "Start recording" }).waitFor({ timeout: 20000 });
    const prompter = await p.getByText("I got into fitness").count();
    step("G3", "Teleprompter on the camera screen uses the saved script", prompter ? "PASS" : "FAIL", `script on camera screen=${!!prompter}`);
    await p.getByRole("button", { name: "Start recording" }).click();
    await p.getByRole("button", { name: "Stop recording" }).waitFor({ timeout: 10000 });
    await p.waitForTimeout(4000);
    await p.getByRole("button", { name: "Stop recording" }).click();
    await p.getByText("Nice yap!").waitFor({ timeout: 30000 });
    const review = (await p.locator("body").innerText()).match(/(\d+) seconds · ([^\n]+)/);
    await p.screenshot({ path: path.join(SHOTS, "G3-review.png") });
    step("G4", "Recording stops and reaches review", review ? "PASS" : "FAIL", review ? `${review[1]} s · "${review[2]}"` : "no review");

    // G5 Feedback scoring input
    await p.getByRole("button", { name: "Get feedback" }).click();
    await p.waitForURL(/\/feedback\//, { timeout: 30000 });
    await p.waitForTimeout(1500);
    const fb = (await p.locator("body").innerText()).replace(/\n+/g, " ");
    await p.screenshot({ path: path.join(SHOTS, "G5-feedback.png"), fullPage: true });
    step("G5", "Feedback page loads after a scripted yap", /Yap complete!/.test(fb) && /XP/.test(fb) ? "PASS" : "FAIL", fb.slice(0, 160));
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("yap101-demo")).yaps.at(-1));
    step("G6", "Yap saved with the right day/title; script still saved for the day", stored?.prompt_id === 2 && (await p.evaluate(() => JSON.parse(localStorage.getItem("yap101-scripts") ?? "{}")[2]?.length)) === 2 ? "PASS" : "FAIL", `yap prompt_id=${stored?.prompt_id}, title="${stored?.title}", ${stored?.duration_seconds}s, scriptDone=${stored?.feedback?.scriptDone ?? "n/a"}`);

    // G7 History + track
    await p.goto(BASE + "/history", { waitUntil: "networkidle" });
    const hist = await p.getByText(/Why you got into fitness/).count();
    await p.goto(BASE + "/track", { waitUntil: "networkidle" });
    const track = (await p.locator("body").innerText()).replace(/\n+/g, " ").slice(0, 120);
    step("G7", "History lists the yap; track page renders", hist ? "PASS" : "FAIL", `history entries=${hist}; track: "${track}"`);

    // G8 Profile still loads and the script survives navigation round-trip
    await p.goto(BASE + "/profile", { waitUntil: "networkidle" });
    const prof = await p.getByText("Sam").count();
    await p.goto(BASE + "/record?prompt=2", { waitUntil: "networkidle" });
    const still = await p.getByText("I got into fitness after a hard year.").count();
    step("G8", "Profile page loads; script still on day 2 after the full journey", prof && still ? "PASS" : "FAIL", `profile shows name=${!!prof}; script kept=${!!still}`);
  } catch (e) {
    step("GX", "Journey aborted", "FAIL", e.message.split("\n")[0]);
    await p.screenshot({ path: path.join(SHOTS, "GX-error.png") });
  }
  step("G9", "No page errors during the whole journey", errors.length ? "FAIL" : "PASS", errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
})();
