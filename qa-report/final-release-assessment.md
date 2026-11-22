# Final Release Assessment (after Phase 2)

2026-11-21 · Commit `52d23ca` · Inputs: Phase 1 (`qa-summary.md`), round-2 fixes (`round2-report.md`), Phase 2 (`advanced-qa-report.md` and its companion reports). **Updated 2026-11-22 00:45 UTC with the live AI evaluation** (`ai-quality-report.md` §4).

> **Update 2026-11-22 (round 3):** all five engineering must-fixes are fixed and verified in the browser where possible (BUG-26, 27, 28 PASS). BUG-37 and BUG-17 are fixed in code with unit tests, but their **live AI re-check is blocked** by today's exhausted free quota. Regression is green. See [`round3-fixes.md`](round3-fixes.md). **Status: READY WITH KNOWN ISSUES once the live AI re-check passes and the product/ops items 6–8 below are done.**

## Decision: NOT READY FOR RELEASE (yet)

Round 2 left the signed-in path green. Phase 2 found two **P1 user-isolation bugs** that ordinary functional testing missed:
- **BUG-26:** a stale tab after an account switch leaks one person's script to the next.
- **BUG-27:** a leftover guest cookie silently runs a signed-in user as a guest.

Both put the wrong person's data in front of a user, or in an AI request, which is exactly the class of bug the release brief calls most dangerous. Both are small, local fixes.

The live AI evaluation (00:08–00:40 UTC) adds two more blockers, both in the "AI generates something incorrect" class the brief warns about:
- **BUG-37 (P1):** Polish refuses valid drafts on topics outside the user's niche (reproduced with a direct model call).
- **BUG-17 (P2, stays open):** 41 % of suggestions still put invented stories or opinions in the user's mouth.

Polish itself is excellent where it runs: 10/10 drafts with every fact kept, identical across repeats. Once all four are fixed and the release conditions below are met, the feature is **READY WITH KNOWN ISSUES**.

The core feature is solid on everything executed:
- suggest, polish, edit, save, reopen and undo;
- recording handoff and feedback;
- 8 devices from 280 px to tablet;
- 0 axe violations;
- 2,200 load requests with 0 errors;
- every injected failure ends in a usable state, with no lost text.

## Prioritised action plan

### Must fix before release (engineering)

| # | Item | Size |
| --- | --- | --- |
| 1 | **BUG-26:** before saving, re-check the device owner (`yap101-scripts-owner`) against the editor's user; if it changed, refuse the save and reload. Also listen for `storage` events to close stale editors | S |
| 2 | **BUG-27:** clear `yap101-guest` on real sign-in (auth callback + login), and have the middleware ignore the guest cookie when a Supabase session exists | S |
| 3 | **BUG-28:** close the sheet on Back (push a history entry when it opens) or warn before leaving with unsaved text | S |
| 4 | **BUG-37:** polish must not refuse valid drafts: widen the brief, and fall back to the local tidy instead of a redirect in polish mode | S |
| 5 | **BUG-17:** server-side check of suggestions for invented events/opinions → regenerate or fall back to the template; placeholder skeletons for story and opinion days | M |

### Must be true before release (product / ops)

| # | Item | Owner |
| --- | --- | --- |
| 6 | AI budget: paid credits or a Claude key (R-2, BUG-20) | Product owner |
| 7 | Re-run the AI evaluation after fixes 4–5 (`node qa-report/scripts/ai-eval.mjs`, about 40 calls): scope 100 %, invention ≤ 10 %, hand quality ≥ 2.5. **Phase 2 run: FAILED** (scope 35/37, invention 41 %, quality 1.95) | QA |
| 8 | Per-user daily AI cap decided and implemented (R-1); required the moment guests go | Product owner + engineering |

### Can be fixed after release

BUG-16 variant (goal text recited, 2/22), BUG-38 (long-draft polish times out; the tidy fallback catches it), BUG-29 (draft autosave), BUG-30 (orphaned scripts on level change), BUG-31 (remove a script), BUG-32/O-1 (clearer outage messages), BUG-33 (warn when the profile didn't load), BUG-34/35 (text scaling, Clear target), BUG-36 (client type check), R-4 (one auth call), R-5 (log only error messages).

### Needs product-owner approval

- Guest removal plan and returning-guest data (`guest-deprecation-impact.md` §3): clear, export or import.
- Device-only vs account-synced scripts (affects BUG-26/30 long term, and account deletion).
- Account deletion flow and wording on the privacy page.
- Guest-only bugs BUG-01/02/03/08 stay unfixed (skipped by decision, since guests are being removed).

## Coverage gaps (honest list)

- Live AI evaluation: run (40 calls); the long-draft polish (P05) never completed (provider `busy` at the 50 s budget, 2/2).
- Firefox and Safari/WebKit engines; real iOS/Android devices; real screen readers.
- Live Supabase project (RLS checked in SQL; behaviour via a mock).
- Production host: cold starts, function limits, CDN/WAF.
- Feedback scoring's `scriptDone` (needs real speech).
