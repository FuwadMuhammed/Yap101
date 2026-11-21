# Performance and Reliability Report (Phase 2)

2026-11-21 · Commit `52d23ca` · All numbers are measured, from `evidence/phase2-load.*`, `phase2-browser.*`, round-1 `ai-quality.json`. Hardware: the shared cloud container this audit ran in (not production hardware), so the absolute numbers are a floor, not a forecast.

## 1. API under load (our stack, AI excluded)

Supabase-mode build, real middleware auth (mock Supabase), no AI key so the route answers right after auth. Body ≈ 900 bytes.

| Scenario | Concurrency | Requests | Errors | P50 | P95 | P99 | Max | Throughput |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Signed in | 1 | 200 | 0 | 5.2 ms | 9.5 ms | 23.1 ms | 34.1 ms | 171 req/s |
| Signed in | 10 | 500 | 0 | 34.3 ms | 49.6 ms | 60.1 ms | 94.6 ms | 280 req/s |
| Signed in | 25 | 500 | 0 | 79.2 ms | 96.4 ms | 241.6 ms | 321.1 ms | 308 req/s |
| Signed in | 50 | 500 | 0 | 126.8 ms | 197.7 ms | 737.8 ms | 939.3 ms | 345 req/s |
| No session (rejected) | 50 | 500 | 0 | 67.9 ms | 81.8 ms | 96.3 ms | 104.9 ms | 720 req/s |

Server memory after the runs: 137 MB and 285 MB RSS for the two Next.js processes. No errors or crashes at any level. Each signed-in AI request costs **two** auth round-trips (middleware `getClaims` → `getUser` for HS256 tokens, then the route's own `getUser`). Harmless here, but it doubles auth latency in production.

## 2. AI latency (real OpenRouter free models)

| Mode | n | Min | P50 | P90 | Max |
| --- | --- | --- | --- | --- | --- |
| Suggest | 9 | 6.2 s | 12.4 s | 16.9 s | 16.9 s |
| Polish | 9 | 5.0 s | 7.2 s | 48.4 s | 48.4 s |
| Redirect | 3 | 2.0 s | 2.6 s | 3.0 s | 3.0 s |

P95/P99 for the AI are **not reported**: 9 samples per mode are too few. Phase 2 C (40 calls, scheduled after the quota reset) adds samples. **Capacity:** the free tier answered 429 for every model after ~30 requests in ~25 minutes, and the account's 50 requests/day were used up the same day. The AI provider, not our code, is the bottleneck.

## 3. Reliability under failure (browser, Supabase build)

| Scenario | Result | Evidence |
| --- | --- | --- |
| Slow 3G (2 s latency) | "Writing…", one request despite double tap, Cancel works | S14 |
| Network drops mid-request, returns | offline starter shown; nothing saved behind the user's back | E2 |
| Backend killed mid-request, restarted | draft kept (local tidy applied as the fallback), editor usable; server back up (a retry after restart was not exercised) | E1 |
| AI provider down (real 429s) | "busy" message + starter/tidy; never a blank box | S04, F8 |
| API 500 HTML / malformed JSON / `{}` | starter + "had a hiccup" | H1–H3 |
| API lines of wrong types | no crash; non-strings coerced to text (first line "1") | H4 → BUG-36 |
| Database down on open | "We couldn't find that yap. The link may be old" (misleading) | H5 → BUG-32 |
| Database down while editing | suggestion sent without profile, silently | H6 → BUG-33 |
| localStorage blocked | editor works; save warns "Couldn't save…" | E3 |
| Storage full | frees cache, retries, warns if still failing | round 2 V-E17b |
| Large script (40 lines) on 360–1440 px | Save stays visible, no overflow | F1–F4 |
| Draft at 3,000 / 3,001 chars | Polish on / off (exact boundary) | X7 |

## 4. Not measured

- Slow devices (CPU throttling): Chromium CPU emulation wasn't run. The editor's per-keystroke work (`textToLines`, `buildScript`) took < 50 ms for a 43,892-char paste in round 1 (E12: 41 ms fill).
- Production host cold starts and function time limits (route now sets `maxDuration = 60`).
