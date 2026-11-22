# API Test Report: `POST /api/script`

Commit `2a1f30e` · 2026-11-21 UTC · Harnesses: `scripts/api-tests.mjs` (ENV-DEMO), `scripts/ai-quality.mjs`, `guest-real.sh`, `race-real.sh` (ENV-AI), `scripts/*.qa.test.ts` (ENV-UNIT).

**Verdict:** input validation and error mapping are solid (every malformed body tested got a clean 400 JSON, and every provider failure got a JSON error the client handles). The weak points are the guest allowance (bypassable 3 ways), silent truncation of long drafts, no body-size or Origin limits, and real-AI latency up to 48 s.

## 1. Endpoint behaviour

| Item | Observed |
| --- | --- |
| Method | POST only (GET → 405, empty body) |
| Content types | Any; body parsed as JSON regardless (`text/plain` accepted) |
| Modes | `suggest`, `polish`; missing → inferred from `draft`; unknown string → `suggest` |
| Field limits (server-side) | title 200, request 500, draft 3,000 (silently cut), avoid 1,500, points 8×200, previous 5×600, seconds clamped 15–60, day 1–60 |
| Auth | Demo build: everyone is a guest. Supabase build: `auth.getUser()`; middleware redirects sessionless non-guest calls to `/login` (code review) |
| Guest allowance | 3 finished scripts/day (UTC), suggest + polish combined; questions, redirects and failures are free |

## 2. Request / response validation

| Request | Status | Body |
| --- | --- | --- |
| Valid suggest / polish | 200 | `{kind:"script", lines:[…], message:""}` |
| Off-topic or injection | 200 | `{kind:"redirect", lines:[], message:<fixed text>}` (real AI: Q09, Q10, P08) |
| Polish of filler/emoji only | 200 | `{kind:"question", message:"There isn't much to polish yet…"}` |
| Missing/blank title, non-JSON, `null`, array, wrong types | 400 | `{error:"bad_request"}` |
| Polish < 4 words (incl. empty / whitespace) | 400 | `{error:"bad_request"}` |
| Guest over allowance | 429 | `{error:"guest_limit"}` (no AI call, ~6–8 ms) |
| All models rate-limited | 429 | `{error:"busy"}` |
| Bad / missing key | 503 | `{error:"setup"}` |
| Any other provider failure, timeout | 502 | `{error:"upstream"}` |

The response schema was consistent in all 26 validation cases (A01–A26) and all 21 real-AI cases: `kind` is always one of the three values, `lines` is always an array, and `lines` is empty for question/redirect.

## 3. Error handling

| Failure injected | Server | Client (browser) |
| --- | --- | --- |
| Provider 401 (real) | 503 setup in ~30 ms; logs "OpenRouter rejected the key (401)…" without the key | "isn't switched on yet" + starter (unit + E2E) |
| Provider 429 on all models (real) | 429 busy in ~0.6 s | suggestion → starter; polish → quick tidy (TC-P11) |
| Empty / cut-off / non-JSON reply | salvage or 502 (M07–M09) | fallback |
| Timeout / abort | 502 upstream (R9) | fallback |
| Junk reply (preamble, markdown, echoed prompt) | **passed through as lines** (M01, M02, M11) | shown in the teleprompter → BUG-07 |
| Device offline | — | starter, no corruption (E09) |

## 4. Security checks

| Check | Result |
| --- | --- |
| API keys in client JS (`.next/static`) | PASS: only variable names in admin help text |
| System prompt in client JS | PASS: not present |
| Prompt injection via request / draft (real AI) | PASS: redirect, nothing leaked (Q10, P08) |
| XSS via script text or AI lines | PASS: React renders text; no script ran (E13, M10) |
| Forged allowance cookie | PASS: HMAC rejected (R5) |
| Allowance race | **FAIL**: 4 concurrent + 1 more all succeeded on the real server; 10/10 in harness (BUG-01) |
| Client-controlled IP header | **FAIL**: new `X-Real-IP`/`X-Forwarded-For` = fresh allowance (BUG-02) |
| Cookie optional | **FAIL**: drop cookie + new instance = fresh allowance (BUG-03) |
| Body size limit | **FAIL**: 5 MB accepted (BUG-10) |
| CSRF / Origin | **FAIL**: `text/plain` cross-site POST accepted (BUG-10) |
| Privacy of `previous` scripts | **FAIL**: another user's scripts are sent (BUG-18) |
| Error bodies | PASS: no stack traces or provider messages returned to the client |

## 5. Performance

| Scenario | Result |
| --- | --- |
| No-AI route (demo), 1 / 5 / 10 concurrent | 4 / 17 / 62 ms total, all 200 |
| No-AI route, 50 sequential | p50 3 ms, p95 6 ms, max 7 ms |
| 5 MB body | 61 ms (parsed fully before trimming) |
| Real AI, suggest (n=9) | min 6.2 s, p50 12.4 s, max 16.9 s |
| Real AI, polish (n=9) | min 5.0 s, p50 7.2 s, max **48.4 s** (280-word draft) |
| Real AI, redirect (n=3) | 2.0–3.0 s |
| Real AI, 4 concurrent polish | 3.2–5.6 s each, all 200 |
| Provider capacity | Free models returned 429 for every request after ~30 calls in ~25 min |

Concurrency against the real AI was capped at 4 to stay inside the free tier's 20 requests/minute; 5 and 10 concurrent were run only against the no-AI route and the harness. No load beyond that was attempted.

## 6. Not covered

- Claude (Anthropic) provider path live: no key (mocked in unit tests).
- Supabase-authenticated behaviour (signed-in unlimited, expired session → 307): needs a Supabase project.
- Behaviour behind the production host's proxy (trusted IP header, function timeout).
