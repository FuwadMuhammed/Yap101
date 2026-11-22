/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Phase 2: authentication, user isolation, recovery, failure injection, layout and accessibility,
// against the Supabase-mode build + mock Supabase. Audit only: no app code is changed.
// Usage: node qa-report/scripts/phase2.cjs <app with AI key> <app without key> <mock supabase>
const { chromium } = require("playwright");
const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const [BASE, BASE_NOKEY, SB] = [process.argv[2] ?? "http://localhost:3126", process.argv[3] ?? "http://localhost:3127", process.argv[4] ?? "http://127.0.0.1:54321"];
const SHOTS = path.join(__dirname, "..", "evidence", "shots", "phase2");
fs.mkdirSync(SHOTS, { recursive: true });
const SAM = "11111111-1111-1111-1111-111111111111", PRIYA = "33333333-3333-3333-3333-333333333333";
const out = [];

const mock = (p, body) => fetch(`${SB}/__mock/${p}`, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());
async function cookie(id, { ttl = 86400, refresh = "r-" + id } = {}) {
  const { token } = await mock(`token?id=${id}&ttl=${ttl}`);
  const s = { access_token: token, token_type: "bearer", expires_in: ttl, expires_at: Math.floor(Date.now() / 1000) + ttl, refresh_token: refresh, user: { id, aud: "authenticated", role: "authenticated", email: `${id.slice(0, 4)}@test.local`, app_metadata: {}, user_metadata: {} } };
  return { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(s)).toString("base64url"), domain: "localhost", path: "/", sameSite: "Lax" };
}
async function run(id, area, title, fn, opts = {}) {
  if (process.env.ONLY && !process.env.ONLY.split(",").includes(id)) return;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, ...(opts.ctx ?? {}) });
  if (opts.as) await ctx.addCookies([await cookie(opts.as, opts.cookie)]);
  if (opts.extraCookies) await ctx.addCookies(opts.extraCookies);
  const p = await ctx.newPage();
  const errors = [], sent = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => r.url().endsWith("/api/script") && sent.push(JSON.parse(r.postData() ?? "null")));
  let r;
  try { r = await fn(p, ctx, { sent, errors }); } catch (e) { r = { status: "FAIL", actual: "Exception: " + e.message.split("\n")[0] }; await p.screenshot({ path: path.join(SHOTS, `${id}-error.png`) }).catch(() => {}); }
  if (errors.length && !r.allowErrors) r = { ...r, status: "FAIL", actual: `${r.actual}; page errors: ${errors.join(" | ").slice(0, 200)}` };
  out.push({ id, area, title, status: r.status, actual: r.actual, severity: r.severity, at: new Date().toISOString() });
  process.stderr.write(`${id} [${area}] ${r.status} ${title} :: ${r.actual}\n`);
  await b.close();
}
const ok = (cond, actual, severity) => ({ status: cond ? "PASS" : "FAIL", actual, severity: cond ? undefined : severity });
const editor = async (p, base, id) => {
  await p.waitForTimeout(100);
  await p.goto(`${base}/record?prompt=${id}`, { waitUntil: "networkidle" });
  const e = p.getByRole("button", { name: "Edit" });
  if (await e.count()) await e.click(); else await p.getByRole("radio", { name: "Read a script" }).click();
  await p.locator("#script-text").waitFor();
};
const toasts = (p) => p.locator("[data-sonner-toast]").allInnerTexts().then((t) => t.join(" | "));

