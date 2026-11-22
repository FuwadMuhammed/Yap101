# Round 2: Fixes and New Test Angles

2026-11-21 (UTC) · Branch `claude/ecstatic-gauss-85ydxu` · Scope given by the product owner: **guest mode will be removed before release**, so guest-only issues are skipped; fix everything else; test the feature in new ways; don't repeat round-1 work.

**Result:** 19 bugs fixed and verified. 4 guest-only bugs skipped. 1 bug (shared AI quota) needs a budget decision, not code. 4 new bugs were found by the new test angles and fixed, plus 1 regression I introduced and caught myself. Every automated suite is green except the 3 guest-only bypass checks, which are skipped by design.

## 1. Bug status

| Bug | Sev | Title | Status | Verified by |
| --- | --- | --- | --- | --- |
| BUG-18 | P1 | Previous person's scripts survive sign-out, shown to next person and sent to AI | **Fixed** | V-E31, S05, S06, unit |
| BUG-19 | P1 | "Delete my guest data" leaves scripts | **Fixed** | V-E32 |
| BUG-04 | P2 | Polish silently cut drafts at 3,000 chars | **Fixed**: Polish disabled with a message; API answers 413, never cuts | V-E12, E12, unit |
| BUG-05 | P2 | Failed save looked successful | **Fixed**: frees cache space and retries; warns if it still fails | V-E17b, unit |
| BUG-06 | P2 | `null` in storage crashed the record screen | **Fixed** | V-E14, unit (6 corrupt shapes) |
| BUG-07 | P2 | Preambles, markdown, prompt echoes reached the teleprompter | **Fixed** in `clean()` | unit, fuzz (2,000 cases) |
| BUG-16 | P2 | Suggestions recited the coaching tips | **Fixed**: tips labelled "never say"; lines that repeat them are removed | unit; real-AI re-check BLOCKED (quota) |
| BUG-17 | P2 | Suggestions invented personal stories | **Fixed in the writer brief** (placeholders for every personal event, story days included) | unit (brief text); **real-AI re-check BLOCKED (quota)** |
| BUG-09 | P3 | Non-object storage made saves fail silently | **Fixed** | V-E16, unit |
| BUG-10 | P3 | No body limit / Origin check | **Fixed**: 32 KB limit (413), JSON only (415), cross-site Origin refused (403) | V-A20/26, unit |
| BUG-11 | P3 | Late stale reply overwrote the cached suggestion | **Fixed**: requests aborted on close | V-E18, unit |
| BUG-12 | P3 | Cached suggestion kept the old name | **Fixed**: cache tied to the profile used | V-E20, S09, unit |
| BUG-13 | P3 | Local tidy removed "that that", "had had" | **Fixed**: only real stutters collapse | unit, fuzz |
| BUG-14 | P3 | AI lines not length-capped | **Fixed**: split at sentences/commas, max 220 chars | unit, fuzz |
| BUG-15 | P3 | API behind login redirect returned HTML | **Fixed**: JSON 401 + "Sign in again" message | S01, S07, unit |
| BUG-21 | P3 | 48 s polish with no way out | **Fixed**: Cancel button; route `maxDuration = 60` | V-CANCEL, S14, unit |
| BUG-01/02/03 | P1 | Guest allowance bypasses | **Skipped**: guest-only (signed-in users have no allowance) | — |
| BUG-08 | P2 | Guest allowance not shown | **Skipped**: guest-only | — |
| BUG-20 | P2 | Shared free AI quota ran out | **Open**: needs a paid key or credits (product decision). Hit again in round 2 | — |

### New bugs found in round 2 (all fixed)

| Bug | Sev | Found by | Problem | Fix |
| --- | --- | --- | --- | --- |
| BUG-22 | P2 | Fuzzing the prompt builder | User text containing `</draft><request>…` could forge sections of the AI prompt (prompt-structure injection) | Our section tags in any user field are neutralised to `(draft)` etc. |
| BUG-23 | P3 | Fuzzing the offline tidy | ASCII word edges: after non-English letters, "like," was cut from inside a word, creating a word the user never wrote | Unicode-aware word edges |
| BUG-24 | P3 | axe-core audit | Length button's accessible name ("Length: 30 second goal") didn't contain its visible text ("30s goal"), breaking voice control | Name now starts with the visible text |
| BUG-25 | P1 | Round-2 regression run (E04, E09) | **Introduced by my BUG-18 fix, caught before commit:** every existing user's saved scripts would be wiped on the first load after the update (they have no owner yet) | Scripts saved before owners were tracked are kept for the first person who signs in; sign-out clears from then on |

### Observation (not fixed)

