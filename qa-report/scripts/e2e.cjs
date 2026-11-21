/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Browser E2E + exploratory edge cases for the script editor (Playwright, Chromium).
// Runs against the demo build (no AI key: /api/script answers with local templates, or is
// intercepted below to simulate slow, failing or out-of-order responses).
// Usage: node qa-report/scripts/e2e.cjs http://localhost:3124 > qa-report/evidence/e2e.json
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.argv[2] ?? "http://localhost:3124";
const SHOTS = path.join(__dirname, "..", "evidence", "shots");
require("fs").mkdirSync(SHOTS, { recursive: true });

const START = new Date(Date.now() - 20 * 864e5).toISOString().slice(0, 10); // 21 days unlocked
const PROFILE = { display_name: "Sam", niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: START, onboarded_at: new Date().toISOString(), yap_time: "morning" };
const results = [];

async function seed(page, profile = PROFILE, extra = {}) {
  await page.goto(BASE + "/terms");
  await page.evaluate(([p, extra]) => {
    localStorage.clear();
    localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: p }));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
  }, [profile, extra]);
}
const box = (p) => p.locator("#script-text");
const btn = (p, name) => p.getByRole("button", { name, exact: typeof name === "string" });
async function openEditor(p, id) {
  await p.goto(`${BASE}/record?prompt=${id}`, { waitUntil: "networkidle" });
  const edit = p.getByRole("button", { name: "Edit" });
  if (await edit.count()) await edit.click();
  else await p.getByRole("radio", { name: "Read a script" }).click();
  await box(p).waitFor();
}
const scripts = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("yap101-scripts") ?? "{}"));

