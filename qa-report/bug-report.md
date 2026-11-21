# Bug Report: Script Editor

Commit `2a1f30e` · Tested 2026-11-21 (UTC) · No production code was changed during this audit.

**Environments used**

| Name | What it is |
| --- | --- |
| ENV-DEMO | `next build` with `NEXT_PUBLIC_DEMO_MODE=true`, `next start` on :3124, no AI key (route answers with local templates) |
| ENV-AI | Same build on :3125 with an OpenRouter key injected by the session proxy (real free models) |
| ENV-UNIT | Vitest 5 harness running the real route/storage code with faked AI, auth and cookies (`qa-report/scripts/*.qa.test.ts`) |
| Browser | Playwright Chromium 400×860 and iPhone 13 emulation |

**Severity totals:** P0 0 · P1 5 · P2 8 · P3 8 (21 bugs). No P0 was found; BUG-18 is P1 but becomes P0 on shared devices (family tablets, school or library computers).

| ID | Sev | Title | Component |
| --- | --- | --- | --- |
| BUG-18 | P1 | Previous user's scripts stay on the device after sign-out, are shown to the next user and sent to the AI | `script.ts`, `data/*` signOut |
| BUG-19 | P1 | "Delete my guest data" leaves scripts and suggestions behind | `data/demo.ts` `demoReset` |
| BUG-01 | P1 | Simultaneous requests bypass the guest allowance (10 of 10 succeed) | `route.ts`, `guest-limit.ts` |
| BUG-02 | P1 | Guest allowance trusts client-supplied `X-Forwarded-For` / `X-Real-IP` | `guest-limit.ts` |
| BUG-03 | P1 | Dropping the cookie resets the allowance on any new server instance | `guest-limit.ts` |
| BUG-04 | P2 | Polish silently drops everything after 3,000 characters | `write-script.ts` `parseWriteRequest` |
| BUG-05 | P2 | Save fails silently when storage is full: script lost on reload | `script.ts` `saveScript` |
| BUG-06 | P2 | Record screen crashes when `yap101-scripts` holds `null` | `script.ts` `readAll`/`loadScript` |
| BUG-07 | P2 | AI output is not sanitised: preambles, markdown, prompt echoes reach the teleprompter | `ai-script.ts` `clean` |
| BUG-08 | P2 | Guest allowance cannot be seen until it runs out | `script-editor.tsx` (missing UI) |
| BUG-16 | P2 | Suggestions read the coaching tips aloud ("Picture one friend behind the lens") | `write-script.ts` prompt |
| BUG-17 | P2 | Suggestions invent personal stories and opinions despite the brief | `write-script.ts` prompt / model |
| BUG-20 | P2 | Shared free AI quota ran out after ~30 requests; feature falls back for everyone | `ai-script.ts` config / capacity |
| BUG-09 | P3 | Saves silently fail when `yap101-scripts` is a non-object JSON value | `script.ts` |
| BUG-10 | P3 | No body size limit and no Origin check on `/api/script` | `route.ts` |
| BUG-11 | P3 | A late, stale suggestion response overwrites the cached suggestion | `script-editor.tsx` `suggest` |
| BUG-12 | P3 | Cached suggestion keeps the old name after a profile change | `script-editor.tsx`, `script.ts` |
| BUG-13 | P3 | Local tidy changes grammatical repeats ("that that", "had had") | `write-script.ts` `tidyDraft` |
| BUG-14 | P3 | Very long AI lines are not capped | `ai-script.ts` `clean` |
| BUG-21 | P3 | Polish can take ~48 s with no cancel and may exceed host time limits | `ai-script.ts`, `route.ts` |
| BUG-15 | P3 | `/api/script` behind login redirect returns HTML 307 instead of JSON 401 | `src/lib/supabase/proxy.ts` (code review only) |

---

## BUG-01 · P1 · Simultaneous requests bypass the guest allowance

- **Component:** `src/app/api/script/route.ts` (lines 34–55), `src/lib/guest-limit.ts`
- **Environment:** ENV-UNIT (real route code, AI faked with a 50 ms delay)
- **Preconditions:** Guest (no Supabase session), fresh allowance.
- **Steps:**
  1. Send 10 `POST /api/script` requests at the same moment from the same IP, with no cookie.
- **Expected:** 3 succeed, 7 get `429 guest_limit`.
- **Actual:** 10 succeed and 10 AI calls are made.
- **Evidence:** `qa-report/evidence/allowance-and-parse.txt` → `R2 successes out of 10 concurrent: 10 AI calls made: 10`
- **Why:** the count is read (`guestUsed`) before the AI call and written (`recordGuestScript`) only after it finishes, so every in-flight request sees `used = 0`.
- **Suggested fix:** reserve the slot before calling the AI (increment first, refund on failure), using an atomic store (Supabase row, KV/Redis `INCR`) rather than process memory.

