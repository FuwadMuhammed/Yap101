# Final Release Assessment (after Phase 2)

2026-11-21 · Commit `52d23ca` · Inputs: Phase 1 (`qa-summary.md`), round-2 fixes (`round2-report.md`), Phase 2 (`advanced-qa-report.md` and its 6 companion reports). The AI-quality section will be updated after the 00:07 UTC run.

## Decision: NOT READY FOR RELEASE (yet)

Round 2 left the signed-in path green. Phase 2 found two **P1 user-isolation bugs** that ordinary functional testing missed:
- **BUG-26:** a stale tab after an account switch leaks one person's script to the next.
- **BUG-27:** a leftover guest cookie silently runs a signed-in user as a guest.

Both put the wrong person's data in front of a user, or in an AI request, which is exactly the class of bug the release brief calls most dangerous. Both are small, local fixes. Once they are fixed and the release conditions below are met, the feature is **READY WITH KNOWN ISSUES**.

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

### Must be true before release (product / ops)

| # | Item | Owner |
| --- | --- | --- |
| 4 | AI budget: paid credits or a Claude key (R-2, BUG-20) | Product owner |
| 5 | Phase 2 AI evaluation meets the rubric (blocking criteria 100 %; invention ≤ 10 %), confirming BUG-16/17 fixes on the live model | QA, scheduled 00:07 UTC |
| 6 | Per-user daily AI cap decided and implemented (R-1); required the moment guests go | Product owner + engineering |

### Can be fixed after release

BUG-29 (draft autosave), BUG-30 (orphaned scripts on level change), BUG-31 (remove a script), BUG-32/O-1 (clearer outage messages), BUG-33 (warn when the profile didn't load), BUG-34/35 (text scaling, Clear target), BUG-36 (client type check), R-4 (one auth call), R-5 (log only error messages).

### Needs product-owner approval

- Guest removal plan and returning-guest data (`guest-deprecation-impact.md` §3): clear, export or import.
- Device-only vs account-synced scripts (affects BUG-26/30 long term, and account deletion).
- Account deletion flow and wording on the privacy page.
- Guest-only bugs BUG-01/02/03/08 stay unfixed (skipped by decision, since guests are being removed).

## Coverage gaps (honest list)

- Live AI evaluation: pending quota reset (00:07 UTC).
- Firefox and Safari/WebKit engines; real iOS/Android devices; real screen readers.
- Live Supabase project (RLS checked in SQL; behaviour via a mock).
- Production host: cold starts, function limits, CDN/WAF.
- Feedback scoring's `scriptDone` (needs real speech).
