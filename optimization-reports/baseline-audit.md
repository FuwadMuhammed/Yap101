# Baseline Audit (before optimisation)

2026-11-22 · Commit `ac559cb` · Measured in this session on a local production build (`next build` + `next start`). Nothing here is estimated unless it says so.

## 1. Architecture

| Area | What's there |
| --- | --- |
| Framework | Next.js 16.4.5 App Router, Turbopack, `cacheComponents`, React 19.3.0, TypeScript 5.9 (strict) |
| Styling | Tailwind CSS 4 (`@tailwindcss/turbopack`), design tokens as CSS variables in `src/app/globals.css`, shadcn base styles, `cn` for class merging, `class-variance-authority` for button variants |
| UI primitives | Own components in `src/components/{yap,brand,record,landing}`; shadcn `slider` (Base UI) and `sonner` toasts in `src/components/ui` |
| Routing | `src/app`: public (`/`, `/login`, `/privacy`, `/terms`), the app group `(app)` (`/home`, `/track`, `/history`, `/profile`), `/onboarding`, `/record`, `/feedback/[id]`, `/admin`; API: `/api/script` (AI script writer), `/api/admin`, `/api/reminder`; `/auth/callback` |
| Data layer | `src/lib/data`: one `DataApi` interface, two implementations chosen at load: `demo.ts` (localStorage + IndexedDB) and `supabase.ts` (Postgres + Storage via `@supabase/ssr`) |
| Auth | Supabase Auth (Google / email link). Middleware (`src/proxy.ts` → `lib/supabase/proxy.ts`) does an optimistic `getClaims()` check and redirects; RLS in the database is the real guard. Guest mode via a cookie (to be removed before release) |
| State | Local component state and refs; `use-game` for derived XP/streaks; no global store. Per-device data in localStorage (scripts, drafts, score settings, suggestion cache) |
| On-device analysis | Web Audio meter (`analysis/audio.ts`), MediaPipe Face Landmarker (`analysis/face.ts`), Whisper speech recognition via Transformers.js in a Web Worker (`analysis/asr*.ts`), scoring (`analysis/yapscore.ts`, `score.ts`) |
| AI | OpenRouter free models (Claude as an alternative) behind `/api/script`, with an Origin check, size limits and a guest allowance |
| Database | 4 migrations: `profiles`, `prompts`, `yaps`, `feedback`, `waitlist`; RLS on every table; SECURITY DEFINER functions (`insert_yap`, `delete_yap`, `current_streak`) with `search_path = ''` |
| Tests | Vitest (184 unit/component tests), Playwright QA suites in `qa-report/scripts` (demo and Supabase mode with a mock Supabase) |
| Build/deploy | Vercel (`next build`); env vars in `.env.example`; demo builds with `NEXT_PUBLIC_DEMO_MODE=true` |

### Dependency map (main modules)

```
app/record/page ──► components/record/recorder ──► record/script-editor ──► lib/write-script, lib/script, lib/data
                                    │                   └─► /api/script ──► lib/ai-script ──► OpenRouter / Claude
                                    ├─► lib/analysis/{audio, face, score} ──► analysis/yapscore ──► analysis/transcript
                                    ├─► (lazy) analysis/asr ──► asr.worker (Transformers.js + Whisper)
                                    ├─► record/teleprompter, lib/prompter
                                    └─► lib/data (save), yap/share-sheet
app/feedback/[id] ──► yap/yap-report ──► analysis/{score, yapscore, transcript}
                  └─► lib/data (getYap, listYaps), lib/game
app/(app)/* ──► lib/data, lib/use-game ──► lib/game ; profile ──► yap/yap-trends
lib/data/index ──► data/demo | data/supabase ──► lib/supabase/client ; both ──► data/types
middleware (proxy.ts) ──► lib/supabase/proxy ──► Supabase Auth (getClaims)
```

## 2. Checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors |
| ESLint | 0 errors, 0 warnings |
| Unit tests | 184 / 184 |
| Production build (demo) | succeeds, ~25 s cold; 2.0 MB of JS chunks (unminified sizes, all routes) + 27 MB ONNX wasm (served only when the filler check runs) |
| Browser suites (previous round) | e2e 30/30, verify 10/10, back 4/4, integration 9/9, yapscore 11/11, asr 9/9, signed-in 16/16, phase2 24/24 |
| `npm audit --omit=dev` | **4 moderate** (minimatch ReDoS via `shadcn` CLI → ts-morph), production dependency tree |
| Console errors on page loads | none |