## BUG-02 · P1 · Guest allowance trusts client-supplied IP headers

- **Component:** `src/lib/guest-limit.ts` `clientIp()`
- **Environment:** ENV-UNIT; also reproduced on ENV-AI (see `api-test-report.md`, G-tests)
- **Steps:**
  1. Send 10 requests with no cookie, each with a different `X-Forwarded-For: 172.20.0.N`.
- **Expected:** 3 succeed.
- **Actual:** 10 succeed.
- **Evidence:** `R3 successes with a new X-Forwarded-For each time: 10 of 10`
- **Impact:** with a cookie-less HTTP client, the per-day limit is unlimited. All users share one OpenRouter free quota (this key: 50 requests/day), so one script can exhaust AI for everyone: a feature-wide outage for the rest of the UTC day.
- **Suggested fix:** take the IP only from the hosting platform's trusted header (e.g. Vercel's `x-vercel-forwarded-for` / `request.ip`), never from a header the client can set; add a global daily cap per deployment.

## BUG-03 · P1 · Dropping the cookie resets the allowance on a new instance

- **Component:** `src/lib/guest-limit.ts` (`byIp` is a module-level `Map`)
- **Environment:** ENV-UNIT (new module instance = new serverless instance)
- **Steps:**
  1. Use 3 scripts from one IP (4th is blocked, correct).
  2. Discard the cookie; the next request lands on a fresh instance.
- **Expected:** still blocked.
- **Actual:** `200`, a fresh allowance.
- **Evidence:** `R4 same instance 4th: 429 | new instance, no cookie: 200`
- **Note:** a valid exhausted cookie does block across instances and IPs (R6 PASS), and a forged cookie is rejected (R5 PASS). The weakness is that the cookie is optional.
- **Suggested fix:** same as BUG-02: a shared store keyed on a server-trusted identity, plus a global cap.

## BUG-04 · P2 · Polish silently drops everything after 3,000 characters

- **Component:** `src/lib/write-script.ts` `parseWriteRequest` (`draft: str(b.draft, 3000)`)
- **Environment:** ENV-DEMO, Chromium; API check on ENV-DEMO
- **Steps:**
  1. Open Day 2 → Read a script.
  2. Paste 1,500 sentences (43,892 chars).
  3. Tap "Polish it for me".
- **Expected:** either the whole draft is polished, or the user is told it is too long before polishing.
- **Actual:** the result is 3,001 characters ending mid-word ("Sente."); sentences 129–1,500 are gone. The 60 s warning shows, but Polish stays enabled. "Back to your version" restores the text, which is the only recovery.
- **Evidence:** `qa-report/evidence/e2e.json` E12; screenshot `evidence/shots/E12-truncated.png`; API case A19.
- **Suggested fix:** disable Polish (with a message) above a client-side limit that matches the server; on the server, return 413 instead of truncating.

## BUG-05 · P2 · Save fails silently when storage is full

- **Component:** `src/lib/script.ts` `saveScript` (catch block swallows the error)
- **Environment:** ENV-DEMO, Chromium
- **Steps:**
  1. Fill `localStorage` until `setItem` throws (verified with a probe write).
  2. Type a script and tap Save.
  3. Reload.
- **Expected:** a warning that the script could not be saved.
- **Actual:** the prep card shows the script, there's no toast, and after reload the script is gone.
- **Evidence:** `qa-report/evidence/storage-full.json` → `{"storage":"FULL","shownAfterSave":true,"warningToasts":[],"presentAfterReload":false}`
- **Suggested fix:** have `saveScript` return success/failure; show "Couldn't save on this device" when it fails, and prune `yap101-suggestions` first to free space.

## BUG-06 · P2 · Record screen crashes when `yap101-scripts` is `null`

