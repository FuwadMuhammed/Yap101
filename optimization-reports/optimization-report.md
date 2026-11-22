# Optimisation Report

2026-11-22 · Baseline `ac559cb` → this change · Baseline and findings: `baseline-audit.md`.

No visual redesign, no API contract changes, no schema changes. Every change was followed by a type check, lint and the relevant tests, then the full regression at the end.

## 1. Changes by priority

### Critical / High

| Finding | Change | Files |
| --- | --- | --- |
| F7 open redirect | `safeNext()`: same-site paths only; rejects `//`, backslashes, control characters, bad encoding. Used by the auth callback and the login page | `lib/safe-next.ts` (+ test), `app/auth/callback/route.ts`, `app/login/page.tsx` |
| F8 headers | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/mic self only) on every response. A strict CSP is deferred: MediaPipe/HF CDNs and WebAssembly need their own rollout | `next.config.ts` |
| F12/F13 dependencies | `shadcn` moved to devDependencies (build-time CSS only) → production audit **0 vulnerabilities**; `next-themes` removed; patch upgrades Next 16.4.6, React 19.3.1, supabase-js 2.119.2 | `package.json` |
| F4 list payload | Lists fetch only the summary they use (`AnalysisSummary`: version, overall, parts, yap, confidence, pitch/loudness range). Supabase uses PostgREST JSON paths (syntax checked by supabase-js's typed select parser), falling back to the full select if rejected; the type change made the compiler prove no list consumer reads anything else | `lib/data/{types,supabase,demo}.ts`, `analysis/yapscore.ts` (`PastTake`) |
| F1 banner CLS | Demo builds render the banner on the server (build-time constant, hydration-safe); `--banner-h` comes from CSS `:has()` instead of JS | `components/yap/demo-banner.tsx`, `globals.css` |
| F2 feedback CLS | "What's next" appears once the report and today's numbers are in; its data is set in one render | `app/feedback/[id]/page.tsx` |
| F3 endless polling | Backs off (1 s × 1.5ⁿ, max 8 s) and stops after 8 checks with a clear "No report for this yap" state | `app/feedback/[id]/page.tsx` |
| F5 timer leak | `FaceMeter` remembers `stop()`; a late model load no longer starts checking. Test proves it (fails without the fix) | `analysis/face.ts`, `face.test.ts` |

### Medium

| Finding | Change | Files |
| --- | --- | --- |
| F6 worker memory | Whisper worker terminates after 60 s idle (re-created from browser cache next time); `error` listener rejects instead of hanging | `analysis/asr.ts` |
| F9 unhandled rejection | First load catches errors (and is cancelled on unmount); the report still shows | `app/feedback/[id]/page.tsx` |
| F10 font | Geist Mono `preload: false` (loads only where the timer uses it) | `app/layout.tsx` |
| F11 lost query | Login `next` keeps the query string (`/record?prompt=5`) | `lib/supabase/proxy.ts` |
| F15 large component | Media helpers → `lib/media.ts`; filler-check state machine → `useFillerCheck` hook (+ 4 tests). `recorder.tsx` 1,079 → 974 lines; behaviour unchanged | `lib/media.ts`, `components/record/use-filler-check.ts` |

### Low

| Finding | Change |
| --- | --- |
| F14 duplication | `audioContextClass()` shared by 3 call sites; one typed `FeedbackJoin` replaces four `as unknown as` casts |
| F16 flaky test | E02 waits 150 ms after Save like every other test (pre-existing harness race; 5/5 clean afterwards) |

## 2. Results (after)

### Tests

| Check | Before | After |
| --- | --- | --- |
| `tsc`, ESLint | clean | clean |
| Unit tests | 184 | **195** (new: safe redirect, list summary + fallback, filler-check hook, FaceMeter leak) |
| Production builds | demo ✓ | demo ✓ (14 s warm), Supabase mode ✓ |
| e2e / verify / back / integration | 30 / 10 / 4 / 9 | 30 / 10 / 4 / 9 (e2e 5 consecutive clean runs) |
| yapscore-e2e / asr-e2e | 11 / 9 | 11 / 9 |
| signed-in (Supabase mode) / phase2 | 16 / 24 | 16 / 24 |
| `npm audit --omit=dev` | 4 moderate | **0** |

### Performance (median of 3 cold loads; `perf-baseline.json` vs `perf-after.json`)

| Route | LCP ms | CLS | Bytes KB | Requests |
| --- | --- | --- | --- | --- |
| `/` | 128 → 72 | 0.028 → **0** | 1214 → 1194 | 22 → 21 |
| `/home` | 136 → 136 | 0.028 → **0** | 1390 → 1370 | 38 → 38 |
| `/record?prompt=2` | 104 → 120 | 0.028 → **0** | 1250 → 1231 | 23 → 23 |
| `/track` | 140 → 104 | 0.028 → **0** | — | 37 → 37 |
| `/feedback/[id]` | 368 → 364 | **0.185 → 0** | — | 25 |
| `/onboarding` | 76 → 48 | 0.028 → **0** | — | 18 |
| `/terms` | 44 → 40 | 0.028 → **0** | 1119 → 1098 | 19 → 18 |

- CLS: 0 on every route (was "needs improvement" on all, "poor" on feedback).
- About 20 KB and one font request less on every page.
- Lists in Supabase mode: about 16.6 KB → 4.6 KB per take, so a 30-day user with 90 takes downloads about **403 KB instead of 1.46 MB** on each app page.
- JS changes by +2–3 KB (new hook and helpers).
- Background polling: unbounded → at most 8 checks over about 45 s.
- LCP differences of ±20 ms are within local-run noise.

## 3. Deliberately not changed

| Item | Why |
| --- | --- |
| Strict Content-Security-Policy | Needs allowlisting MediaPipe (jsdelivr, storage.googleapis.com), Hugging Face, Supabase and `wasm-unsafe-eval`; risk of breaking the camera/AI paths without staged rollout (report-only first) |
| Lazy-loading the Supabase client (260 KB) | Production runs in Supabase mode, where app pages need it; static pages only get it through idle prefetch |
| MediaPipe 1.2, ESLint 10, TypeScript 7, @types/node 26, lucide minor | Minor/major upgrades need their own testing (MediaPipe's CDN wasm is version-pinned in `face.ts`) |
| Further `recorder.tsx` splitting (review sheet, prompter controls) | Heavily stateful; worth doing with a dedicated component test harness, not inside an optimisation pass |
| `listYaps` error handling (returns `[]` on a DB error) | Many screens rely on the empty fallback; the record screen now fails first on the prompt load with a retry |
| Database schema / indexes | Queries are per-user and indexed (`yaps_user_date_idx`, `prompts_track_idx`); feedback is keyed by `yap_id`. No change needed at current scale |

## 4. Follow-ups

1. CSP in report-only mode, then enforce.
2. Per-user daily AI cap for signed-in users (R-1).
3. MediaPipe 1.2.x upgrade with a face-model regression run.
4. Live AI quality re-check after the OpenRouter daily reset.
