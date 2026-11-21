/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Round 2: re-runs, in a real browser, exactly the scenarios that failed in round 1.
// Usage: node qa-report/scripts/verify-fixes.cjs http://localhost:3124 > qa-report/evidence/round2-verify-fixes.json
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3124";
const start = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
const prof = (name) => ({ display_name: name, niche: "fitness", platform: "tiktok", confidence: 2, level: "beginner", goal: "confidence", track_start_date: start, onboarded_at: "2026-11-01T00:00:00Z", yap_time: "morning" });
const out = [];

async function run(id, bug, fn) {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 400, height: 860 } }); const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(e.message)); p.on("dialog", (d) => d.accept());
  let r;
  try { r = await fn(p); } catch (e) { r = { pass: false, actual: "Exception: " + e.message.split("\n")[0] }; }
  if (errors.length) r = { pass: false, actual: `${r.actual}; page errors: ${errors.join(" | ")}` };
  out.push({ id, bug, status: r.pass ? "PASS" : "FAIL", actual: r.actual });
  process.stderr.write(`${id} ${bug} ${r.pass ? "PASS" : "FAIL"} :: ${r.actual}\n`);
  await b.close();
}
async function seed(p, profile = prof("Sam"), extra = {}) {
  await p.goto(BASE + "/terms");
  await p.evaluate(([pr, extra]) => { localStorage.clear(); localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: pr })); for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v); }, [profile, extra]);
}
const editor = async (p, id) => { await p.goto(`${BASE}/record?prompt=${id}`, { waitUntil: "networkidle" }); const e = p.getByRole("button", { name: "Edit" }); if (await e.count()) await e.click(); else await p.getByRole("radio", { name: "Read a script" }).click(); await p.locator("#script-text").waitFor(); };

