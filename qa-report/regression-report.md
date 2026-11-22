# Regression Report

Commit `2a1f30e` vs the pre-feature baseline (`dbd0c48`, before the suggestion/polish split). 2026-11-21 UTC.

## 1. Automated suites

| Suite | Command | Result |
| --- | --- | --- |
| Project unit tests (5 files) | `npm test` | 85 / 85 pass (`evidence/unit-tests.txt`) |
| QA harnesses (allowance + AI parsing) | `npx vitest run --config qa-report/scripts/vitest.qa.config.mts` | 20 run: 17 pass, 3 fail = BUG-01/02/03 (`evidence/allowance-and-parse.txt`). The config also re-runs the 85 project tests: 102 / 105 overall |
| Lint | `npx eslint .` | clean |
| Type check | `npx tsc --noEmit` | clean |
| Production build (demo) | `NEXT_PUBLIC_DEMO_MODE=true npm run build` | succeeds |
| Browser E2E, 30 cases | `node qa-report/scripts/e2e.cjs` ×2 | 25 pass / 5 fail, **identical on re-run** (30/30 consistent, no flakiness) |

## 2. Existing functionality touched by the feature

| Area | How the feature touches it | Result |
| --- | --- | --- |
| Record prep card (mode toggle, script card, length chip) | Opens the editor; shows saved script | PASS (E01, E24, E25) |
| Day 1 / 30 intro script from onboarding | Now reused as the instant suggestion | PASS (E24, unit) |
| Teleprompter script model (`buildScript`) | Fed by saved lines | Prep preview PASS; recording itself out of scope |
| Locked days / daily limit | Unchanged | PASS (E26) |
| Sticky footers (record, editor, onboarding) | Fade changed in the previous fix | PASS: no overlap on phone/desktop sweep; E27 |
| Old clients without `mode` | Server infers mode | PASS (A03, A04) |
| Guest allowance | Polish and suggest share it | PASS for normal browsers (G01–G05); bypasses are pre-existing design (BUG-01–03 existed in `b876737`) |
| Sign-out / Delete guest data | Did not handle the new `yap101-suggestions` key, nor the older `yap101-scripts` | FAIL (BUG-18, BUG-19): pre-existing for scripts, extended to suggestions by this feature |

## 3. Pre-existing vs introduced

| Bug | Introduced by this feature? |
| --- | --- |
| BUG-01, 02, 03, 10, 15 | No: present since the guest allowance commit `b876737` |
| BUG-05, 06, 09, 18, 19 | No for scripts (older `script.ts`); the new suggestion cache inherits the same pattern |
| BUG-04 | Partly: the 3,000-char cap existed; polish now makes it user-visible |
| BUG-07, 14, 20 | No: AI client and provider choice predate the feature |
| BUG-08, 11, 12, 13, 16, 17, 21 | Yes, or became visible with the new suggestion/polish flow |

## 4. Retest of earlier fixes in this branch

| Earlier fix | Retest | Result |
| --- | --- | --- |
| Local tidy no longer turns "umbrella" into "brella" | unit + TC-A12 | PASS |
| Reopened unchanged suggestion still counts as ours | E24 + unit | PASS |
| Import locked while busy; same file twice | unit | PASS |
| Filler-only polish gets a nudge | A12 | PASS |
| Footer text no longer overlaps the script | phone screenshot sweep | PASS |
