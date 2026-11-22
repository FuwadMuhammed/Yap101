# Security Audit (Phase 2)

2026-11-21 · Commit `52d23ca` · Isolated environment: local builds on :3124 (demo) and :3126/:3127 (Supabase mode) against a local mock Supabase (`scripts/mock-supabase.mjs`). No external system was attacked; the only outside service called was OpenRouter, through its normal API.

**Verdict:** no critical (P0) issue. Two **P1 user-isolation bugs** remain (BUG-26, BUG-27); both are client-side, on the same browser. One P1 risk: no AI limit for signed-in users. Injection, payload, auth and logging checks pass.

## Findings

| ID | Type | Sev | Finding | Evidence |
| --- | --- | --- | --- | --- |
| BUG-26 | Confirmed bug | P1 | **Cross-user leak via a stale tab.** Account A's editor is open; B signs in on the same browser in another tab (device is claimed for B). A's tab then saves: A's script lands in B's store, B sees it, and it is sent in B's AI request as `previous`. | `phase2-browser.json` A3 |
| BUG-27 | Confirmed bug | P1 | **Leftover guest cookie overrides a real session.** With `yap101-guest=1`, a signed-in user is run as a guest: middleware skips auth, the client uses the browser store, the real profile is never fetched (0 profile requests). Nothing clears the cookie on sign-in. | A5 |
| R-1 | Risk | P1 | **No AI rate limit for signed-in users.** Unlimited calls per account (S04); one account can exhaust the shared quota (BUG-20). Becomes the only abuse path once guests are removed. | S04, round-1 BUG-20 |
| R-2 | Risk | P3 | Profile fields (`name`, `niche`…) in the AI request come from the client, not the server. A user can only affect their own output; no privilege gain. | code review |
| R-3 | Risk | P3 | `console.error("write-script (provider) failed:", error)` logs the whole provider error object. Today it holds no user text (verified in logs), but a future provider SDK could include request bodies. | `route.ts`; log scan |

## Checks that passed (executed)

| Check | Result | Evidence |
| --- | --- | --- |
| Unauthenticated API call | 401 JSON, no AI call | S01, load test (500/500 → 401) |
| Unauthenticated page | redirect to /login | S02, A2 |
| Expired token, valid refresh | refreshed once, request served | A1 |
| Expired token, bad refresh | signed out cleanly (page → /login, API → 401) | A2 |
| Revoked session mid-edit | 401, "Sign in again", draft kept | S07 |
| User-id manipulation (`userId`, `user_id`, `id` in body) | ignored: identical response; there is no server-side script store to target | A6 |
| Cross-user access on the server | N/A by design: scripts are never stored server-side; Supabase tables have RLS ("own profile", "own yaps", "own feedback") | migration `20261108000000_phase1_schema.sql` |
| Account switch (no stale tab) | previous person's scripts wiped, nothing sent | S05 |
| Sign-out | scripts and suggestions cleared | S06, V-E31 |
| Prompt injection (request, draft) | redirect, nothing leaked (real AI, round 1) | Q10, P08 |
| Prompt-section forging (`</draft><request>`) | neutralised (round-2 fix) | fuzz, unit |
| HTML/script in script text, AI lines, AI question | rendered as text; no execution | E13, M10, D1 |
| SQL injection | N/A: the feature runs no SQL; Supabase access is PostgREST with parameters; SQL-like text is treated as text | A22, code review |
| Payload limits | 5 MB → 413; draft > 3,000 → 413; non-JSON → 415 | V-A20/26, unit |
| Cross-site requests | foreign Origin → 403 | V-A20/26 |
| Secrets in client bundle | none (env var names only, in admin help text) | round 1 TC-A30 |
| Sensitive data in server logs | 0 hits for user text, tokens, keys across all server logs | log scan below |

### Log scan

`s-sb.log`, `s-sb-nokey.log`, `s-ai.log`, `s-demo.log`: searched for draft text, names used in tests, `Bearer`, `access_token`, `refresh_token`, `sk-or-`: **0 matches**. The only server log noise is `AuthApiError: Invalid Refresh Token` stack traces (from A2), with no token values.

## Not tested

- Real Supabase RLS against a live project (mock only; policies reviewed in SQL).
- Platform-level protections (WAF, CDN rate limits) on the production host.
