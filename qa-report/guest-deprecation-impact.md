# Guest Mode Deprecation: Impact and Dependencies

Phase 2 · 2026-11-21 · Commit `52d23ca` · **Audit only: nothing was removed or changed.**

**Summary:** guest mode is not a flag inside the signed-in app. It is a second, complete data layer (`demoApi`) that keeps the profile, yaps, recordings and scripts in the browser. A cookie (`yap101-guest=1`) switches the middleware and the client into it. Removing it touches 12 files across middleware, API, data layer, login, profile, feedback and banner. One live bug already comes from it (BUG-27: a leftover guest cookie overrides a real sign-in), and guests' data needs a migration decision before removal.

## 1. Answers to the eight questions

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Can guest scripts be transferred to an account? | **No mechanism exists.** Scripts live in `localStorage` either way (scripts are never stored server-side, for guests or for accounts). The first account to sign in on that browser **adopts** them (by design since round 2: data saved before owners were tracked goes to the first person), but guest yaps, recordings, XP and streak in `yap101-demo` + IndexedDB are not transferred. | `src/lib/script.ts` `claimDevice`; `src/lib/data/demo.ts` |
| 2 | Are guest scripts stored separately from logged-in scripts? | **No:** same keys (`yap101-scripts`, `yap101-suggestions`). Ownership is tracked by `yap101-scripts-owner` (`"local"` for guests/demo, the Supabase user id for accounts), so a different owner wipes them. | `src/app/record/page.tsx` → `claimDevice(profile?.id ?? "local")` |
| 3 | Will removal leave unused guest API code? | **Yes**, unless removed together: `src/lib/guest-limit.ts` (whole file), the guest branch and cookie in `src/app/api/script/route.ts`, `guest_limit` message in the editor. | §2 |
| 4 | Guest-only UI conditions that could break navigation? | **Yes:** login page "Continue as guest" (`GuestLogin`), profile "Delete my guest data" (`isDemo`), demo banner (`isDemo`), feedback footnote (`isDemo`). The middleware **skips auth entirely** for the guest cookie; if the cookie check is removed but the client still has `isDemo` from the cookie, the client would use `demoApi` while the middleware demands a session (users bounce to /login). Both must go together. | `src/lib/supabase/proxy.ts:17`, `src/lib/data/mode.ts:17`, `src/lib/data/index.ts:7` |
| 5 | Are allowance checks coupled to script generation? | **Yes:** inline in `POST /api/script`, between auth and the AI call; the guest cookie counter is written in the same response. Decoupling = delete lines 63–75 and 84–87 (as of this commit), keep `getUser()` and return 401 when there is no user. | `src/app/api/script/route.ts` |
| 6 | Can logged-in users be blocked by guest restrictions? | **Not by the allowance** (route uses the real Supabase user; S04: 6 calls, never `guest_limit`). **But yes by the guest cookie:** a signed-in user who still carries `yap101-guest=1` is run as a guest: guest banner, browser-only data, real account ignored (**BUG-27**, confirmed A5). Nothing clears the cookie on real sign-in. | `evidence/phase2-browser.json` A5 |
| 7 | Does the app handle old guest data safely after an update? | Scripts: **yes** (kept and adopted; corrupt values are ignored since round 2). Guest yaps/recordings: **they stay in the browser forever, unreachable** once the guest login and `demoApi` are gone: no UI to view, export or delete them. | code review |
| 8 | Database or storage migration requirements? | **Database: none** (guests never touched Supabase; no guest columns). **Browser:** decide what to do with `yap101-demo` (profile, yaps), the IndexedDB database `yap101-demo` (recordings) and the `yap101-guest` cookie on every returning guest device. | `src/lib/data/demo.ts` |

## 2. Every guest dependency (file → what to change)

