# Yap Score v2: Implementation Notes

Implements "Yap Score: What Yap101 Should Measure and Show" (Nov 2026). Everything runs on the phone; no recording leaves the device.

## What runs where

| Group | Parameter | How it's measured now | Needs AI? |
| --- | --- | --- | --- |
| Hook | Start latency | Web Audio voice activity (`audio.ts`) | No |
| Hook | First-3-second speech | Exact from the on-device transcript; syllable-beat estimate when the check is off | On-device Whisper (free) |
| Hook | Face in first frame | MediaPipe Face Landmarker, time of first face | No (MediaPipe is an on-device ML model already in the app) |
| Voice | Pace | Exact from word timestamps; syllable-beat estimate when the check is off | On-device Whisper (free) |
| Voice | **Filler rate** | `fillerStats` on the transcript, plus `hiddenFillers` for drawn-out "uhh"s Whisper drops | **On-device Whisper (free)** |
| Voice | Pause quality | Short pauses 0.3–2 s per minute, dead air > 3 s | No |
| Voice | Pitch variation | Autocorrelation pitch, SD in semitones vs the user's first 5 takes | No |
| Voice | Vocal energy | Mean dBFS, loudness spread, clipping share | No |
| Presence | Lens gaze | Face Landmarker eye-look blendshapes + head yaw | No |
| Presence | Smile and warmth | Smile blendshapes in the first 3 s and last 5 s | No |
| Presence | Framing | Face height and eye line from landmarks | No |
| Presence | Head movement | Spread of yaw and pitch from the face transform | No |
| Presence | Lighting | Face vs frame brightness from a 16×16 canvas sample once a second | No |
| Structure | Duration fit | Clip length vs the take's goal length | No |
| Structure | **Clear close** | `closeDetected` on the last 5 s of words | **On-device Whisper (free)** |
| Structure | **Hedging words** | `hedgeStats` (informational, never scored) | **On-device Whisper (free)** |

All 16 parameters work. If the filler-word check is off or can't load, the three transcript parameters show "No transcript" and are left out of the score (their weight is spread across the rest of their group).

## Filler-word check (free, on-device speech recognition)

- **Model:** OpenAI Whisper base (MIT) as `onnx-community/whisper-base_timestamped` from the Hugging Face Hub, run by Hugging Face **Transformers.js** in a Web Worker (`src/lib/analysis/asr.worker.ts`, `asr.ts`). No API key, no server, no cost; the audio never leaves the phone.
- **Download:** about 77 MB (WebAssembly, 8-bit encoder) or 95 MB (WebGPU, fp16 encoder), once; the browser caches it. The ONNX Runtime wasm (27 MB) is bundled by Next and served from our own origin.
- **Flow:** after a take, the clip is decoded to 16 kHz mono and transcribed in the background while the review sheet is open (progress shown). The score is recomputed with the words. "Get feedback" waits for it (with Skip). Retake drops a pending result.
- **Accuracy guards:**
  - `voicedOnly` drops words with no voice under them, because Whisper can invent "Thank you." over silence, which would fake a clear close.
  - `hiddenFillers` adds a heard "uh" where there is steady voice in a gap between words, because Whisper drops some long "uhh"s.
  - Fillers are marked "beta", and the transcript is shown with fillers highlighted so people can see what was counted.
- **Saved:** `analysis.transcript` (words with times), plus `filler_count`, `filler_words` and `transcript` text on the feedback row (demo and Supabase).
- **Setting:** Profile → "Filler-word check (beta)", on by default; off means no download.
- **Tested:** `qa-report/scripts/asr-node.mjs` (Node, same model). In Chromium with a spoken WAV as the microphone, `qa-report/scripts/asr-e2e.cjs` passes 9/9, about 13 s including the first download.
- **Rejected:**
  - `desert-ant-labs/uhm`: 46 MB wasm plus a model, a licence check that phones home, and a source-available licence.
  - CrisperWhisper: reported non-commercial, and needs a server and uploads.
  - whisper-tiny: drops fillers.

## Gaze calibration

The 3-2-1 countdown says "Look at the lens", and the face check runs during it. The median eye direction and head turn over those ~2.4 s become the person's own "at the lens" baseline (`gazeBaseline`). During the take, gaze is judged against it (`isLooking`), which fits different eyes, glasses and phone positions better than fixed limits. If no steady face was seen, or they looked away during the countdown, the fixed limits are used. The details show "(measured against your own look at the lens)" when calibrated.

## Scoring (`src/lib/analysis/yapscore.ts`)

- Band → points: green 100; amber linear 100→60; red 40, 20 beyond extremes; fillers never below 40.
- Group weights by programme week (W1 15/35/40/10 … W4 30/25/20/25), then goal adjustments:
  - "freeze" (Feel natural): +10 Presence, −10 Structure in weeks 1–2; start latency counts double.
  - "ramble" (Get to the point): +10 Structure, −10 Presence; duration and close count double.
  - "professional" (Sound pro): pace green narrows to 130–165; hedging tip on.
  - Appearance-sensitive mode: Presence weight moves to Voice and Structure; no face metrics or tips.
  - Eye-contact opt-out: gaze removed; its weight spread across Presence.
- Protections:
  - One parameter can pull its group down by 25 points at most.
  - Pitch and energy bands use the user's own first 5 takes once 3 exist.
  - The first 7 takes lead with "vs your day 1" and the take count.
  - Confidence is shown next to the score, never inside it.
- Tips: rank by gap × group weight; skip any tip shown in the last 2 takes; skip appearance tips in appearance-sensitive mode. Each tip has a "what happened, why it matters, drill" form, and the drill opens the same prompt with a drill card.

## Other AI options (not used)

1. **In the browser (free, private):** Whisper via Transformers.js (`onnx-community/whisper-base_timestamped`) for word timestamps, plus `desert-ant-labs/uhm` (98 MB ONNX) to catch the fillers Whisper drops. Downloads are heavy for phones, so run them after recording, in a worker.
2. **On a server (most accurate):** CrisperWhisper (verbatim, keeps fillers, word timestamps) on a Hugging Face Inference Endpoint / Modal / Replicate, called from a Vercel route. **Check its licence: reported as non-commercial.** Uploading audio needs explicit consent (the spec's privacy caveat).
3. Either way, feed the words into `analyse({ v2: { …, words } })`: filler rate, clear close, hedging and exact pace/first-3-second counts switch on automatically (unit-tested in `yapscore.test.ts`).
4. Tone/emotion (emotion2vec) isn't needed: pitch variation and vocal energy already cover "flat vs lively" on-device.

## Still to decide

- Validate bands against ~100 hand-scored clips before launch (spec "Validate before launch").
- Settings are stored per device (`yap101-score-prefs`); move to the profile if they should follow the account.
- Validate filler counts against hand-counted clips (Whisper base is good at "um"/"uh" but can miss quick ones).
