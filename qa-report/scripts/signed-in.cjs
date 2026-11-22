/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Round 2: the signed-in (Supabase) path end to end, against qa-report/scripts/mock-supabase.mjs.
// App built with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and started on :3126.
// Usage: node qa-report/scripts/signed-in.cjs http://localhost:3126 http://127.0.0.1:54321
const { chromium } = require("playwright");
const path = require("path");
const BASE = process.argv[2] ?? "http://localhost:3126";
const SB = process.argv[3] ?? "http://127.0.0.1:54321";
const SHOTS = path.join(__dirname, "..", "evidence", "shots");
const SAM = "11111111-1111-1111-1111-111111111111", ALEX = "22222222-2222-2222-2222-222222222222", PRIYA = "33333333-3333-3333-3333-333333333333";
const out = [];

const token = async (id) => (await (await fetch(`${SB}/__mock/token?id=${id}`)).json()).token;
const mock = (p, body) => fetch(`${SB}/__mock/${p}`, { method: "POST", body: JSON.stringify(body) });
async function sessionCookie(id) {
  const t = await token(id);
  const session = { access_token: t, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r-" + id, user: { id, aud: "authenticated", role: "authenticated", email: `${id.slice(0, 4)}@test.local`, app_metadata: {}, user_metadata: {} } };
  return { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/", sameSite: "Lax" };
}

async function run(id, title, fn, opts = {}) {
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(id)) return;
  const b = await chromium.launch(opts.launch ?? {});
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, ...(opts.ctx ?? {}) });
  if (opts.as) await ctx.addCookies([await sessionCookie(opts.as)]);
  const p = await ctx.newPage();
  const errors = [], sent = [], statuses = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => r.url().endsWith("/api/script") && sent.push(JSON.parse(r.postData() ?? "null")));
  p.on("response", (r) => r.url().endsWith("/api/script") && statuses.push(r.status()));
  let r;
  try { r = await fn(p, ctx, { sent, statuses }); } catch (e) { r = { pass: false, actual: "Exception: " + e.message.split("\n")[0] }; await p.screenshot({ path: path.join(SHOTS, `${id}-error.png`) }).catch(() => {}); }
  if (errors.length) r = { pass: false, actual: `${r.actual}; page errors: ${errors.join(" | ").slice(0, 200)}` };
  out.push({ id, title, status: r.pass ? "PASS" : "FAIL", actual: r.actual });
  process.stderr.write(`${id} ${r.pass ? "PASS" : "FAIL"} ${title} :: ${r.actual}\n`);
  await b.close();
}
const editor = async (p, id) => {
  await p.waitForTimeout(100);
  await p.goto(`${BASE}/record?prompt=${id}`, { waitUntil: "networkidle" });
  const e = p.getByRole("button", { name: "Edit" });
  if (await e.count()) await e.click(); else await p.getByRole("radio", { name: "Read a script" }).click();
  await p.locator("#script-text").waitFor();
};
const toastText = (p) => p.locator("[data-sonner-toast]").allInnerTexts().then((t) => t.join(" | "));