| File | Guest dependency | Change at removal | Risk if missed |
| --- | --- | --- | --- |
| `src/lib/data/mode.ts` | `GUEST_COOKIE`, `isDemo = envDemo \|\| guestCookieSet()`, `startGuest`, `endGuest` | `isDemo = envDemo` only (keep demo builds for local dev) or remove; keep `endGuest()` reachable once to clear old cookies | Signed-in users trapped in guest mode (BUG-27) |
| `src/lib/data/index.ts` | `api = isDemo ? demoApi : supabaseApi` | Follows `isDemo` | Same |
| `src/lib/supabase/proxy.ts:17` | Skips auth when `yap101-guest=1` | Remove the cookie condition; **also expire the cookie in the response** so old devices are cleaned | Unauthenticated access to every page; route still treats them as guests |
| `src/app/api/script/route.ts` | `guest` flag, `guestUsed`, `recordGuestScript`, `GUEST_COOKIE_NAME` cookie, "guests get a few a day" | Return 401 when `getUser()` has no user; delete the allowance code; **add a per-user cap** (see §4) | Anonymous AI use; shared quota exhaustion |
| `src/lib/guest-limit.ts` | Whole file | Delete (its HMAC secret falls back to the AI key) | Dead code |
| `src/components/record/script-editor.tsx` | `guest_limit` message; `display_name !== "Guest"` | Remove message; keep the `"Guest"` check until no demo profiles remain | Harmless text |
| `src/lib/script.ts` | `display_name !== "Guest"` in `introScript`; `claimDevice("local")` path | Keep for demo builds | A real user named "Guest" is treated as nameless (existing edge) |
| `src/lib/data/demo.ts` | `demoApi`, `demoSignIn`, `demoReset`, `demoBackfill`, `emptyProfile.display_name = "Guest"` | Keep only for `NEXT_PUBLIC_DEMO_MODE` dev builds, or delete with all callers | Dead code paths |
| `src/app/login/page.tsx` | `GuestLogin` button, `startGuest`, `demoSignIn` | Remove the button; optionally offer "Bring your guest progress" (§3) | Broken entry point |
| `src/app/(app)/profile/page.tsx` | "Delete my guest data" (`isDemo`), demo streak button (`envDemo`) | Remove for production; keep demo button behind `envDemo` | Orphan buttons |
| `src/app/feedback/[id]/page.tsx:321` | `isDemo` footnote ("Sample numbers…") | Remove the branch | Wrong copy |
| `src/components/yap/demo-banner.tsx` | Banner when `isDemo` | Show only for `envDemo` | Banner on signed-in users |
| `src/app/api/admin/route.ts`, `src/app/admin/page.tsx` | `envDemo` sample report; copy mentions guests | Update copy | Cosmetic |
| Cookies | `yap101-guest` (30 days, JS-set), `yap101-scripts` (httpOnly allowance cookie, path `/api/script`) | Expire both on first visit after release | BUG-27 for up to 30 days |
| Browser storage | `yap101-demo`, IndexedDB `yap101-demo`, `yap101-scripts`, `yap101-suggestions`, `yap101-scripts-owner` | Decide: migrate, export or clear (§3) | Orphaned personal data on devices |

## 3. Data migration options (product decision required)

| Option | What returning guests get | Effort | Notes |
| --- | --- | --- | --- |
| A. Clear on first visit | A clean start; local data deleted | Low | Simplest; must tell users first (privacy page says data stays in the browser) |
| B. "Bring your progress" on sign-up | Profile answers → `profiles`; yaps metadata → `yaps`; recordings uploaded to Storage | High | Needs an import API with validation (client data is untrusted) and size limits |
| C. Export, then clear | A download of their recordings and scripts before clearing | Medium | Respects user data; no server work |
| Scripts only | Already adopted by the first account to sign in (round-2 behaviour) | None | Works today |

## 4. Risks that appear when guests are removed

1. **No AI limit for accounts.** Signed-in users are unlimited (S04), and the AI quota is shared (BUG-20). Without guests, the only abuse path is accounts; add a per-user daily cap stored server-side before or with the removal.
2. **Stale guest cookie (BUG-27)** must be fixed before or as part of the removal, or returning guests who sign up stay in guest mode for 30 days.
3. **Middleware and client must change in the same release**, or users loop between /login and guest pages.
4. **Tests to update:** `src/app/api/script/route.test.ts` (guest describe block), `qa-report/scripts/allowance.qa.test.ts` (whole file becomes obsolete), E2E scripts that seed the demo store.

## 5. Current guest version: still works (checked, not re-tested in depth)

Allowance harness with the round-2 code: baseline 3/day, forged cookie rejected, suggest + polish share the count, failures don't consume, timeout → JSON 502: all PASS (`evidence/round2-harnesses.txt` R1, R5–R9). The known bypasses (BUG-01/02/03) remain; skipped by decision.