## 3. Page performance (median of 3 cold loads, 400×860, demo user)

| Route | LCP ms | CLS | JS KB* | Requests | JS heap MB |
| --- | --- | --- | --- | --- | --- |
| `/` | 128 | 0.028 | 836 | 22 | 6.4 |
| `/login` | 64 | 0.028 | 836 | 21 | 5.6 |
| `/home` | 136 | 0.028 | 1082 | 38 | 6.8 |
| `/record?prompt=2` | 104 | 0.028 | 984 | 23 | 6.4 |
| `/history` | 104 | 0.028 | 938 | 30 | 5.6 |
| `/track` | 140 | 0.028 | 1082 | 37 | 6.4 |
| `/profile` | 128 | 0.028 | 892 | 27 | 5.9 |
| `/feedback/[id]` | 368 | **0.185** | 899 | 25 | 5.8 |
| `/onboarding` | 76 | 0.028 | 838 | 18 | 5.5 |
| `/terms` | 44 | 0.028 | 795 | 19 | 4.5 |

\* Decoded bytes of every script fetched by network idle, including Next's idle-time prefetch of linked routes (not render-blocking). Raw data: `perf-baseline.json`; script: `scripts/perf.cjs`. Local server, so absolute times are optimistic; compare before vs after only.

## 4. Findings (before changes)

| # | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| F1 | High | Every page has a layout shift: the demo/guest banner renders after mount and pushes content 24 px down | CLS 0.028 on all routes; shift source `DIV.mx-auto…` y 0→24 |
| F2 | High | Feedback page CLS 0.185 ("poor" > 0.1): "What's next" renders before the report and jumps 254 px | layout-shift entry, `SECTION.mt-2` |
| F3 | High | Feedback page polls forever when a take has no feedback row (Supabase: take saved without analysis), every 1.5 s, re-signing the storage URL each time | `feedback/[id]/page.tsx` `setTimeout(load, 1500)` with no limit |
| F4 | High | `listYaps` returns each take's whole `analysis` JSON (now with transcript + voice timeline) on almost every app page | ~16.6 KB per take; ~1.46 MB for 90 takes (measured with a realistic report) |
| F5 | High | `FaceMeter` leaks a 5 Hz detection timer if stopped before the model finished loading (unmount, Back during countdown, very short take) | `start()` awaits the model, then starts `setInterval` without checking for stop |
| F6 | Medium | Whisper worker keeps 100+ MB loaded for the whole session; no error handler, so a worker that fails to load leaves "Get feedback" waiting until Skip | `analysis/asr.ts` |
| F7 | High (security) | Open redirect after sign-in: `next` check accepts `/\evil.com`; malformed cookie makes `decodeURIComponent` throw (500) | `auth/callback/route.ts`, `login/page.tsx` |
| F8 | Medium (security) | No security headers (clickjacking, MIME sniffing, referrer, camera/mic policy) | `curl -I` |
| F9 | Medium | Feedback page's first load has no error handler (unhandled rejection; "What's next" never resolves) | `Promise.all(...).then(...)` without catch |
| F10 | Medium | Geist Mono (23 KB) preloaded on every page; used only by the recording timer | `font-mono` used once |
| F11 | Medium | Sign-in redirect drops the query string (`/record?prompt=5` → back to `/record`) | `proxy.ts` sets `next` to pathname only |
| F12 | Medium | 4 moderate vulnerabilities in the production tree, all via the `shadcn` CLI, which is only needed at build time for its CSS | `npm audit --omit=dev` |
| F13 | Low | Unused dependency `next-themes` | no imports |
| F14 | Low | Duplication: `webkitAudioContext` fallback ×3; four `as unknown as` casts for the feedback join | grep |
| F15 | Medium | `recorder.tsx` 1,079 lines: media helpers and the filler-check state machine mixed into the component | file |
| F16 | Low | Flaky QA test E02 (reload right after Save races the editor's deferred `history.back`) | 2 of 4 runs; pre-existing harness race, not a product bug |

Not issues: no `any`; listeners/intervals otherwise balanced; RLS covers every table (feedback insert checks yap ownership); middleware already uses local `getClaims()`; no N+1 (each screen makes 2–4 independent queries in parallel); `/api/script` validates size, origin and types.

## 5. Pre-existing open items (not part of this round)

- Live AI quality re-check blocked by the OpenRouter free daily limit (see `qa-report/round4-report.md`).
- R-1 (no per-user AI cap for signed-in users), product decision pending.
