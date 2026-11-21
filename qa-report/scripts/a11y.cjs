/* eslint-disable -- standalone Node/Playwright QA script, not app code */
// Round 2: automated accessibility audit (axe-core, WCAG 2.1 A/AA) of the script-editor screens,
// signed in against the mock Supabase. axe-core is loaded from a path given on the command line
// (installed outside the project): node qa-report/scripts/a11y.cjs <base> <supabase> <axe.min.js>
const { chromium } = require("playwright");
const BASE = process.argv[2], SB = process.argv[3], AXE = process.argv[4];
const SAM = "11111111-1111-1111-1111-111111111111";
(async () => {
  const t = (await (await fetch(`${SB}/__mock/token?id=${SAM}`)).json()).token;
  const session = { access_token: t, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "r", user: { id: SAM, aud: "authenticated", role: "authenticated" } };
  const results = [];
  for (const scheme of ["light", "dark"]) {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, colorScheme: scheme });
    await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    const audit = async (name) => {
      await p.addScriptTag({ path: AXE });
      const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target.join(" ") })));
      results.push({ scheme, screen: name, violations: r });
      process.stderr.write(`${scheme} ${name}: ${r.length ? r.map((v) => `${v.id}(${v.impact}, ${v.nodes})`).join(", ") : "no violations"}\n`);
    };
    await p.goto(`${BASE}/record?prompt=2`, { waitUntil: "networkidle" });
    await audit("prep screen");
    await p.getByRole("radio", { name: "Read a script" }).click();
    await p.locator("#script-text").waitFor();
    await audit("editor, empty");
    await p.fill("#script-text", "my own draft for today");
    await p.route("**/api/script", (r) => r.fulfill({ json: { kind: "script", lines: ["Polished line one.", "Polished line two."], message: "" } }));
    await p.getByRole("button", { name: "Polish it for me" }).click();
    await p.getByText("Polished version").waitFor();
    await audit("editor, polished + undo bar");
    await b.close();
  }
  console.log(JSON.stringify(results, null, 2));
})();
