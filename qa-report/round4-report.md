# Round 4: Free On-Device Speech Recognition, Gaze Calibration, Deferred P3 Fixes

2026-11-22 · Base commit `08a4386` · Results come from local runs in this session; nothing is estimated.

## 1. What shipped

| Item | Change | Free? |
| --- | --- | --- |
| Filler-word check | Whisper base (`onnx-community/whisper-base_timestamped`, MIT) via Hugging Face Transformers.js in a Web Worker. It runs after each take and re-scores with the words. Filler rate, clear close, hedging, and exact pace and first-3-s counts switch on. The transcript is shown with fillers highlighted (beta). | Yes: on-device, no key, no upload |
| Whisper guards | `voicedOnly` drops words with no voice under them (stops invented "Thank you." closes). `hiddenFillers` adds drawn-out "uhh"s Whisper drops. | n/a |
| Setting | Profile → "Filler-word check (beta)", on by default. Off means no download. | n/a |
| Saved data | `analysis.transcript`; feedback `filler_count`, `filler_words`, `transcript` (demo and Supabase) | n/a |
| Gaze calibration | The 3-2-1 countdown says "Look at the lens". Gaze is judged against the person's own baseline; fixed limits are the fallback. | n/a |
| BUG-29 | Editor text autosaves per day; restored after reload, with a notice; cleared on save | n/a |
| BUG-30 | Scripts sent as `previous` are limited to the current track (level + goal) | n/a |
| BUG-31 | "Remove script" on the editor; the day returns to talking points | n/a |
| BUG-32 | Database outage on the record screen: "We couldn't load this yap" + Try again (not "couldn't find"). Same on the feedback page. | n/a |
| BUG-33 | Profile load failing or slow (> 3 s): the suggestion is still written, with a "won't be tailored" notice | n/a |
| BUG-34 | Main editor buttons wrap at 200 % text instead of clipping | n/a |
| BUG-35 | "Clear" target is 44 × 44 px | n/a |
| BUG-36 | Client keeps only non-empty string lines from the API | n/a |
| BUG-38 | Each free model gets at most 28 s, so one slow model can't use up the whole 50 s polish budget | n/a |

## 2. Test results (this session)

| Suite | Result |
| --- | --- |
| Unit (Vitest) | **184 / 184** (new: transcript, face calibration, drafts, same-track scripts, editor P3 fixes) |
| Lint, `tsc --noEmit` | clean |
| Builds | demo ✓, Supabase mode ✓ |
| `asr-e2e.cjs`: espeak WAV as the Chromium microphone | **9 / 9**: model downloads, Whisper runs in the browser, "Um"/"Uh" counted, close and hedging measured, transcript highlighted, setting off means no check, 0 page errors. About 13 s after stopping, including the first download. |
| `asr-node.mjs` (Node, same model) | 9.7 s clip transcribed in ~2.5 s; keeps "Um," / "Uh," with word times |
| `e2e.cjs` | 30 / 30 |
| `verify-fixes.cjs` | 10 / 10 |
| `back-gesture.cjs` | 4 / 4 |
| `integration.cjs` | 9 / 9 |
| `yapscore-e2e.cjs` | 11 / 11 (runs with the filler check off; "No transcript" rows) |
| `signed-in.cjs` (Supabase mode, mock) | 16 / 16 |
| `phase2.cjs` (Supabase mode, mock) | **24 / 24**, including H5 (BUG-32), H6 (BUG-33), F5 (BUG-34), F6 (BUG-35), H4 (BUG-36) |

Test-script changes:
- H6 now waits up to 6 s and also checks the new notice.
- `yapscore-e2e` turns the filler check off, so it still covers the no-transcript path.

## 3. Not done: live AI re-check (BUG-17, BUG-37, BUG-38 live)

`ai-eval.mjs` (ONLY=P06,P03,S03,S05,S12,S13,S18) stopped at the first call. OpenRouter answered `429 Rate limit exceeded: free-models-per-day` (50 a day, account-wide; resets 2026-11-23 00:00 UTC). `/api/v1/key` still showed 50 left, so that endpoint doesn't reflect the free-model counter. Evidence: `evidence/round4-ai-recheck.json`. The invention, refusal and timeout fixes are covered by unit tests, but not yet re-measured live.

## 4. Notes and risks

- The first filler check downloads ~77 MB (WebAssembly) or ~95 MB (WebGPU), then the browser caches it.
  - Very old phones may be slow; the check runs in the background and "Get feedback" offers Skip.
  - On mobile data it can be turned off in Profile.
- Whisper base can miss quick fillers, so counts are labelled beta. Validate against hand-counted clips before launch.
- `listYaps` still returns an empty list on a database error. Left as is in this round: other screens rely on it, and the record screen now fails on the prompt load first.