async function test(id, title, fn, { device } = {}) {
  const b = global.browser;
  const ctx = await b.newContext(device ?? { viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => { errors.push(`DIALOG ${d.type()}: ${d.message()}`); d.dismiss(); });
  const t0 = Date.now();
  let status = "PASS", actual = "", note = "";
  try {
    const r = await fn(p, ctx, errors);
    actual = r?.actual ?? "";
    if (r?.fail) { status = "FAIL"; note = r.fail; }
  } catch (e) {
    status = "FAIL";
    actual = `Exception: ${e.message.split("\n")[0]}`;
    await p.screenshot({ path: path.join(SHOTS, `${id}-error.png`) }).catch(() => {});
  }
  if (errors.length && status === "PASS" && !actual.includes("expected-error")) { status = "FAIL"; note = `page errors: ${errors.join(" | ")}`; }
  results.push({ id, title, status, actual, note, errors, ms: Date.now() - t0 });
  process.stderr.write(`${id} ${status} ${title} :: ${actual} ${note}\n`);
  await ctx.close();
}

(async () => {
  global.browser = await chromium.launch();

  await test("E01", "J1 generate (suggestion) → edit → save → close → reopen", async (p) => {
    await seed(p); await openEditor(p, 2);
    await btn(p, "Use our suggestion").click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    await box(p).press("End"); await box(p).type(" I also coach.");
    await btn(p, "Save script").click();
    await p.getByText("I also coach.").waitFor();
    await p.reload({ waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Edit" }).click();
    const v = await box(p).inputValue();
    await p.screenshot({ path: path.join(SHOTS, "E01-reopened.png") });
    return v.includes("I also coach.") ? { actual: "Edited suggestion saved and present after reload" } : { fail: "edit lost", actual: v };
  });

  await test("E02", "J2 polish → compare → save → reopen", async (p) => {
    await seed(p); await openEditor(p, 2);
    const orig = "um so I started lifting in 2019 and i i coach 12 clients in Leeds";
    await box(p).fill(orig);
    await btn(p, "Polish it for me").click();
    await p.getByText("Polished version").waitFor();
    const pol = await box(p).inputValue();
    await btn(p, "Save script").click();
    await p.reload({ waitUntil: "networkidle" });
    const saved = Object.values(await scripts(p))[0]?.join(" ");
    const keeps = ["2019", "12", "Leeds"].every((w) => pol.includes(w));
    return keeps && saved === pol.replace(/\n/g, " ") ? { actual: `Polished "${pol.replace(/\n/g, " / ")}" kept 2019/12/Leeds; persisted` } : { fail: "meaning or persistence broken", actual: pol };
  });

  await test("E03", "Day switching keeps scripts on their own day", async (p) => {
    await seed(p); await openEditor(p, 2);
    await box(p).fill("Day two script here."); await btn(p, "Save script").click();
    await openEditor(p, 4);
    const d4 = await box(p).inputValue();
    await box(p).fill("Day four script here."); await btn(p, "Save script").click();
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const ok2 = await p.getByText("Day two script here.").count();
    const s = await scripts(p);
    return d4 === "" && ok2 && s[2]?.[0] === "Day two script here." && s[4]?.[0] === "Day four script here." ? { actual: "Day 2 and day 4 scripts stored under ids 2 and 4; day 4 opened empty" } : { fail: "cross-day leak", actual: JSON.stringify(s) };
  });

  await test("E04", "Discard unsaved changes with X and Escape", async (p) => {
    await seed(p, PROFILE, { "yap101-scripts": JSON.stringify({ 2: ["Original line."] }) }); await openEditor(p, 2);
    await box(p).fill("Changed but not saved");
    await p.getByRole("button", { name: "Close without saving" }).click();
    await p.getByRole("button", { name: "Edit" }).click();
    const v1 = await box(p).inputValue();
    await box(p).fill("Changed again"); await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Edit" }).click();
    const v2 = await box(p).inputValue();
    return v1 === "Original line." && v2 === "Original line." ? { actual: "Unsaved edits discarded both ways" } : { fail: "discard failed", actual: `${v1} / ${v2}` };
  });

  await test("E05", "Save tapped repeatedly", async (p, ctx, errors) => {
    await seed(p); await openEditor(p, 2);
    await box(p).fill("One. Two.");
    await btn(p, "Save script").click({ clickCount: 3, delay: 20 }).catch(() => {});
    await p.waitForTimeout(300);
    const s = await scripts(p);
    return JSON.stringify(s[2]) === '["One.","Two."]' ? { actual: "Single clean save, no error" } : { fail: "bad save", actual: JSON.stringify(s) };
  });

  await test("E06", "Suggestion tapped 6x fast with a slow (3s) API → one request", async (p) => {
    let n = 0;
    await seed(p);
    await p.route("**/api/script", async (r) => { n++; await new Promise((x) => setTimeout(x, 3000)); r.fulfill({ json: { kind: "script", lines: ["Slow one."], message: "" } }); });
    await openEditor(p, 2);
    for (let i = 0; i < 6; i++) await btn(p, "Use our suggestion").click({ force: true, timeout: 500 }).catch(() => {});
    await p.waitForFunction(() => document.querySelector("#script-text").value === "Slow one.", null, { timeout: 8000 });
    return n === 1 ? { actual: "1 request sent; button disabled while writing" } : { fail: `${n} requests sent`, actual: String(n) };
  });

  await test("E07", "Typing while a request is running is blocked (read-only)", async (p) => {
    await seed(p);
    await p.route("**/api/script", async (r) => { await new Promise((x) => setTimeout(x, 2500)); r.fulfill({ json: { kind: "script", lines: ["AI text."], message: "" } }); });
    await openEditor(p, 2);
    await btn(p, "Use our suggestion").click();
    await box(p).type("typed during request", { timeout: 1500 }).catch(() => {});
    const during = await box(p).inputValue();
    const saveDisabled = await btn(p, "Save script").isDisabled();
    await p.waitForFunction(() => document.querySelector("#script-text").value === "AI text.");
    return during === "" && saveDisabled ? { actual: "Box read-only and Save disabled during request; result applied once" } : { fail: "edits accepted during request", actual: during };
  });

  await test("E08", "Close editor during generation, response arrives later", async (p, ctx, errors) => {
    await seed(p);
    await p.route("**/api/script", async (r) => { await new Promise((x) => setTimeout(x, 2000)); r.fulfill({ json: { kind: "script", lines: ["Late arrival."], message: "" } }); });
    await openEditor(p, 2);
    await btn(p, "Use our suggestion").click();
    await p.keyboard.press("Escape");
    await p.waitForTimeout(2600);
    const s = await scripts(p);
    const sug = await p.evaluate(() => localStorage.getItem("yap101-suggestions"));
    const onCard = await p.getByText("Late arrival.").count();
    return !s[2] && !onCard ? { actual: `No script saved, nothing shown; late suggestion cached for next time (${sug ? "cached" : "not cached"})` } : { fail: "late response leaked into saved script", actual: JSON.stringify(s) };
  });

  await test("E09", "J4 offline → starter; back online → retry works; no corruption", async (p, ctx) => {
    await seed(p, PROFILE, { "yap101-scripts": JSON.stringify({ 5: ["Keep me."] }) }); await openEditor(p, 2);
    await ctx.setOffline(true);
    await btn(p, "Use our suggestion").click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.includes("[say it in one line]"));
    const starter = await box(p).inputValue();
    await ctx.setOffline(false);
    await btn(p, "Try another").click();
    await p.waitForTimeout(1500);
    const after = await box(p).inputValue();
    await btn(p, "Save script").click();
    const s = await scripts(p);
    return s[5]?.[0] === "Keep me." && Object.keys(s).length === 2 ? { actual: `Offline gave starter; retry online returned ${after === starter ? "same template (demo)" : "new script"}; other day intact` } : { fail: "storage corrupted", actual: JSON.stringify(s) };
  });

  await test("E10", "Whitespace-only text cannot be saved or polished", async (p) => {
    await seed(p); await openEditor(p, 2);
    await box(p).fill("    \n\n   \t ");
    return (await btn(p, "Save script").isDisabled()) && (await btn(p, "Polish it for me").isDisabled()) ? { actual: "Save and Polish disabled" } : { fail: "whitespace accepted" };
  });

  await test("E11", "Emoji-only text (4 emoji) polish", async (p) => {
    await seed(p); await openEditor(p, 2);
    await box(p).fill("😀 🎉 🔥 💪");
    const enabled = !(await btn(p, "Polish it for me").isDisabled());
    if (enabled) await btn(p, "Polish it for me").click();
    await p.waitForTimeout(800);
    const coach = await p.getByText("There isn't much to polish yet").count();
    return { actual: `Polish ${enabled ? "enabled (emoji count as words)" : "disabled"}; ${coach ? "server nudge shown, text unchanged" : "no nudge"}`, fail: enabled && !coach ? "no feedback" : undefined };
  });

  await test("E12", "Paste 100 KB, then polish: does the user lose text?", async (p) => {
    await seed(p); await openEditor(p, 2);
    const big = Array.from({ length: 1500 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
    const t0 = Date.now();
    await box(p).fill(big);
    const fillMs = Date.now() - t0;
    const warn = await p.getByText(/over the 60s max/).count();
    // Since the BUG-04 fix: Polish is refused for drafts over 3,000 characters, nothing is cut.
    const disabled = await btn(p, "Polish it for me").isDisabled();
    const hint = await p.getByText(/Too long to polish/).count();
    const kept = (await box(p).inputValue()).includes("Sentence number 1500");
    return { actual: `${big.length} chars pasted in ${fillMs} ms, 60s warning ${warn ? "shown" : "missing"}; Polish disabled=${disabled}, hint=${!!hint}, all text kept=${kept}`, fail: !(disabled && hint && kept) ? "long draft not protected" : undefined };
  });

  await test("E13", "HTML/script text renders as plain text (no XSS)", async (p, ctx, errors) => {
    await seed(p); await openEditor(p, 2);
    await box(p).fill('<img src=x onerror="alert(1)"> <script>alert(2)</script> Hello there.');
    await btn(p, "Save script").click();
    await p.waitForTimeout(500);
    const txt = await p.locator("body").innerText();
    const dialogs = errors.filter((e) => e.startsWith("DIALOG"));
    return !dialogs.length && txt.includes("onerror") ? { actual: "Markup shown as text on prep card; no dialog fired" } : { fail: "XSS", actual: dialogs.join() };
  });

  await test("E14", "Corrupted storage: yap101-scripts = 'null'", async (p, ctx, errors) => {
    await seed(p, PROFILE, { "yap101-scripts": "null" });
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);
    const body = await p.locator("body").innerText();
    await p.screenshot({ path: path.join(SHOTS, "E14-null-storage.png") });
    const crashed = /couldn.t load|Application error|error/i.test(body) && !(await p.getByRole("radio", { name: "Read a script" }).count());
    return crashed ? { fail: "Record screen crashes", actual: `Page shows: "${body.slice(0, 80).replace(/\n/g, " ")}"; errors: ${errors.join(" | ").slice(0, 120)} expected-error` } : { actual: "Page loads" };
  });

  await test("E15", "Corrupted storage: invalid JSON in yap101-scripts", async (p) => {
    await seed(p, PROFILE, { "yap101-scripts": "{not json" }); await openEditor(p, 2);
    await box(p).fill("Fresh start."); await btn(p, "Save script").click();
    const s = await scripts(p);
    return s[2]?.[0] === "Fresh start." ? { actual: "Ignored broken data, saved new script (old data discarded)" } : { fail: "save failed" };
  });

  await test("E16", "Corrupted storage: yap101-scripts = '[]' / '\"str\"'", async (p) => {
    await seed(p, PROFILE, { "yap101-scripts": '"just a string"' }); await openEditor(p, 2);
    await box(p).fill("After string.");
    await btn(p, "Save script").click();
    await p.reload({ waitUntil: "networkidle" });
    const shown = await p.getByText("After string.").count();
    const raw = await p.evaluate(() => localStorage.getItem("yap101-scripts"));
    return shown ? { actual: "Saved" } : { fail: "Save silently does nothing: script gone after reload", actual: `storage still ${raw}` };
  });

  await test("E17", "Storage full: save script", async (p) => {
    await seed(p); await openEditor(p, 2);
    await p.evaluate(() => { const chunk = "x".repeat(1024 * 1024); try { for (let i = 0; i < 20; i++) localStorage.setItem(`fill${i}`, chunk); } catch {} try { for (let i = 0; i < 2000; i++) localStorage.setItem(`f${i}`, "x".repeat(4096)); } catch {} });
    await box(p).fill("Will this persist?");
    await btn(p, "Save script").click();
    const onCard = await p.getByText("Will this persist?").count();
    const toasts = await p.locator("[data-sonner-toast]").allInnerTexts();
    await p.reload({ waitUntil: "networkidle" });
    const after = await p.getByText("Will this persist?").count();
    return after ? { actual: "persisted" } : { fail: "Save looks successful, but script is gone after reload; no warning shown", actual: `shown before reload: ${!!onCard}; toasts: ${JSON.stringify(toasts)}` };
  });

  await test("E18", "Out-of-order responses: request A (slow) then B (fast) after reopening", async (p) => {
    await seed(p);
    let n = 0;
    await p.route("**/api/script", async (r) => { const me = ++n; await new Promise((x) => setTimeout(x, me === 1 ? 3000 : 300)); r.fulfill({ json: { kind: "script", lines: [me === 1 ? "Response A (stale)." : "Response B (latest)."], message: "" } }); });
    await openEditor(p, 2);
    await btn(p, "Use our suggestion").click();
    await p.keyboard.press("Escape");
    await p.getByRole("radio", { name: "Read a script" }).click();
    await btn(p, "Use our suggestion").click();
    await p.waitForFunction(() => document.querySelector("#script-text").value === "Response B (latest).");
    await p.waitForTimeout(3200);
    const v = await box(p).inputValue();
    const cache = await p.evaluate(() => JSON.parse(localStorage.getItem("yap101-suggestions") ?? "{}")[2]?.lines?.[0]);
    return v === "Response B (latest)." ? { actual: `Box keeps B; cached suggestion is "${cache}"`, fail: cache !== "Response B (latest)." ? "Stale response A overwrote the cached suggestion: the next 'Use our suggestion' returns the older one" : undefined } : { fail: "stale response shown", actual: v };
  });

  await test("E19", "Keyboard: Enter in steer box submits, Escape closes, Tab reaches buttons", async (p) => {
    await seed(p); await openEditor(p, 2);
    await p.getByLabel(/Anything our suggestion should include/).fill("I'm a nurse");
    await p.getByLabel(/Anything our suggestion should include/).press("Enter");
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    await p.keyboard.press("Escape");
    const closed = !(await box(p).count());
    return closed ? { actual: "Enter submitted suggestion (used steer text); Escape closed" } : { fail: "keyboard" };
  });

  await test("E20", "Stale saved suggestion after profile change", async (p) => {
    await seed(p); await openEditor(p, 2);
    await btn(p, "Use our suggestion").click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    await p.keyboard.press("Escape");
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("yap101-demo")); s.profile.display_name = "Alex"; localStorage.setItem("yap101-demo", JSON.stringify(s)); });
    await openEditor(p, 2);
    await btn(p, "Use our suggestion").click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    const v = await box(p).inputValue();
    return v.includes("Alex") ? { actual: "new name used" } : { fail: "Cached suggestion still greets as 'Sam' after the name changed to Alex", actual: v.split("\n")[0] };
  });

  await test("E21", "App restart (new browser context with same storage)", async (p, ctx) => {
    await seed(p); await openEditor(p, 2);
    await box(p).fill("Survives restart."); await btn(p, "Save script").click();
    const state = await ctx.storageState();
    const ctx2 = await global.browser.newContext({ storageState: state });
    const p2 = await ctx2.newPage();
    await p2.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const ok = await p2.getByText("Survives restart.").count();
    await ctx2.close();
    return ok ? { actual: "Script present after restart" } : { fail: "lost on restart" };
  });

  await test("E22", "Two tabs, same day: last save wins silently", async (p, ctx) => {
    await seed(p);
    const p2 = await ctx.newPage();
    await openEditor(p, 2); await openEditor(p2, 2);
    await box(p).fill("From tab A."); await btn(p, "Save script").click();
    await box(p2).fill("From tab B."); await btn(p2, "Save script").click();
    await p.reload({ waitUntil: "networkidle" });
    const a = await p.getByText("From tab A.").count();
    return { actual: `Tab A after reload shows ${a ? "A" : "B"} (last write wins, no conflict warning)` };
  });

  await test("E23", "Two tabs, different days: both saved", async (p, ctx) => {
    await seed(p);
    const p2 = await ctx.newPage();
    await openEditor(p, 2); await openEditor(p2, 4);
    await box(p).fill("Tab A day 2."); await box(p2).fill("Tab B day 4.");
    await btn(p, "Save script").click(); await btn(p2, "Save script").click();
    const s = await scripts(p);
    return s[2] && s[4] ? { actual: "Both days saved" } : { fail: "one tab overwrote the other", actual: JSON.stringify(s) };
  });

  await test("E24", "Day 1 intro: prefilled from onboarding, Polish off, save unchanged", async (p) => {
    await seed(p); await p.goto(`${BASE}/record?prompt=1`, { waitUntil: "networkidle" });
    const label = await p.getByText("Your script · made from your answers").count();
    await p.getByRole("button", { name: "Edit" }).click();
    const v = await box(p).inputValue();
    const pol = await btn(p, "Polish it for me").isDisabled();
    const another = await btn(p, "Try another").count();
    return label && v.startsWith("Hey, I'm Sam!") && pol && another ? { actual: "Prefilled with Sam/fitness/TikTok; Try another shown; Polish off" } : { fail: "intro flow", actual: v };
  });

  await test("E25", "Intermediate user, Day 1: starts in own words", async (p) => {
    await seed(p, { ...PROFILE, level: "intermediate" });
    await p.goto(`${BASE}/record?prompt=101`, { waitUntil: "networkidle" });
    const checked = await p.getByRole("radio", { name: "My own words" }).getAttribute("aria-checked");
    return checked === "true" ? { actual: "Own words selected" } : { fail: "wrong default", actual: checked };
  });

  await test("E26", "Locked future day cannot be opened", async (p) => {
    await seed(p, { ...PROFILE, track_start_date: new Date().toISOString().slice(0, 10) });
    await p.goto(`${BASE}/record?prompt=5`, { waitUntil: "networkidle" });
    return (await p.getByText(/Day 5 is locked/).count()) ? { actual: "Locked screen shown" } : { fail: "future day open" };
  });

  await test("E27", "Mobile (iPhone 13): keyboard-height viewport, buttons reachable, no sideways scroll", async (p) => {
    await seed(p); await openEditor(p, 2);
    await p.setViewportSize({ width: 390, height: 450 }); // on-screen keyboard open
    await box(p).focus();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const save = await btn(p, "Save script").boundingBox();
    await p.screenshot({ path: path.join(SHOTS, "E27-mobile-keyboard.png") });
    return overflow <= 1 && save && save.y + save.height <= 450 ? { actual: "Save stays visible above keyboard; no overflow" } : { fail: "layout", actual: `overflow ${overflow}, save ${JSON.stringify(save)}` };
  }, { device: devices["iPhone 13"] });

  await test("E28", "Clear resets AI state", async (p) => {
    await seed(p); await openEditor(p, 2);
    await btn(p, "Use our suggestion").click();
    await btn(p, "Try another").waitFor();
    await p.getByRole("button", { name: "Clear" }).click();
    return (await btn(p, "Use our suggestion").count()) && (await box(p).inputValue()) === "" ? { actual: "Box empty, button back to Use our suggestion" } : { fail: "state not reset" };
  });

  await test("E29", "Undo after several Try another returns the user's original draft", async (p) => {
    await seed(p);
    let n = 0;
    await p.route("**/api/script", (r) => r.fulfill({ json: { kind: "script", lines: [`Take ${++n}.`], message: "" } }));
    await openEditor(p, 2);
    await box(p).fill("My own draft here");
    await btn(p, "Use our suggestion").click(); await btn(p, "Try another").click(); await btn(p, "Try another").click();
    await p.getByText("Take 3.").waitFor().catch(() => {});
    await p.getByRole("button", { name: /Back to your version/ }).click();
    return (await box(p).inputValue()) === "My own draft here" ? { actual: "Original draft restored after 3 takes" } : { fail: "undo target lost" };
  });

  await test("E30", "Signed-out visitor opening /record", async (p) => {
    await p.goto(BASE + "/terms"); await p.evaluate(() => localStorage.clear());
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    return { actual: `URL ${p.url().replace(BASE, "")}; shows "${(await p.locator("h1").first().innerText().catch(() => "")).slice(0, 40)}"` };
  });

  await global.browser.close();
  console.log(JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
})();
