# QA Summary: Script Editor

> **Round 2 update (same day): READY WITH KNOWN ISSUES.** Guest mode will be removed before release. 19 bugs are fixed and verified, 4 more found by new test angles are fixed too, and every suite is green on the signed-in path. Open items: an AI budget (BUG-20), one real-AI re-check of the writer brief after the free quota resets, and removing the guest bypass in the middleware and route. Details: [`round2-report.md`](round2-report.md). Round 1 below is kept as the original record.


**Release recommendation: NOT READY FOR RELEASE.**

The core flows work: suggest, polish, edit, save, reopen, undo and offline fallback all passed in a real browser, and polish quality on real AI was 9 of 9 executed cases. Release is blocked by two privacy bugs, one person's scripts shown to and sent on behalf of the next, and by a guest allowance that can be bypassed three ways while every user shares one small free AI quota.

Commit `2a1f30e` (branch `claude/ecstatic-gauss-85ydxu`) · Session 2026-11-21, 21:34–21:55 UTC · No production code was changed.

## 1. Results

| Measure | Count |
| --- | --- |
| Test cases | 128 |
| Executed | 116 |
| Passed | 89 |
| Failed | 27 |
| Blocked | 4 |
| Not tested | 8 |
| Pass rate (of executed) | 76.7 % |
| Pass rate (of all cases) | 69.5 % |

Plus 85/85 project unit tests and the QA harnesses (17/20 pass). Lint, type check and build are clean.

| Bugs | P0 | P1 | P2 | P3 | Total |
| --- | --- | --- | --- | --- | --- |
| Count | 0 | 5 | 8 | 8 | 21 |

## 2. Release blockers (must fix)

| Bug | Why it blocks |
| --- | --- |
| BUG-18 (P1) | After sign-out, the next person on the device sees the previous person's scripts, which are also sent to the AI in their requests. P0 on shared devices. |
| BUG-19 (P1) | "Delete my guest data" promises to delete everything but leaves scripts and suggestions. |
| BUG-01/02/03 (P1) | Guest allowance bypassed by simultaneous requests, a spoofed IP header, or dropping the cookie. Proven on the real server. |
| BUG-20 (P2), with BUG-01/02/03 | One shared free quota went `busy` after ~30 requests; one abuser can switch AI off for all users. |
| BUG-17 (P2) | Suggestions invent personal stories that users would say on camera (4 of 9 real suggestions plus the browser journey). |

## 3. High priority (fix before or right after release)

BUG-04 (polish drops text after 3,000 chars) · BUG-05 (failed save looks successful) · BUG-06 (corrupt storage crashes the record screen) · BUG-07 (junk AI lines reach the teleprompter) · BUG-16 (coaching tips read aloud in 4 of 9 suggestions) · BUG-08 (no remaining-allowance display).

## 4. Findings by area

**API performance:** the route itself is fast (p50 3 ms; 10 concurrent in 62 ms). Real AI: suggest p50 12.4 s (max 16.9 s), polish p50 7.2 s (max 48.4 s), redirects about 2.5 s. 48 s is close to the client's 50 s budget and over many hosts' function limits (BUG-21).

**AI output quality:**
- Polish is strong. Across 9 executed cases it kept names, dates, numbers, opinions, slang and language, corrected spelling, kept placeholders, stripped HTML, and left a short draft alone.
- Suggestions are relevant and natural, use the profile and fit the length (60–68 words at 30 s, 120 at 60 s). They fail the brief on two counts: invented personal events (BUG-17) and recited coaching tips (BUG-16).
- Off-topic and injection attempts were redirected 3 of 3 with nothing leaked.

**Data integrity:**
- Scripts stay on their own day, survive a restart, and are untouched by offline errors, rapid taps, out-of-order replies or closing mid-request.
- Failures: corrupted storage crashes the screen (BUG-06), a full or odd store loses saves silently (BUG-05, BUG-09), a stale late reply replaces the cached suggestion (BUG-11), and scripts aren't separated per user (BUG-18).

