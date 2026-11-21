# Regression and Integration Report (Phase 2)

2026-11-21 · Commit `52d23ca` (round-2 fixes) · Builds: demo (:3124) and Supabase mode (:3126/:3127).

**Verdict:** the script-editor changes do not break the surrounding app. A full journey (home → today's yap → script → teleprompter → recording → feedback → history → track → profile) passes 9/9 with zero page errors. Every existing suite is green.

## Integration journey (fake camera + microphone)

| Step | Result | Detail |
| --- | --- | --- |
| G1 Daily Yap navigation | PASS | Home links to `/record?prompt=2`; heading "Why you got into fitness" (niche applied) |
| G2 Script editor → prep card | PASS | Saved script shown with delivery cues |
| G3 Recording handoff / teleprompter input | PASS | Saved lines on the camera screen (`round2` S16 screenshot too) |
| G4 Recording | PASS | 4 s clip reaches review, "Why you got into fitness" |
| G5 Feedback | PASS | "Yap complete! +15 XP", streak, badges, feedback screen (`G5-feedback.png`) |
| G6 Stored yap | PASS | `prompt_id` 2, right title; the day's script still saved |
| G7 History + track | PASS | 1 history entry; "Day 2 of 30 · 1 days yapped" |
| G8 Profile + round trip | PASS | profile loads; script still on day 2 |
| G9 Page errors | PASS | none |
| Feedback scoring's `scriptDone` input | NOT TESTED | needs real speech with Voice follow on; the fake mic produces none |

## Suites re-run

| Suite | Result |
| --- | --- |
| Project unit tests | 117/117 |
| Signed-in suite (Supabase mode) | 16/16 |
| Round-1 browser suite E01–E30 | 30/30 |
| Fix verification V-* | 10/10 |
| Fuzz (6 properties × 2,000) | 6/6 |
| axe-core | 0 violations |
| Guest allowance harness (current version) | R1, R5–R9 PASS; R2–R4 FAIL = known guest bypasses, skipped by decision |

## Effects of round-2 changes on existing behaviour

| Change | Effect checked | Result |
| --- | --- | --- |
| Scripts owned per person (`claimDevice`) | Existing users' scripts kept after update (BUG-25 regression caught and fixed in round 2) | PASS (E04, E09, unit) |
| Suggestion cache format `{sig, lines}` | Old array-format caches are ignored, not crashed on | PASS (unit) |
| API requires JSON content type + same origin | The app's own `fetch` sends both | PASS (all suites) |
| `/api/*` 401 instead of login redirect | Page navigation still redirects to /login | PASS (S01, S02) |
| Prompt IDs per level/goal | Changing level later orphans saved scripts (pre-existing design) | FINDING BUG-30 (X3) |