(async () => {
  // ---------- A. Authentication and accounts ----------
  await run("A1", "Auth", "Expired access token + valid refresh token: silently refreshed", async (p) => {
    const before = (await mock("refreshes")).length;
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const onRecord = p.url().includes("/record");
    const st = await p.evaluate(async () => (await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "suggest", title: "X" }) })).status);
    const refreshed = (await mock("refreshes")).slice(before).filter((r) => r.ok).length;
    return ok(onRecord && st !== 401 && refreshed > 0, `stayed on /record=${onRecord}; API status ${st} (not 401); successful refreshes=${refreshed}`, "P1");
  }, { as: SAM, cookie: { ttl: -120 } });

  await run("A2", "Auth", "Expired access token + invalid refresh token: signed out cleanly", async (p) => {
    await p.goto(`${BASE}/record?prompt=2`);
    const page = p.url().replace(BASE, "");
    const st = await p.evaluate(async () => (await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "suggest", title: "X" }) })).status);
    return ok(page.startsWith("/login") && st === 401, `page → ${page}; API → ${st}`, "P1");
  }, { as: SAM, cookie: { ttl: -120, refresh: "r-bogus" } });

  await run("A3", "Isolation", "Account switched in another tab while the first tab is still open", async (p, ctx, { sent }) => {
    await editor(p, BASE, 2); // tab A: Sam's editor open
    await ctx.clearCookies();
    await ctx.addCookies([await cookie(PRIYA)]);
    const p2 = await ctx.newPage(); // tab B: Priya signs in on the same browser
    const sent2 = []; p2.on("request", (r) => r.url().endsWith("/api/script") && sent2.push(JSON.parse(r.postData() ?? "null")));
    await p2.goto(`${BASE}/record?prompt=602`, { waitUntil: "networkidle" });
    const ownerAfterB = await p2.evaluate(() => localStorage.getItem("yap101-scripts-owner"));
    await p.fill("#script-text", "Sam's private script from the old tab."); // tab A saves after the switch
    await p.getByRole("button", { name: "Save script" }).click();
    await p2.getByRole("radio", { name: "Read a script" }).click();
    await p2.getByLabel(/Anything our suggestion should include/).fill("x");
    await p2.getByRole("button", { name: "Use our suggestion" }).click();
    await p2.waitForTimeout(1500);
    const leakedToAi = sent2.some((s) => (s.previous ?? []).join(" ").includes("Sam's private"));
    await p2.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const priyaSees = await p2.getByText("Sam's private script").count();
    return ok(!leakedToAi && !priyaSees, `owner after Priya's tab=${ownerAfterB === PRIYA ? "Priya" : ownerAfterB}; Sam's stale tab then tried to save; Priya sees it on /record?prompt=2=${!!priyaSees}; sent to AI in Priya's request=${leakedToAi}`, "P1");
  }, { as: SAM });

  await run("A4", "Isolation", "Same user, two devices: scripts don't follow the account", async (p) => {
    await editor(p, BASE, 2);
    await p.fill("#script-text", "Written on device one."); await p.getByRole("button", { name: "Save script" }).click();
    const b2 = await chromium.launch(); const c2 = await b2.newContext(); await c2.addCookies([await cookie(SAM)]);
    const q = await c2.newPage(); await q.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const there = await q.getByText("Written on device one.").count(); await b2.close();
    return { status: "PASS", actual: `device two sees the script=${!!there} (scripts are device-only by design: product decision, not a defect)` };
  }, { as: SAM });

  await run("A5", "Guest removal", "Signed-in user who still has the guest cookie", async (p) => {
    const logBefore = (await mock("log")).length;
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const url = p.url().replace(BASE, "");
    const banner = await p.getByText(/Guest mode|Demo mode/).count();
    const h1 = await p.locator("h1").first().innerText().catch(() => "");
    const calls = (await mock("log")).slice(logBefore).filter((l) => l.path.startsWith("/rest/v1/profiles")).length;
    return ok(calls > 0 && !banner, `landed on ${url}; heading "${h1}"; guest/demo banner=${!!banner}; Supabase profile requests=${calls} (0 = the app ignored the real account and used the browser-only guest store)`, "P1");
  }, { as: SAM, extraCookies: [{ name: "yap101-guest", value: "1", domain: "localhost", path: "/" }] });

  await run("A6", "Security", "User-id manipulation in the API body is ignored; no server-side script store to reach", async (p) => {
    await p.goto(`${BASE}/terms`);
    const r = await p.evaluate(async () => {
      const post = (b) => fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(async (x) => `${x.status}:${JSON.stringify(await x.json())}`);
      return [await post({ mode: "suggest", title: "X", userId: "22222222-2222-2222-2222-222222222222", user_id: "x", id: "x" }), await post({ mode: "suggest", title: "X" })];
    });
    return ok(r[0] === r[1], `with foreign user ids: ${r[0]} | without: ${r[1]} (identical: ids ignored)`, "P1");
  }, { as: SAM });

  // ---------- D. Security (client side) ----------
  await run("D1", "Security", "HTML in an AI question/coach message renders as text", async (p, ctx, { errors }) => {
    await p.route("**/api/script", (r) => r.fulfill({ json: { kind: "question", lines: [], message: '<img src=x onerror="window.__pwned=1">Which part?' } }));
    await editor(p, BASE, 2);
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.getByText(/Which part\?/).waitFor();
    const pwned = await p.evaluate(() => window.__pwned === 1);
    return ok(!pwned, `script executed=${pwned}; markup shown as text`, "P0");
  }, { as: SAM });

  // ---------- E. Recovery / reliability ----------
  await run("E1", "Recovery", "Backend restarts while a request is in flight", async (p) => {
    await editor(p, BASE_NOKEY, 2);
    await p.fill("#script-text", "draft before the restart here");
    await mock("auth-delay", 4000);
    await p.getByRole("button", { name: "Polish it for me" }).click();
    await p.waitForTimeout(800);
    const pid = execSync("pgrep -f 'next start -p 3127' | head -1").toString().trim();
    const kids = execSync(`pgrep -P ${pid} || true`).toString().trim().split("\n").filter(Boolean);
    for (const k of [...kids, pid]) try { process.kill(Number(k), "SIGKILL"); } catch {}
    try { execSync("pkill -9 -f 'next-server' -P 1 2>/dev/null || true"); } catch {}
    await p.waitForTimeout(5000);
    await mock("auth-delay", 0);
    const box = await p.inputValue("#script-text");
    const t = await toasts(p);
    const child = spawn("npx", ["next", "start", "-p", "3127"], { cwd: path.join(__dirname, "..", ".."), detached: true, stdio: "ignore" }); child.unref();
    for (let i = 0; i < 60; i++) { try { await fetch(`${BASE_NOKEY}/terms`); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
    await p.getByRole("button", { name: /Polish it for me|Back to your version/ }).first().waitFor();
    return ok(box.length > 0 && !box.includes("undefined"), `after the server died: box="${box.slice(0, 60)}"; message="${t.slice(0, 120)}"; server restarted for later tests`, "P1");
  }, { as: SAM });

  await run("E2", "Recovery", "Network drops mid-request, then returns", async (p, ctx) => {
    await editor(p, BASE_NOKEY, 2);
    await mock("auth-delay", 2500);
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForTimeout(500);
    await ctx.setOffline(true);
    await p.waitForTimeout(3000);
    await ctx.setOffline(false);
    await mock("auth-delay", 0);
    const v = await p.inputValue("#script-text");
    const saved = await p.evaluate(() => localStorage.getItem("yap101-scripts"));
    return ok(v.includes("[say it in one line]") && saved === null, `box got the offline starter=${v.includes("[say it in one line]")}; nothing saved behind the user's back=${saved === null}`, "P2");
  }, { as: SAM });

  await run("E3", "Recovery", "localStorage completely unavailable (blocked by the browser)", async (p, ctx, { errors }) => {
    await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } }); });
    await editor(p, BASE, 2);
    await p.fill("#script-text", "Works without storage.");
    await p.getByRole("button", { name: "Save script" }).click();
    const card = await p.getByText("Works without storage.").count();
    const t = await toasts(p);
    return { ...ok(card > 0 && errors.length === 0, `editor opened, script used for this visit=${!!card}; warning="${t.slice(0, 90)}"; page errors=${errors.length}`, "P2"), allowErrors: true };
  }, { as: SAM });

  // ---------- H. Failure injection ----------
  for (const [id, label, fulfill, expect] of [
    ["H1", "API returns 500 with an HTML error page", { status: 500, contentType: "text/html", body: "<html><body>Internal Server Error</body></html>" }, "starter"],
    ["H2", "API returns 200 with malformed JSON", { status: 200, contentType: "application/json", body: '{"kind":"script","lines":["broken' }, "starter"],
    ["H3", "API returns 200 with an empty object", { status: 200, contentType: "application/json", body: "{}" }, "starter"],
    ["H4", "API returns lines that are not strings", { status: 200, contentType: "application/json", body: '{"kind":"script","lines":[1,{"a":2},null],"message":""}' }, "no-crash"],
  ])
    await run(id, "Failure injection", label, async (p, ctx, { errors }) => {
      await p.route("**/api/script", (r) => r.fulfill(fulfill));
      await editor(p, BASE, 2);
      await p.getByRole("button", { name: "Use our suggestion" }).click();
      await p.waitForTimeout(1200);
      const v = await p.inputValue("#script-text");
      const t = await toasts(p);
      const good = expect === "starter" ? v.includes("[say it in one line]") : errors.length === 0;
      return { ...ok(good && errors.length === 0, `box="${v.split("\n")[0].slice(0, 60)}"; message="${t.slice(0, 100)}"; page errors=${errors.join(" | ").slice(0, 120) || 0}`, "P2"), allowErrors: true };
    }, { as: SAM });

  await run("H5", "Failure injection", "Database unavailable when opening the record screen", async (p) => {
    await mock("db-down", true);
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const h1 = await p.locator("h1").first().innerText().catch(() => "");
    const body = (await p.locator("body").innerText()).slice(0, 160).replace(/\n/g, " ");
    await mock("db-down", false);
    await p.screenshot({ path: path.join(SHOTS, "H5-db-down.png") });
    const misleading = /couldn.t find that yap/i.test(h1);
    return { status: misleading ? "FAIL" : "PASS", severity: misleading ? "P3" : undefined, actual: `shows "${h1}" — ${body}` };
  }, { as: SAM });

  await run("H6", "Failure injection", "Database unavailable while the editor is open (profile fetch fails)", async (p, ctx, { sent }) => {
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    await mock("db-down", true);
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForTimeout(1500);
    await mock("db-down", false);
    const r = sent.at(-1) ?? {};
    const v = await p.inputValue("#script-text");
    return ok(v.length > 0, `request still sent (name=${r.name}, niche=${r.niche}); box filled=${v.length > 0} — profile silently missing from the suggestion`, "P3");
  }, { as: SAM });

  // ---------- F. Layout, text scaling, touch targets, accessibility tree ----------
  for (const [id, name, vp] of [["F1", "Small phone 360×640", { width: 360, height: 640 }], ["F2", "Large phone 430×932", { width: 430, height: 932 }], ["F3", "Tablet 768×1024", { width: 768, height: 1024 }], ["F4", "Desktop 1440×900", { width: 1440, height: 900 }]])
    await run(id, "Layout", name, async (p) => {
      await editor(p, BASE, 2);
      await p.fill("#script-text", Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long script that needs scrolling.`).join("\n"));
      const m = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, save: document.evaluate("//button[normalize-space()='Save script']", document, null, 9).singleNodeValue.getBoundingClientRect().bottom <= innerHeight, ed: document.querySelector("[role=dialog] > div").getBoundingClientRect().width }));
      await p.screenshot({ path: path.join(SHOTS, `${id}-${vp.width}.png`) });
      return ok(m.overflow <= 1 && m.save, `sideways overflow ${m.overflow}px; Save visible with 40-line script=${m.save}; editor column ${Math.round(m.ed)}px`, "P2");
    }, { as: SAM, ctx: { viewport: vp } });

  await run("F5", "Accessibility", "Text scaled to 200% (root font size)", async (p) => {
    await editor(p, BASE, 2);
    await p.addStyleTag({ content: "html{font-size:200% !important}" });
    await p.waitForTimeout(300);
    const m = await p.evaluate(() => {
      const btns = [...document.querySelectorAll("[role=dialog] button")].filter((b) => b.offsetParent);
      const clipped = btns.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim()).filter(Boolean);
      return { overflow: document.documentElement.scrollWidth - innerWidth, clipped };
    });
    await p.screenshot({ path: path.join(SHOTS, "F5-text-200.png"), fullPage: false });
    return ok(m.overflow <= 1 && m.clipped.length === 0, `sideways overflow ${m.overflow}px; buttons with clipped text: ${JSON.stringify(m.clipped)}`, "P3");
  }, { as: SAM, ctx: { viewport: { width: 390, height: 844 } } });

  await run("F6", "Accessibility", "Touch targets ≥ 44×44 px (WCAG 2.5.5) / ≥ 24 px (2.5.8 AA)", async (p) => {
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    const prep = await p.evaluate(() => [...document.querySelectorAll("button,a,[role=radio]")].filter((b) => b.offsetParent).map((b) => ({ n: (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 30), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })));
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.locator("#script-text").fill("some text here now");
    const ed = await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].filter((b) => b.offsetParent).map((b) => ({ n: (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 30), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })));
    const small44 = [...prep, ...ed].filter((x) => x.w < 44 || x.h < 44);
    const small24 = [...prep, ...ed].filter((x) => x.w < 24 || x.h < 24);
    return { status: small24.length ? "FAIL" : "PASS", severity: small24.length ? "P3" : undefined, actual: `under 24 px: ${JSON.stringify(small24)}; under 44 px (AAA advisory): ${small44.map((x) => `${x.n} ${x.w}×${x.h}`).join("; ")}` };
  }, { as: SAM });

  await run("F7", "Accessibility", "Accessibility tree of the editor (screen-reader view)", async (p) => {
    await editor(p, BASE, 2);
    const snap = await p.locator("[role=dialog]").ariaSnapshot();
    fs.writeFileSync(path.join(__dirname, "..", "evidence", "phase2-editor-aria.txt"), snap);
    const need = ['dialog "Edit your script"', 'button "Close without saving"', 'button "Use our suggestion"', 'button "Polish it for me"', 'textbox "Script"', 'textbox "Anything our suggestion should include?', 'button "Save script"', "status"];
    const missing = need.filter((n) => !snap.includes(n.replace(/^dialog /, "")) && !snap.includes(n));
    return ok(missing.length === 0, `roles and names present; missing: ${JSON.stringify(missing)} (full tree in evidence/phase2-editor-aria.txt)`, "P2");
  }, { as: SAM });

  await run("F8", "UI states", "Loading, empty and error states captured", async (p) => {
    await p.route("**/api/script", async (r) => { await new Promise((x) => setTimeout(x, 1500)); r.fulfill({ status: 429, json: { error: "busy" } }); });
    await editor(p, BASE, 2);
    await p.screenshot({ path: path.join(SHOTS, "F8-empty.png") });
    await p.getByRole("button", { name: "Use our suggestion" }).click();
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(SHOTS, "F8-loading.png") });
    await p.waitForTimeout(1800);
    await p.screenshot({ path: path.join(SHOTS, "F8-error-fallback.png") });
    const t = await toasts(p);
    return ok(t.includes("busy"), `error message: "${t}" (screenshots F8-*.png)`, "P3");
  }, { as: SAM });

  console.log(JSON.stringify({ at: new Date().toISOString(), results: out }, null, 2));
})();
