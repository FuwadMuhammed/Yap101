/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Filler-word check end to end: a spoken WAV (espeak) plays as the fake microphone, the app
// transcribes it on-device with Whisper (Transformers.js in a worker), and the saved take shows
// fillers, a clear close and hedging measured, plus the transcript with fillers highlighted.
// Usage: node qa-report/scripts/asr-e2e.cjs http://localhost:3124 /path/to/speech.wav
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const BASE = process.argv[2] ?? "http://localhost:3124";
const WAV = process.argv[3];
const SHOTS = path.join(__dirname, "..", "evidence", "shots", "asr");
fs.mkdirSync(SHOTS, { recursive: true });
const out = [];
const step = (id, title, ok, actual) => { out.push({ id, title, status: ok ? "PASS" : "FAIL", actual }); process.stderr.write(`${id} ${ok ? "PASS" : "FAIL"} ${title} :: ${actual}\n`); };

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  const b = await chromium.launch({ proxy, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}`, "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, permissions: ["camera", "microphone"] });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const logs = []; p.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  await p.goto(BASE + "/terms");
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: { display_name: "Sam", niche: "sleep", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" } })); });
  try {
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /Turn on camera/ }).click();
    await p.getByRole("button", { name: "Start recording" }).click({ timeout: 20000 });
    await p.getByRole("button", { name: "Stop recording" }).waitFor({ timeout: 10000 });
    await p.waitForTimeout(16500); // the WAV is 15 s and loops
    await p.getByRole("button", { name: "Stop recording" }).click();
    await p.getByText("Nice yap!").waitFor({ timeout: 30000 });
    const status = p.getByRole("status").filter({ hasText: /filler/i });
    await status.waitFor({ timeout: 10000 });
    const first = await status.innerText();
    step("A1", "Review sheet shows the filler check starting", /filler-word checker ready|Listening back/.test(first), first);
    await p.screenshot({ path: path.join(SHOTS, "review-checking.png") });
    const t0 = Date.now();
    await p.getByText(/Filler-word check done/).waitFor({ timeout: 300000 });
    const done = await status.innerText();
    step("A2", "Transcription finishes on the device", true, `${done} after ${Math.round((Date.now() - t0) / 1000)} s more`);
    await p.screenshot({ path: path.join(SHOTS, "review-done.png") });
    await p.getByRole("button", { name: "Skip" }).first().click(); // skip the nerves guess
    await p.getByRole("button", { name: "Get feedback" }).click();
    await p.waitForURL(/\/feedback\//, { timeout: 30000 });
    await p.waitForTimeout(800);
    await p.goto(p.url().replace("?celebrate=1", ""), { waitUntil: "networkidle" });
    const fb = await p.evaluate(() => JSON.parse(localStorage.getItem("yap101-demo")).yaps[0].feedback);
    const a = fb.analysis, param = (k) => a.yap.params.find((x) => x.key === k);
    const text = (a.transcript ?? []).map((w) => w.text).join(" ");
    step("A3", "Transcript saved with word timestamps", a.transcript?.length > 10 && a.transcript.every((w) => typeof w.start === "number"), text);
    step("A4", "Filler rate measured and fillers counted in feedback", param("fillers").measured && fb.filler_count >= 1, `${param("fillers").display}; filler_words ${JSON.stringify(fb.filler_words)}`);
    step("A5", "Clear close measured", param("close").measured, param("close").display);
    step("A6", "Hedging measured, not scored", param("hedging").measured && !param("hedging").scored, param("hedging").display);
    await p.getByText("See details: all 16 measures").click();
    const body = (await p.locator("body").innerText()).replace(/\n+/g, " | ");
    const marks = await p.locator("mark").allInnerTexts();
    step("A7", "Details show the transcript with fillers highlighted", /What we heard \(beta\)/i.test(body) && marks.length >= 1, `highlighted: ${JSON.stringify(marks)}`);
    await p.locator("details").scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(SHOTS, "feedback-transcript.png"), fullPage: true });

    // Turned off in the profile: no check, no download.
    await p.evaluate(() => localStorage.setItem("yap101-score-prefs", JSON.stringify({ transcribe: false })));
    await p.goto(`${BASE}/record?prompt=3`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /Turn on camera/ }).click();
    await p.getByRole("button", { name: "Start recording" }).click({ timeout: 20000 });
    await p.waitForTimeout(6000);
    await p.getByRole("button", { name: "Stop recording" }).click();
    await p.getByText("Nice yap!").waitFor({ timeout: 30000 });
    await p.waitForTimeout(1500);
    const off = await p.getByRole("status").filter({ hasText: /filler/i }).count();
    step("A8", "Setting off: no filler check runs", off === 0, `status lines: ${off}`);
    step("A9", "No page errors", errors.length === 0, errors.join(" | ") || "none");
  } catch (e) {
    step("ERR", "Script error", false, String(e).slice(0, 400));
    await p.screenshot({ path: path.join(SHOTS, "error.png") }).catch(() => {});
    console.error(logs.slice(-20).join("\n"));
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, "..", "evidence", "asr-e2e.json"), JSON.stringify(out, null, 2));
  process.exit(out.some((o) => o.status === "FAIL") ? 1 : 0);
})();