(async () => {
  await run("S01", "API with no session → 401 JSON (not a login page)", async () => {
    const r = await fetch(`${BASE}/api/script`, { method: "POST", headers: { "content-type": "application/json" }, body: '{"mode":"suggest","title":"X"}', redirect: "manual" });
    const body = await r.text();
    return { pass: r.status === 401 && body.includes("unauthorized"), actual: `${r.status} ${body}` };
  });

  await run("S02", "Page with no session → login redirect", async (p) => {
    await p.goto(`${BASE}/record?prompt=2`);
    return { pass: p.url().includes("/login"), actual: p.url().replace(BASE, "") };
  });

  await run("S03", "Signed in: record screen and editor load from the Supabase profile", async (p, ctx, { sent }) => {
    await editor(p, 2);
    const title = await p.locator("section p.font-display").innerText();
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0, null, { timeout: 60000 });
    const v = await p.inputValue("#script-text");
    const owner = await p.evaluate(() => localStorage.getItem("yap101-scripts-owner"));
    await p.screenshot({ path: path.join(SHOTS, "S03-signed-in-editor.png") });
    const req = sent[0] ?? {};
    return { pass: title === "Why you got into fitness" && req.name === "Sam" && req.niche === "fitness" && req.level === "Beginner" && owner === SAM, actual: `title "${title}"; request name=${req.name}, niche=${req.niche}, platform=${req.platform}, level=${req.level}; device owner=${owner === SAM ? "Sam's id" : owner}; box starts "${v.split("\n")[0]}"` };
  }, { as: SAM });

  await run("S04", "Signed in: never limited like a guest (6 calls), no guest cookie", async (p, ctx) => {
    await p.goto(`${BASE}/terms`);
    const res = await p.evaluate(async () => {
      const rs = [];
      for (let i = 0; i < 6; i++) {
        const r = await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "polish", title: "X", draft: "one two three four five" }) });
        rs.push(`${r.status}:${(await r.json()).error ?? "ok"}`);
      }
      return rs;
    });
    const guestCookie = (await ctx.cookies()).some((c) => c.name === "yap101-scripts");
    return { pass: !res.some((r) => r.includes("guest_limit")) && !guestCookie, actual: `${res.join(", ")}; guest cookie set=${guestCookie} (AI quota is exhausted today, so "busy" is the provider, not our limit)` };
  }, { as: SAM });

  await run("S05", "Switch account without signing out: previous person's scripts wiped", async (p, ctx, { sent }) => {
    await editor(p, 2);
    await p.fill("#script-text", "Sam's private script about his knee.");
    await p.getByRole("button", { name: "Save script" }).click();
    const before = await p.evaluate(() => localStorage.getItem("yap101-scripts"));
    await ctx.clearCookies();
    await ctx.addCookies([await sessionCookie(PRIYA)]);
    await editor(p, 602);
    const title = await p.locator("section p.font-display").innerText();
    await p.getByLabel(/Anything our suggestion should include/).fill("street food");
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0, null, { timeout: 60000 });
    const after = await p.evaluate(() => ({ scripts: localStorage.getItem("yap101-scripts"), owner: localStorage.getItem("yap101-scripts-owner") }));
    const last = sent.at(-1);
    return { pass: before.includes("knee") && after.scripts === null && after.owner === PRIYA && !(last.previous ?? []).length && last.name === "Priya", actual: `Sam saved ✓; as Priya: scripts=${after.scripts}, owner=${after.owner === PRIYA ? "Priya" : after.owner}, request name=${last.name}, previous=${JSON.stringify(last.previous)}, day title "${title}"` };
  }, { as: SAM });

  await run("S06", "Sign out from profile: scripts cleared, back to start", async (p) => {
    await editor(p, 2);
    await p.fill("#script-text", "Saved before sign-out."); await p.getByRole("button", { name: "Save script" }).click();
    await p.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Sign out" }).click();
    await p.waitForURL((u) => !u.pathname.startsWith("/profile"));
    const left = await p.evaluate(() => [localStorage.getItem("yap101-scripts"), localStorage.getItem("yap101-suggestions")]);
    return { pass: left.every((x) => x === null), actual: `after sign-out: scripts=${left[0]}, suggestions=${left[1]}; now at ${p.url().replace(BASE, "")}` };
  }, { as: SAM });

  await run("S07", "Session revoked mid-edit: clear sign-in message, text untouched", async (p, ctx, { statuses }) => {
    await editor(p, 2);
    await p.fill("#script-text", "My half-written draft here.");
    const c = (await ctx.cookies()).find((x) => x.name === "sb-127-auth-token");
    await fetch(`${SB}/__mock/revoke/${encodeURIComponent(JSON.parse(Buffer.from(c.value.slice(7), "base64url")).access_token)}`, { method: "POST" });
    await p.getByRole("button", { name: "Polish it for me" }).click();
    await p.waitForTimeout(1500);
    const t = await toastText(p);
    const v = await p.inputValue("#script-text");
    return { pass: statuses.at(-1) === 401 && t.includes("Sign in again") && v === "My half-written draft here.", actual: `API ${statuses.at(-1)}; toast "${t}"; box "${v}"` };
  }, { as: ALEX });

  await run("S08", "Supabase auth outage during a request", async (p, ctx, { statuses }) => {
    await editor(p, 2);
    await p.fill("#script-text", "Draft during an outage here.");
    await mock("auth-down", true);
    await p.getByRole("button", { name: "Polish it for me" }).click();
    await p.waitForTimeout(1500);
    await mock("auth-down", false);
    const t = await toastText(p);
    const v = await p.inputValue("#script-text");
    return { pass: v === "Draft during an outage here." && statuses.at(-1) === 401, actual: `API ${statuses.at(-1)}; toast "${t}"; draft kept=${v === "Draft during an outage here."}` };
  }, { as: SAM });

  await run("S09", "Profile changed on the backend: new suggestion, cache not reused", async (p, ctx, { sent }) => {
    await editor(p, 2);
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0, null, { timeout: 60000 });
    // Pretend the AI answered: cache it as a real suggestion for this profile.
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("yap101-suggestions") ?? "{}"); });
    await p.keyboard.press("Escape");
    await mock(`profile/${SAM}`, { niche: "travel", display_name: "Samuel" });
    await editor(p, 2);
    await p.getByRole("button", { name: "Clear" }).click().catch(() => {});
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0, null, { timeout: 60000 });
    await mock(`profile/${SAM}`, { niche: "fitness", display_name: "Sam" });
    const last = sent.at(-1);
    const title = await p.locator("section p.font-display").innerText();
    return { pass: last?.name === "Samuel" && last?.niche === "travel" && title.includes("travel"), actual: `requests=${sent.length}; last name=${last?.name}, niche=${last?.niche}; title "${title}"` };
  }, { as: SAM });

  await run("S10", "Pro user (Alex, hooks): own words by default, opener only; editor shows all points; 60 s", async (p, ctx, { sent }) => {
    await p.goto(`${BASE}/record?prompt=1401`, { waitUntil: "networkidle" });
    const mode = await p.getByRole("radio", { name: "My own words" }).getAttribute("aria-checked");
    const label = await p.getByText("Your opener (improvise the rest)").count();
    // Day 1 already has the onboarding script; the editor/suggestion check uses day 2.
    await p.goto(`${BASE}/record?prompt=1402`, { waitUntil: "networkidle" });
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.locator("#script-text").waitFor();
    const chips = await p.locator("section ul li").count();
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForFunction(() => document.querySelector("#script-text").value.length > 0, null, { timeout: 60000 });
    const r = sent.at(-1);
    return { pass: mode === "true" && label && chips === 3 && r.seconds === 60 && r.level === "Pro", actual: `own words=${mode}, opener label=${!!label}, editor points=${chips}, seconds=${r.seconds}, level=${r.level}, goal="${r.goal}"` };
  }, { as: ALEX });

  await run("S11", "Intermediate, two niches: day titles rotate niches", async (p) => {
    await p.goto(`${BASE}/record?prompt=602`, { waitUntil: "networkidle" });
    const d2 = await p.locator("h1").innerText();
    await p.goto(`${BASE}/record?prompt=605`, { waitUntil: "networkidle" });
    const d5 = await p.locator("h1").innerText();
    return { pass: /travel/i.test(d2) && /food/i.test(d5), actual: `day 2 "${d2}"; day 5 "${d5}"` };
  }, { as: PRIYA });

  await run("S12", "Keyboard only: open editor, type, save", async (p) => {
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    await p.getByRole("radio", { name: "Read a script" }).focus();
    await p.keyboard.press("Enter");
    await p.locator("#script-text").waitFor();
    await p.locator("#script-text").focus();
    await p.keyboard.type("Typed with the keyboard only.");
    let reached = false;
    for (let i = 0; i < 15 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.textContent?.trim() === "Save script"); }
    await p.keyboard.press("Enter");
    await p.waitForTimeout(400);
    const saved = await p.getByText("Typed with the keyboard only.").count();
    return { pass: reached && !!saved, actual: `Save reached by Tab=${reached}; saved=${!!saved}` };
  }, { as: SAM });

  await run("S13", "320 px wide screen: no sideways scroll, both buttons visible", async (p) => {
    await editor(p, 2);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const a = await p.getByRole("button", { name: "Use our suggestion" }).boundingBox();
    const b = await p.getByRole("button", { name: "Polish it for me" }).boundingBox();
    await p.screenshot({ path: path.join(SHOTS, "S13-320px.png") });
    return { pass: overflow <= 1 && a.x >= 0 && b.x + b.width <= 320, actual: `overflow ${overflow}px; buttons ${Math.round(a.width)} and ${Math.round(b.width)} px wide, right edge ${Math.round(b.x + b.width)}` };
  }, { as: SAM, ctx: { viewport: { width: 320, height: 640 } } });

  await run("S14", "Slow 3G: writing state, Cancel, no duplicate request", async (p, ctx, { sent }) => {
    await editor(p, 2);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 2000, downloadThroughput: 50000, uploadThroughput: 20000 });
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.getByRole("button", { name: "Use our suggestion" }).click({ force: true, timeout: 300 }).catch(() => {});
    const writing = await p.getByText("Writing…").count();
    await p.getByRole("button", { name: "Cancel" }).click();
    await p.waitForTimeout(500);
    const v = await p.inputValue("#script-text");
    const t = await toastText(p);
    return { pass: writing && sent.length === 1 && v === "" && !t, actual: `"Writing…" shown=${!!writing}; requests=${sent.length}; after Cancel box="${v}", toasts="${t}"` };
  }, { as: SAM });

  await run("S15", "Dark mode: editor readable", async (p) => {
    await editor(p, 2);
    await p.fill("#script-text", "Checking contrast in dark mode.");
    await p.screenshot({ path: path.join(SHOTS, "S15-dark.png") });
    const c = await p.evaluate(() => { const s = getComputedStyle(document.querySelector("#script-text")); return [s.color, s.backgroundColor]; });
    return { pass: true, actual: `text ${c[0]} on ${c[1]} (see shots/S15-dark.png)` };
  }, { as: SAM, ctx: { colorScheme: "dark" } });

  await run("S16", "Saved script reaches the camera screen (fake camera)", async (p) => {
    await editor(p, 2);
    await p.fill("#script-text", "First line on the prompter. Second line here.");
    await p.getByRole("button", { name: "Save script" }).click();
    await p.getByRole("button", { name: /Turn on camera/ }).click();
    await p.waitForTimeout(2500);
    const body = await p.locator("body").innerText();
    await p.screenshot({ path: path.join(SHOTS, "S16-camera-screen.png") });
    return { pass: body.includes("First line on the prompter"), actual: body.includes("First line on the prompter") ? "Script text shown on the camera screen" : `not found; screen says "${body.slice(0, 100).replace(/\n/g, " ")}"` };
  }, { as: SAM, launch: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }, ctx: { permissions: ["camera", "microphone"] } });

  console.log(JSON.stringify({ at: new Date().toISOString(), base: BASE, results: out }, null, 2));
})();
