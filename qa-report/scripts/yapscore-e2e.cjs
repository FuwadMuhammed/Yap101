/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Yap score v2 end to end: two recorded takes (fake camera + mic), confidence questions, the new
// results screen, the drill link, profile trends and the score settings.
// Usage: node qa-report/scripts/yapscore-e2e.cjs http://localhost:3124
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const BASE = process.argv[2] ?? "http://localhost:3124";
const SHOTS = path.join(__dirname, "..", "evidence", "shots", "yapscore");
fs.mkdirSync(SHOTS, { recursive: true });
const out = [];
const step = (id, title, ok, actual) => { out.push({ id, title, status: ok ? "PASS" : "FAIL", actual }); process.stderr.write(`${id} ${ok ? "PASS" : "FAIL"} ${title} :: ${actual}\n`); };

(async () => {
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, permissions: ["camera", "microphone"] });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/terms");
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("yap101-score-prefs", JSON.stringify({ transcribe: false })); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" } })); });

  async function record(n, { fear, predicted, observed, after, retake }) {
    await p.goto(`${BASE}/record?prompt=${n === 1 ? 2 : 3}`, { waitUntil: "networkidle" });
    await p.getByRole("radiogroup", { name: "How nervous are you right now?" }).getByRole("radio", { name: `${fear} out of 10` }).click();
    await p.getByRole("button", { name: /Turn on camera/ }).click();
    const go = async () => {
      await p.getByRole("button", { name: "Start recording" }).click({ timeout: 20000 });
      await p.getByRole("button", { name: "Stop recording" }).waitFor({ timeout: 10000 });
      await p.waitForTimeout(7000);
      await p.getByRole("button", { name: "Stop recording" }).click();
      await p.getByText("Nice yap!").waitFor({ timeout: 30000 });
    };
    await go();
    if (retake) {
      await p.getByRole("button", { name: "Retake" }).click();
      await go();
    }
    const videoPaused = await p.evaluate(() => document.querySelector("video[src^='blob:']")?.paused ?? null);
    await p.screenshot({ path: path.join(SHOTS, `take${n}-review-predict.png`) });
    await p.getByRole("radiogroup", { name: /how nervous do you think you looked/ }).getByRole("radio", { name: `${predicted} out of 10` }).click();
    await p.getByRole("radiogroup", { name: /how nervous did you actually look/ }).getByRole("radio", { name: `${observed} out of 10` }).click();
    await p.getByRole("radiogroup", { name: /How nervous do you feel about yapping now/ }).getByRole("radio", { name: `${after} out of 10` }).click();
    await p.screenshot({ path: path.join(SHOTS, `take${n}-review-after.png`) });
    await p.getByRole("button", { name: "Get feedback" }).click();
    await p.waitForURL(/\/feedback\//, { timeout: 30000 });
    // Skip the celebration screen.
    await p.waitForTimeout(800);
    const url = p.url().replace("?celebrate=1", "");
    await p.goto(url, { waitUntil: "networkidle" });
    return { videoPaused };
  }

  try {
    const t1 = await record(1, { fear: 7, predicted: 8, observed: 5, after: 5, retake: true });
    step("Y1", "Replay waits for the 'how nervous did you look' guess", t1.videoPaused === true, `video paused before answering=${t1.videoPaused}`);
    const body1 = (await p.locator("body").innerText()).replace(/\n+/g, " | ");
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("yap101-demo")).yaps[0].feedback.analysis);
    step("Y2", "Take saved as Yap score v2 with 16 parameters and the confidence answers", stored.version === 2 && stored.yap.params.length === 16 && stored.confidence.fearBefore === 7 && stored.confidence.takes === 2, `version ${stored.version}, params ${stored.yap.params.length}, overall ${stored.overall}, confidence ${JSON.stringify(stored.confidence)}`);
    step("Y3", "Results: score, first-7 line, confidence line, group bars", /Take 1 of your first 7/.test(body1) && /Nerves 7 → 5/.test(body1) && /3 points harsher than the tape/.test(body1) && /Hook.*Voice.*Presence.*Structure/.test(body1), body1.slice(body1.indexOf("Yap score"), body1.indexOf("Yap score") + 220));
    const fixes = await p.locator("section.bg-grape li").count();
    step("Y4", "One win and up to two fixes, each with a drill", fixes >= 1 && fixes <= 2 && (await p.getByRole("link", { name: /Drill:/ }).count()) === fixes, `fixes ${fixes}; win shown=${/Your (win|strength)/.test(body1)}`);
    await p.screenshot({ path: path.join(SHOTS, "results-top.png"), fullPage: false });
    await p.getByText("See details: all 16 measures").click();
    const details = await p.locator("details li").count();
    const soon = await p.getByText("No transcript").count();
    await p.screenshot({ path: path.join(SHOTS, "results-details.png"), fullPage: true });
    step("Y5", "Details list all 16 measures; transcript ones marked 'No transcript' (filler check off)", details === 16 && soon === 3, `rows ${details}, coming soon ${soon}, timeline ${await p.getByText("Your voice over the clip").count() ? "shown" : "not shown"}`);
    const drill = await p.getByRole("link", { name: /Drill:/ }).first();
    const href = await drill.getAttribute("href");
    await drill.click();
    await p.waitForURL(/drill=/);
    const drillCard = await p.locator("section", { hasText: "Drill ·" }).first().waitFor({ timeout: 15000 }).then(() => 1, () => 0);
    step("Y6", "Drill button opens the same prompt with the drill card", /prompt=2&drill=/.test(href) && drillCard > 0, `href ${href}`);

    await record(2, { fear: 4, predicted: 4, observed: 4, after: 3 });
    const body2 = (await p.locator("body").innerText()).replace(/\n+/g, " | ");
    await p.screenshot({ path: path.join(SHOTS, "results-take2.png") });
    step("Y7", "Second take compares with day 1 and judges self-rating", /Take 2 of your first 7 · [+-]?\d+ vs your day 1/.test(body2) && /Nerves 4 → 3/.test(body2) && /judged yourself spot on/.test(body2), (body2.match(/Take 2[^|]*/)?.[0] ?? "") + " || " + body2.slice(0, 300));
    const fix2 = await p.evaluate(() => { const y = JSON.parse(localStorage.getItem("yap101-demo")).yaps; return [y[1].feedback.analysis.yap.fixes.map((f) => f.key), y[0].feedback.analysis.yap.fixes.map((f) => f.key)]; });
    step("Y8", "Tips don't repeat from the previous take", !fix2[1].some((k) => fix2[0].includes(k)), `take 1 fixes ${JSON.stringify(fix2[0])} → take 2 fixes ${JSON.stringify(fix2[1])}`);

    await p.goto(BASE + "/profile", { waitUntil: "networkidle" });
    const prof = (await p.locator("body").innerText()).replace(/\n+/g, " | ");
    await p.screenshot({ path: path.join(SHOTS, "profile-trends.png"), fullPage: true });
    step("Y9", "Profile: score + nerves trend, groups vs day 1, day 1 vs now", /Yap score: \d+ → \d+/.test(prof) && /Nerves before recording \(0–10\): 7 → 4/.test(prof) && /Each group vs your day 1/i.test(prof) && /Day 1 vs now/i.test(prof), prof.match(/Your progress[^]*?Yap score settings/)?.[0]?.slice(0, 260) ?? "");
    await p.getByRole("switch", { name: /Appearance-sensitive mode/ }).click();
    const prefs = await p.evaluate(() => localStorage.getItem("yap101-score-prefs"));
    step("Y10", "Score settings toggle and persist", /"appearanceSensitive":true/.test(prefs), prefs);
  } catch (e) {
    step("YX", "aborted", false, e.message.split("\n")[0]);
    await p.screenshot({ path: path.join(SHOTS, "error.png") });
  }
  step("Y11", "No page errors", errors.length === 0, errors.join(" | ").slice(0, 200) || "none");
  await b.close();
  console.log(JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
})();
