# Round 3: Release-Blocker Fixes

2026-11-22 · Fixes for the five engineering must-fixes in `final-release-assessment.md`, plus the BUG-16 variant.

| Bug | Sev | Fix | Verified |
| --- | --- | --- | --- |
| BUG-26 | P1 | Scripts store remembers which person this tab claimed the device for. If another tab signs someone else in (or out), this tab can no longer read or write scripts or suggestions: no `previous` leaks either way. The record screen listens for the owner change and reloads with a message. A refused save says why. | Unit (3 tests); browser **A3 PASS** on the Supabase build (Priya doesn't see Sam's script; nothing sent to the AI) |
| BUG-27 | P1 | A real session now wins over the guest cookie: the middleware expires `yap101-guest` on that response (before the page's scripts read it); the sign-in callback and the login buttons clear it too. Guests without an account are unchanged. Guest scripts are adopted by the account the guest signs in to on that device. | Unit (middleware, 3 tests); browser **A5 PASS** (real profile loaded from Supabase, no guest banner) |
| BUG-28 | P2 | Opening the editor sheet adds a history entry: Back / Android back gesture closes the sheet and keeps the user on the page. Closing any other way removes the entry, so one more Back leaves normally. Safe with React's dev double-mount. | Unit (2 tests); browser B1–B4 on an emulated Pixel 7 (Back, Save, X, Escape): **4/4 PASS**; exploratory X1 now OK |
| BUG-37 | P1 | The brief says any everyday topic is in scope for polish. The route never returns a refusal for the user's own draft: if the model still redirects, the server falls back to the local tidy, unless the draft is an instruction to the assistant ("ignore your rules…", "write me…"), which keeps the redirect. | Unit (2 route tests); **live model re-check BLOCKED** (daily quota). The fallback doesn't depend on the model |
| BUG-17 | P2 | Server-side check of every suggestion: first-person events, scores, and opinion-day takes without a `[placeholder]` are detected. The writer gets one more try with a `<review>` listing the lines; anything still invented is shown as `[e.g. …]`, an example to replace, never as the user's own words. Client can't inject the review. | Unit (5 detector tests, 3 retry-flow tests); **live model re-check BLOCKED** (daily quota) |
| BUG-16 variant | P2 | The user's goal is labelled as a never-say coaching note, and lines reciting it are removed like the tip and focus. | Unit (2 tests) |

## Regression (all executed after the fixes)

| Suite | Result |
| --- | --- |
| Unit tests | **137 / 137** (was 117; +20 for these fixes) |
| Lint, type check, both production builds | clean |
| Signed-in suite S01–S16 (Supabase build) | 16 / 16 |
| Phase-2 browser suite (24) | 20 / 24: the 4 failures are the deferred P3s (H5, H6, F5, F6), unchanged |
| Round-1 browser suite E01–E30 | 30 / 30 |
| Fix verification V-* | 10 / 10 |
| Integration journey G1–G9 | 9 / 9 |
| Exploratory X1–X10 | 7 OK, 3 findings = the deferred P3s X2–X4 |
| axe-core (light + dark, 3 screens) | 0 violations |

**Test-harness note:** with BUG-28's fix, closing the sheet triggers a same-page history step. A script that closes the sheet and navigates or reloads within the same millisecond has that navigation cancelled by the browser (seen in S09, E03, E16). People can't act that fast, so the helpers now pause 100–150 ms after closing, as a person would. Noted as a known limitation, not a user-facing bug.

## Still to do before release

1. **Live AI re-check** (`ONLY=P06,P03,S03,S05,S12,S13,S18 node qa-report/scripts/ai-eval.mjs …`, then the full set) once the OpenRouter quota resets (00:00 UTC) or with paid credits: confirm the invention rate is ≤ 10 % and see how often `[e.g. …]` examples reach users.
2. Product items unchanged: AI budget, per-user cap, guest-data plan (`final-release-assessment.md`).
