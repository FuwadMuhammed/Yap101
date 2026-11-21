# Advanced QA Report (Phase 2): Production Readiness and Hidden Failures

2026-11-21, 22:26–22:50 UTC · Commit under test `52d23ca` · Audit only: no production code changed in Phase 2.
Environments: Supabase-mode build against a local mock Supabase (auth, refresh, profiles, prompts; controllable delays and outages), a demo build, Chromium with device emulation, fake camera/mic. Firefox and WebKit aren't installed here.

## 1. What ran

| Area | Suite | Executed | Pass | Fail / finding | Evidence |
| --- | --- | --- | --- | --- | --- |
| Auth & isolation | `phase2.cjs` A1–A6 | 6 | 4 | 2 (A3, A5) | `phase2-browser.*` |
| Security (client) | D1 + Phase-1/round-2 checks | 1 new | 1 | 0 | `security-audit.md` |
| Recovery | E1–E3 | 3 | 3 | 0 | `phase2-browser.*` |
| Failure injection | H1–H6 | 6 | 4 | 2 (H5, H6) | `phase2-browser.*` |
| Layout & a11y | F1–F8 | 8 | 6 | 2 (F5, F6) | `phase2-browser.*`, shots |
| Device matrix | 8 emulated devices | 8 | 8 | 0 | `phase2-devices.*` |
| Load | 1/10/25/50 concurrent + unauthenticated flood | 2,200 requests | 0 errors | — | `phase2-load.*` |
| Integration | G1–G9 full journey | 9 | 9 | 0 | `phase2-integration.*` |
| Exploratory (charter: real-world behaviour) | X1–X10 | 10 | 6 | 4 findings | `phase2-explore.*` |
| Guest deprecation | static audit of 12 files + A5 | — | — | report | `guest-deprecation-impact.md` |
| AI evaluation | 30 inputs + 10 repeats | **scheduled 00:07 UTC** | — | — | `ai-quality-report.md` |

Totals for executed Phase 2 browser/journey checks: **51 executed, 41 pass, 10 fail or finding**, plus 2,200 load requests with 0 errors. Nothing is counted as passed without running.

## 2. Confirmed bugs (new in Phase 2)

| ID | Sev | Title | Repro (evidence) |
| --- | --- | --- | --- |
| BUG-26 | **P1** | Stale tab after an account switch saves A's script into B's store; B sees it and it is sent in B's AI request | A3 |
| BUG-27 | **P1** | A signed-in user who still has the `yap101-guest` cookie runs as a guest (banner, browser-only data, real account ignored); sign-in never clears the cookie | A5 |
| BUG-28 | P2 | Browser Back / Android back gesture with the editor open leaves the page and discards the draft without warning | X1 |
| BUG-29 | P3 | Reload discards unsaved editor text (no autosave, no warning) | X2 |
| BUG-30 | P3 | Changing level/goal (redoing onboarding) orphans saved scripts; they no longer show but are still sent to the AI as `previous` | X3 |
| BUG-31 | P3 | No way to remove a saved script or return a day to talking points | X4 |
| BUG-32 | P3 | Database outage on open shows "We couldn't find that yap. The link may be old or mistyped." | H5, `shots/phase2/H5-db-down.png` |
| BUG-33 | P3 | Profile fetch failure silently removes personalisation from the suggestion request | H6 |
| BUG-34 | P3 | At 200 % text the two main button labels are clipped | F5, `F5-text-200.png` |
| BUG-35 | P3 | "Clear" touch target 36×20 px (WCAG 2.5.8 minimum 24 px) | F6 |
| BUG-36 | P3 | Client trusts the API's line types; non-strings become text instead of being rejected (server already sanitises) | H4 |

## 3. Potential risks

| ID | Sev | Risk | Basis |
| --- | --- | --- | --- |
| R-1 | P1 | No AI limit for signed-in users; one account can drain the shared quota | S04; BUG-20 |
| R-2 | P2 | The free AI tier can't serve real traffic (429 after ~30 requests; 50/day) | round 1 + this session |
| R-3 | P2 | Writer fixes for invented stories and recited tips (BUG-16/17) not yet confirmed on the live model | AI report §4 pending |
| R-4 | P3 | Two auth round-trips per AI request (middleware + route) | load test, code |
| R-5 | P3 | Provider error objects logged whole; safe today, fragile to SDK changes | `security-audit.md` R-3 |
| R-6 | P3 | Long polishes (48 s) approach the 50 s AI budget and many hosts' limits | performance report |
| O-1 | P3 | Auth outage reported to the user as "Your session ended" (round 2) | S08 |

## 4. Improvements (not defects)

1. Draft autosave per day (fixes BUG-29, softens BUG-28).
2. "Remove script" action on the prep card (BUG-31).
3. Show how many AI scripts are left today, once a per-user cap exists (R-1).
4. One auth call per AI request: pass the middleware's verified user to the route, or verify JWTs locally with asymmetric keys (R-4).
5. Separate messages for "database unavailable" vs "not found" (BUG-32), and for "auth outage" vs "session ended" (O-1).

## 5. Product decisions required

| Decision | Options | Blocks |
| --- | --- | --- |
| AI budget | paid OpenRouter credits / Claude key / both | release (R-2) |
| Per-user AI cap | number per day; what users see at the cap | guest removal (R-1) |
| Scripts: device-only or synced to the account | today device-only (A4: second device sees nothing) | BUG-26/30 design, account deletion |
| Guest data at removal | clear / export / import into account | guest removal |
| Account deletion | today by email; device scripts aren't covered | privacy page accuracy |