- **O-1 (P3):** during a Supabase auth outage the editor says "Your session ended. Sign in again…" (S08). Text is never lost; the message is just imprecise. The middleware can't tell an outage from a logged-out user without extra calls.

## 2. New test angles (none of these were run in round 1)

| Suite | What it does | Result | Evidence |
| --- | --- | --- | --- |
| Signed-in E2E (S01–S16) | App built in **Supabase mode** against a mock Supabase (`scripts/mock-supabase.mjs`), so middleware, `auth.getUser`, profile ids and sign-out run for real | **16/16 PASS** | `round2-signed-in.*`, shots S03, S13, S15, S16 |
| — S01/S02 | No session: API → JSON 401; page → `/login` | PASS | |
| — S03 | Profile loaded from the backend feeds the request (name, niche, platform, level) and the device owner | PASS | |
| — S04 | Signed-in user: 6 calls, never `guest_limit`, no guest cookie | PASS | |
| — S05 | Account switch without sign-out: Sam's script wiped, Priya's request has no `previous` | PASS | |
| — S06 | Sign-out from Profile clears scripts and suggestions | PASS | |
| — S07/S08 | Session revoked or auth outage mid-edit: 401, clear message, draft untouched | PASS (O-1) | |
| — S09 | Profile edited on the backend: new suggestion, stale cache ignored | PASS | |
| — S10/S11 | Pro (hooks) and intermediate two-niche users: defaults, opener-only, 60 s target, niche rotation | PASS | |
| — S12 | Keyboard only: open editor, type, Tab to Save, Enter | PASS | |
| — S13 | 320 px screen: no sideways scroll, both buttons fit | PASS | shots/S13-320px.png |
| — S14 | Slow 3G (2 s latency, CDP): "Writing…", 1 request despite double tap, Cancel leaves box empty, no error toast | PASS | |
| — S15 | Dark-mode emulation | PASS (app keeps its light theme; readable) | shots/S15-dark.png |
| — S16 | Saved script reaches the camera screen (Chromium fake camera) | PASS | shots/S16-camera-screen.png |
| Property-based fuzzing | 6 properties × 2,000 seeded random inputs (unicode, emoji, control chars, markup, injection text) over `textToLines`, `tidyDraft`, `parseWriteRequest`, `scriptUserMessage`, `clean`, save/load | 2 properties failed → BUG-22, BUG-23 → fixed → **6/6 PASS** | `scripts/fuzz.qa.test.ts`, `round2-harnesses.txt` |
| Accessibility audit | axe-core WCAG 2.1 A/AA on prep screen, empty editor, polished editor + undo bar, light and dark | 1 serious issue → BUG-24 → fixed → **0 violations** | `round2-a11y.*` |
| Fix verification | Each round-1 failure re-run in a real browser | **10/10 PASS** | `round2-verify-fixes.*` |

## 3. Regression

| Suite | Result |
| --- | --- |
| Project unit tests | 117 / 117 (was 85; +32 for the fixes) |
| QA harnesses (fuzz, malformed AI replies, allowance) | 140 / 143; the 3 failures are the skipped guest bypasses BUG-01/02/03 |
| Round-1 browser suite E01–E30 (demo build) | 30 / 30 (E12, E18, E20 updated to the fixed behaviour) |
| Signed-in suite S01–S16 (Supabase build) | 16 / 16 |
| Lint, type check, both production builds | clean |

## 4. Blocked

- **Real-AI re-check of the writer brief (BUG-16, BUG-17):** OpenRouter's free tier allows 50 requests per day per account. Round 1 used it up, and every model has answered 429 since. The fixes are unit-tested (the brief now forbids invented events; lines repeating coaching tips are stripped server-side), but the model's actual behaviour must be re-checked once the quota resets (00:00 UTC) or with a paid key: `node qa-report/scripts/ai-quality.mjs <ai-server>` (Q04, Q08, Q11 are the cases to watch).
- Real iOS/Android devices and screen readers: still emulation and axe only.

## 5. Before release (with guests removed)

1. **AI budget (BUG-20):** the free tier can't serve real users. Add credits or a paid key.
2. **Re-run the real-AI quality suite** once (§4) to confirm BUG-16/17 with the live model.
3. **When removing guests:** delete the `yap101-guest` bypass in `src/lib/supabase/proxy.ts` and the guest branch in `src/app/api/script/route.ts`, so `/api/script` only serves signed-in users. Today a request carrying the `yap101-guest=1` cookie still reaches the route as a guest.
4. Consider a per-user daily cap for signed-in users: they are currently unlimited, and the AI quota is shared.

**Recommendation: READY WITH KNOWN ISSUES**, provided items 1–3 are done. No open P0/P1 bugs remain on the signed-in path.