(async () => {
  await run("V-E12", "BUG-04", async (p) => {
    await seed(p); await editor(p, 2);
    await p.fill("#script-text", Array.from({ length: 1500 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" "));
    const disabled = await p.getByRole("button", { name: "Polish it for me" }).isDisabled();
    const hint = await p.getByText(/Too long to polish/).count();
    const api = await p.evaluate(async () => (await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "polish", title: "X", draft: "word ".repeat(1000) }) })).status);
    return { pass: disabled && hint && api === 413, actual: `Polish disabled=${disabled}, hint shown=${!!hint}, API answers ${api} for a 5,000-char draft` };
  });
  await run("V-E14", "BUG-06", async (p) => {
    await seed(p, prof("Sam"), { "yap101-scripts": "null", "yap101-scripts-owner": "local" });
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const ok = await p.getByRole("radio", { name: "Read a script" }).count();
    return { pass: !!ok, actual: ok ? "Record screen loads with storage = null" : "still crashes" };
  });
  await run("V-E16", "BUG-09", async (p) => {
    await seed(p, prof("Sam"), { "yap101-scripts": '"just a string"', "yap101-scripts-owner": "local" }); await editor(p, 2);
    await p.fill("#script-text", "After string."); await p.getByRole("button", { name: "Save script" }).click();
    await p.reload({ waitUntil: "networkidle" });
    const ok = await p.getByText("After string.").count();
    return { pass: !!ok, actual: ok ? "Saved over the bad value; present after reload" : "lost" };
  });
  await run("V-E17b", "BUG-05", async (p) => {
    await seed(p); await editor(p, 2);
    const state = await p.evaluate(() => { let n = 0, size = 1 << 20; while (size >= 16) { try { localStorage.setItem(`fill-${n++}`, "x".repeat(size)); } catch { size >>= 1; } } try { localStorage.setItem("probe", "x".repeat(64)); return "NOT FULL"; } catch { return "FULL"; } });
    await p.fill("#script-text", "Will this persist?"); await p.getByRole("button", { name: "Save script" }).click();
    const toast = await p.getByText(/Couldn't save the script on this device/).count();
    return { pass: state === "FULL" && !!toast, actual: `storage ${state}; warning toast ${toast ? "shown" : "missing"}` };
  });
  await run("V-E18", "BUG-11", async (p) => {
    await seed(p);
    let n = 0;
    await p.route("**/api/script", async (r) => { const me = ++n; await new Promise((x) => setTimeout(x, me === 1 ? 3000 : 300)); r.fulfill({ json: { kind: "script", lines: [me === 1 ? "Response A (stale)." : "Response B (latest)."], message: "" } }).catch(() => {}); });
    await editor(p, 2);
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.keyboard.press("Escape");
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value === "Response B (latest).");
    await p.waitForTimeout(3200);
    const cache = await p.evaluate(() => JSON.parse(localStorage.getItem("yap101-suggestions") ?? "{}")[2]?.lines?.[0]);
    return { pass: cache === "Response B (latest).", actual: `cached suggestion: "${cache}"` };
  });
  await run("V-E20", "BUG-12", async (p) => {
    await seed(p); await editor(p, 2);
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    await p.keyboard.press("Escape");
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("yap101-demo")); s.profile.display_name = "Alex"; localStorage.setItem("yap101-demo", JSON.stringify(s)); });
    await editor(p, 2);
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0);
    const first = (await p.inputValue("#script-text")).split("\n")[0];
    return { pass: first.includes("Alex"), actual: first };
  });
  await run("V-E31", "BUG-18", async (p) => {
    const sent = []; p.on("request", (r) => r.url().endsWith("/api/script") && sent.push(JSON.parse(r.postData())));
    await seed(p);
    await p.goto(`${BASE}/record?prompt=3`, { waitUntil: "networkidle" }); // claims the device for this person
    await p.evaluate(() => localStorage.setItem("yap101-scripts", JSON.stringify({ 3: ["My private story about my divorce."] })));
    await p.goto(BASE + "/profile", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Sign out" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/profile"));
    const left = await p.evaluate(() => localStorage.getItem("yap101-scripts"));
    await p.evaluate((pr) => localStorage.setItem("yap101-demo", JSON.stringify({ signedIn: true, yaps: [], profile: pr })), prof("Alex"));
    await p.goto(`${BASE}/record?prompt=3`, { waitUntil: "networkidle" });
    const sees = await p.getByText("My private story").count();
    await editor(p, 2);
    await p.getByLabel(/Anything our suggestion should include/).fill("new");
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForTimeout(800);
    const leaked = sent.some((s) => (s.previous ?? []).join(" ").includes("divorce"));
    return { pass: left === null && !sees && !leaked, actual: `after sign-out storage=${left}; next person sees it=${!!sees}; sent to AI=${leaked}` };
  });
  await run("V-E32", "BUG-19", async (p) => {
    await seed(p, prof("Sam"), { "yap101-scripts": '{"2":["Private."]}', "yap101-suggestions": '{"2":{"sig":"x","lines":["C."]}}' });
    await p.goto(BASE + "/profile", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Delete my guest data" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/profile"));
    const left = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("yap101-scripts") || k === "yap101-suggestions"));
    return { pass: left.length === 0, actual: `keys left: ${JSON.stringify(left)}` };
  });
  await run("V-A20/26", "BUG-10", async (p) => {
    await seed(p);
    const r = await p.evaluate(async () => {
      const post = (body, headers) => fetch("/api/script", { method: "POST", headers, body }).then((x) => x.status);
      return {
        big: await post(JSON.stringify({ mode: "suggest", title: "X", previous: ["x".repeat(5_000_000)] }), { "Content-Type": "application/json" }),
        textPlain: await post(JSON.stringify({ mode: "suggest", title: "X" }), { "Content-Type": "text/plain" }),
        ok: await post(JSON.stringify({ mode: "suggest", title: "X" }), { "Content-Type": "application/json" }),
      };
    });
    const cross = await fetch(`${BASE}/api/script`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ mode: "suggest", title: "X" }) }).then((x) => x.status);
    return { pass: r.big === 413 && r.textPlain === 415 && r.ok === 200 && cross === 403, actual: `5 MB → ${r.big}; text/plain → ${r.textPlain}; same-site JSON → ${r.ok}; Origin evil.example → ${cross}` };
  });
  await run("V-CANCEL", "BUG-21", async (p) => {
    await seed(p);
    await p.route("**/api/script", async (r) => { await new Promise((x) => setTimeout(x, 4000)); r.fulfill({ json: { kind: "script", lines: ["Too late."], message: "" } }).catch(() => {}); });
    await editor(p, 2);
    await p.fill("#script-text", "my own words for today here");
    await p.getByRole("button", { name: "Polish it for me" }).click();
    await p.getByRole("button", { name: "Cancel" }).click();
    await p.waitForTimeout(4500);
    const v = await p.inputValue("#script-text");
    const enabled = !(await p.getByRole("button", { name: "Polish it for me" }).isDisabled());
    return { pass: v === "my own words for today here" && enabled, actual: `box after cancel + 4.5 s: "${v}"; Polish enabled=${enabled}` };
  });
  console.log(JSON.stringify({ at: new Date().toISOString(), base: BASE, results: out }, null, 2));
})();