**Guest allowance:**
- For a normal browser it works: 3 then 429, and it holds after a restart, with cookies cleared, or from a new IP.
- It is bypassed by concurrency, a client-chosen IP header, or cookie-less clients on a new instance.
- Editing localStorage gives no bypass (the counter isn't stored there). Failed AI calls don't use the allowance.

## 5. Missing coverage (blocked / not tested)

| Gap | Why |
| --- | --- |
| Real-AI polish in the browser (TC-P11) | All free models rate-limited at 21:47, 21:49 and 21:52 UTC; fallback path verified instead |
| Supabase: signed-in unlimited, guest → account, expired session (TC-G17, G18, A33) | No Supabase project in this environment |
| Claude provider live (TC-X01) | No Anthropic key |
| Real phones, screen readers (TC-X02, X03) | Emulation only |
| Host function timeout (TC-X06) | Needs production hosting |

## 6. Questions for the product owner

1. Should signed-in users' scripts sync to their account, and be cleared from the device on sign-out?
2. What is the AI budget? The free tier (50 requests/day on this key, rate-limited after ~30 in this run) cannot serve real traffic.
3. Show guests their remaining allowance? Count per UTC day or local day?
4. Maximum polish length: block above the server's 3,000 characters, or raise the cap?
5. May suggestions ever state experiences on the user's behalf, or always use [placeholders]?

## 7. Session log (UTC)

| Time | Activity |
| --- | --- |
| 21:34 | Explored repo (middleware, data layer, storage keys, allowance) |
| 21:35 | Demo build; two isolated servers (:3124 no AI, :3125 real AI) |
| 21:36 | Unit suite 85/85, lint, type check; API validation A01–A26 and load (1/5/10, 50 sequential) |
| 21:37 | First AI run returned 503 for all: test-env issue (Node `fetch` ignoring the proxy, then a stale server on :3125). Kept as the bad-key evidence (TC-A29) |
| 21:38 | Browser E2E E01–E30 (5 failures) |
| 21:40 | Allowance + malformed-response harnesses (3 + 4 failures) |
| 21:41–21:46 | Real-AI quality run, 21 cases |
| 21:43 | Storage-full retest (E17b), tidy repeated-word check |
| 21:46 | Guest allowance on the real server (G01–G06), race (G07) |
| 21:47 | Real-browser J1 PASS; J2 got `busy` (provider limit) |
| 21:48–21:50 | Sign-out and delete-data privacy tests (BUG-18, BUG-19) |
| 21:50 | Full E2E re-run: 30/30 identical |
| 21:49, 21:52 | J2 real-AI retries: still `busy` |

The brief asked for a 3-hour session. This one took about 21 minutes of wall-clock time because the suites were scripted and ran in parallel. I didn't add artificial waiting, and I stopped real-AI calls once the provider rate-limited the key. Every number above comes from an executed run; nothing was estimated.

## 8. Reproduce

```bash
NEXT_PUBLIC_DEMO_MODE=true npm run build
npx next start -p 3124                                   # no AI
NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=<key> npx next start -p 3125   # real AI
npm test
npx vitest run --config qa-report/scripts/vitest.qa.config.mts
node qa-report/scripts/api-tests.mjs http://localhost:3124
node qa-report/scripts/e2e.cjs http://localhost:3124
node qa-report/scripts/storage-full.cjs http://localhost:3124
node qa-report/scripts/e2e-accounts.cjs http://localhost:3124
node qa-report/scripts/e2e-delete.cjs http://localhost:3124
node qa-report/scripts/ai-quality.mjs http://localhost:3125      # ~21 AI calls
bash qa-report/scripts/guest-real.sh http://localhost:3125       # ~4 AI calls
bash qa-report/scripts/race-real.sh http://localhost:3125 4      # ~5 AI calls
node qa-report/scripts/e2e-real.cjs http://localhost:3125        # 2 AI calls
```

All test data is synthetic (Sam, Alex, Maya); no real user data was read or changed, and no keys appear in the evidence.