- **Component:** `src/lib/script.ts` `readAll()` → `loadScript()` (called in `Recorder`'s initial state)
- **Environment:** ENV-DEMO, Chromium
- **Steps:**
  1. Set `localStorage["yap101-scripts"] = "null"` (a valid JSON value; can come from another build, an extension or manual edits).
  2. Open any day's record screen.
- **Expected:** the screen loads and the bad value is ignored.
- **Actual:** "This page couldn't load". Console: `Cannot read properties of null (reading '2')`. Every day is unusable until site data is cleared.
- **Evidence:** E14; screenshot `evidence/shots/E14-null-storage.png`
- **Suggested fix:** in `readAll`, return `{}` unless the parsed value is a plain object.

## BUG-07 · P2 · AI output is not sanitised

- **Component:** `src/lib/ai-script.ts` `clean()` / `parseLoose()`
- **Environment:** ENV-UNIT (provider responses faked), see `evidence/allowance-and-parse.txt` M1, M2, M11
- **Steps:** make the model reply with any of:
  - a chatty preamble: "Sure! Here's your script:"
  - markdown: `**Hey**`
  - the system prompt as plain text: "# Role …"
- **Expected:** these are stripped or rejected.
- **Actual:** they become teleprompter lines: `"Sure! Here's your script:"`, `"**Hey**, I'm Sam."`, `"# Role"`.
- **Impact:** free models do not always follow the JSON schema (the code itself says so); the user reads junk aloud or must spot and delete it. The M11 echo also means a model tricked into printing its brief would show it to the user.
- **Suggested fix:** in `clean()`, drop lead-in lines ("here's…", "sure"), strip markdown emphasis, headings and bullets, and reject output that contains the system prompt's distinctive phrases.

## BUG-08 · P2 · Guest allowance is invisible until exhausted

- **Component:** `src/components/record/script-editor.tsx` (missing feature)
- **Environment:** code review + ENV-AI
- **Expected (per test brief "remaining allowance"):** guests see how many AI scripts they have left.
- **Actual:** no count anywhere; the first signal is the "That's today's free AI scripts for guests" error after the 3rd script.
- **Suggested fix:** return `remaining` in the API response and show "2 free AI scripts left today" under the buttons for guests. (Needs product decision.)

## BUG-09 · P3 · Saves silently fail when `yap101-scripts` is a non-object

- **Component:** `src/lib/script.ts` `saveScript`
- **Steps:** set `localStorage["yap101-scripts"] = "\"just a string\""` → open Day 2 → type → Save → reload.
- **Expected:** saved.
- **Actual:** the assignment onto a string primitive throws in strict mode and is swallowed; the script is gone after reload.
- **Evidence:** E16.
- **Suggested fix:** same guard as BUG-06.

## BUG-10 · P3 · No body size limit and no Origin check on `/api/script`

- **Component:** `src/app/api/script/route.ts`
- **Evidence:** API cases A20 (5 MB body → 200 in 61 ms; fields are trimmed after parsing) and A26 (`Content-Type: text/plain` accepted, so any website can POST without a CORS preflight).
- **Impact:** other sites can use the endpoint as a free AI proxy (bounded only by the weak guest limit, BUG-01–03); large bodies cost parse time and memory.
- **Suggested fix:** reject bodies over ~32 KB; require `Content-Type: application/json`; check `Origin` against the site URL.

## BUG-11 · P3 · A stale response overwrites the cached suggestion

- **Component:** `script-editor.tsx` `suggest()` (`saveSuggestion` runs after the editor closed)
- **Steps:** tap "Use our suggestion" (slow reply A, 3 s) → close the editor → reopen → tap again (fast reply B) → wait for A.
- **Expected:** the cache keeps B, the one the user saw.
- **Actual:** the box shows B, but the cache holds A; the next "Use our suggestion" brings back A.
- **Evidence:** E18.
- **Suggested fix:** abort the request on unmount (`AbortController`), or only cache when the component is still mounted.

## BUG-12 · P3 · Cached suggestion is stale after a profile change

- **Steps:** get a suggestion as "Sam" → change the display name to "Alex" → reopen the editor → clear → "Use our suggestion".
- **Expected:** a suggestion for Alex.
- **Actual:** "Hey, I'm Sam and I talk about fitness!" (from the cache).
- **Evidence:** E20.
- **Suggested fix:** key the cache by a hash of the profile fields used, or clear it on profile save.

## BUG-13 · P3 · Local tidy changes grammatical repeats

- **Component:** `write-script.ts` `tidyDraft` (doubled-word regex)
- **Evidence:** `evidence/tidy-repeated-words.txt`: "I knew that that was wrong" → "I knew that was wrong."; "She had had enough" → "She had enough"; "Bye bye" → "Bye". A 20,000-word "word word …" draft collapses to "Word." (A19).
- **Impact:** only on the offline/failed-AI fallback path; meaning can change.
- **Suggested fix:** only collapse a repeat when it is a known stutter (pronouns, articles), or not at all.

## BUG-14 · P3 · Very long AI lines are not capped

- **Evidence:** M5: a 20,000-character single line passes `clean()` unchanged.
- **Suggested fix:** split long lines into sentences and cap each line (e.g. 300 chars).

## BUG-15 · P3 · Login redirect on `/api/script` returns HTML (code review only)

- **Component:** `src/lib/supabase/proxy.ts` (`/api/script` not in `PUBLIC_PATHS`)
- **Status:** NOT EXECUTED: needs a Supabase project. Found by reading the code.
- **Expected:** an expired session gets `401` JSON.
- **Actual (by code):** `307` to `/login`; `fetch` follows it, gets the HTML page, JSON parsing fails, and the editor shows "had a hiccup" plus the template starter with no prompt to sign in again.
- **Suggested fix:** exclude `/api/*` from the redirect and let the route answer 401.

## BUG-18 · P1 · Previous user's scripts survive sign-out and leak to the next user and the AI

- **Component:** `src/lib/script.ts` (one global `yap101-scripts` key, not per user); `signOut` in `src/lib/data/demo.ts` and `src/lib/data/supabase.ts` don't clear it.
- **Environment:** ENV-DEMO, Chromium (the Supabase `signOut` was checked by code review: it calls only `auth.signOut()`).
- **Preconditions:** Sam has a saved script on day 3: "My private story about my divorce."
- **Steps:**
  1. Sam: Profile → Sign out.
  2. Alex signs in on the same browser and opens day 3; then day 2 → Read a script → "Use our suggestion".
- **Expected:** Alex sees none of Sam's scripts, and none are sent anywhere.
- **Actual:** day 3 shows Sam's private script, and Alex's AI request carries `previous: ["My private story about my divorce."]` next to `name: "Alex"`.
- **Evidence:** `evidence/e2e-accounts.json` (`E31_nextUserSeesPreviousScript: true`, `E31_previousUsersScriptSentToAi: true`).
- **Suggested fix:** namespace keys by user id (`yap101-scripts:<userId>`), clear them on sign-out, and only send `previous` that belong to the current user.

## BUG-19 · P1 · "Delete my guest data" doesn't delete scripts

- **Component:** `src/lib/data/demo.ts` `demoReset()` removes only `yap101-demo` and recordings.
- **Steps:** save a script and a suggestion → Profile → "Delete my guest data" → confirm.
- **Expected:** the confirmation says "Delete all your yaps, streaks and settings from this browser? This can't be undone." Scripts are the user's personal content and should go too.
- **Actual:** `yap101-scripts` and `yap101-suggestions` remain.
- **Evidence:** `evidence/e2e-delete.json`.
- **Suggested fix:** remove both keys in `demoReset` (and in sign-out, see BUG-18).

## BUG-16 · P2 · Suggestions read the coaching tips aloud

- **Component:** `src/lib/write-script.ts` `scriptUserMessage` (skill tip and focus are sent as "Speaking skill" and "Reminder for their goal" with no instruction that they are coaching notes, not lines).
- **Environment:** ENV-AI (OpenRouter free models).
- **Evidence:** `evidence/ai-quality.json`:
  - Q02 "Picture one friend behind the lens—that's who I'm talking to today."
  - Q04 "If I stumble, I'll smile and keep going."
  - Q06 "If I stumble, I smile and keep going."
  - Q08 "Just picture one friend behind the lens."
- **Rate:** 4 of 9 suggestions.
- **Expected:** the skill is shown off in delivery, not recited.
- **Suggested fix:** label these "coaching notes for the speaker: never say them" in the brief; add a post-check that drops lines matching the tip text.

## BUG-17 · P2 · Suggestions invent personal stories and opinions

- **Component:** prompt/model behaviour (the brief says "no made-up stories").
- **Evidence:**
  - Q11 (food, no details): "I wanted to make [dish]… I forgot to set a timer. Smoke filled the kitchen… We ordered pizza and laughed instead."
  - Q08: "Fitness clicked for me after a really long shift."
  - Q04: "I almost skipped my workout today because of it."
  - Q06: picks Rust and "I'm still learning" for the user.
  - Real J1: "I used to think cooking was complicated."
- **Impact:** users may read statements about their life that aren't true, on camera, for posting.
- **Suggested fix:** require a [placeholder] for any event, feeling-in-time or opinion not given; add an eval set like Q-cases to CI; consider a stronger model for suggestions.

## BUG-20 · P2 · Shared free AI quota exhausted after ~30 requests

- **Environment:** ENV-AI.
- **Observed:** after about 30 calls in ~25 minutes (21 quality cases, 8 allowance calls, 1 browser journey), every free model returned 429 and the API answered `{"error":"busy"}` at 21:47 and again at 21:49 UTC; the browser J2 run got the local tidy instead of a polish.
- **Impact:** in production all users share this quota: a handful of active users, or one abuser via BUG-01/02, switches AI off for everyone. The fallback works and loses nothing, but both buttons stop doing their real job.
- **Evidence:** `evidence/j2-real-retry.txt`, `evidence/e2e-real.json` (`j2_ms: 335`).
- **Suggested fix:** a paid key/credits or Claude as primary; per-user server-side quotas; alerting on `busy` rates.

## BUG-21 · P3 · Polish can take ~48 s with no cancel

- **Evidence:** P05 (280-word draft) took 48.4 s; the OpenRouter loop allows up to 50 s; the route sets no `maxDuration`.
- **Impact:** the user waits on "Polishing…" with no way to cancel except closing the sheet; on hosts with a shorter limit the request is killed and the fallback shows.
- **Suggested fix:** a Cancel button (AbortController); set `export const maxDuration = 60` in the route; shorter per-model timeouts.
