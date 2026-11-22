# Yap Score v2: Implementation Notes

Implements "Yap Score: What Yap101 Should Measure and Show" (Nov 2026). Everything runs on the phone; no recording leaves the device.

## What runs where

| Group | Parameter | How it's measured now | Needs AI? |
| --- | --- | --- | --- |
| Hook | Start latency | Web Audio voice activity (`audio.ts`) | No |
| Hook | First-3-second speech | Estimated words from syllable beats in 0–3 s; exact with a transcript | No (estimate) / ASR for exact |
| Hook | Face in first frame | MediaPipe Face Landmarker, time of first face | No (MediaPipe is an on-device ML model already in the app) |
| Voice | Pace | Syllable-beat estimate; exact from word timestamps when available | No (estimate) / ASR for exact |
| Voice | **Filler rate** | `transcript.ts` (`fillerStats`) given word timestamps | **Yes: speech recognition that keeps "um/uh"** |
| Voice | Pause quality | Short pauses 0.3–2 s per minute, dead air > 3 s | No |
| Voice | Pitch variation | Autocorrelation pitch, SD in semitones vs the user's first 5 takes | No |
| Voice | Vocal energy | Mean dBFS, loudness spread, clipping share | No |
| Presence | Lens gaze | Face Landmarker eye-look blendshapes + head yaw | No |
| Presence | Smile and warmth | Smile blendshapes in the first 3 s and last 5 s | No |
| Presence | Framing | Face height and eye line from landmarks | No |
| Presence | Head movement | Spread of yaw and pitch from the face transform | No |
| Presence | Lighting | Face vs frame brightness from a 16×16 canvas sample once a second | No |
| Structure | Duration fit | Clip length vs the take's goal length | No |
| Structure | **Clear close** | `closeDetected` on the last 5 s of words | **Yes: transcript** |
| Structure | **Hedging words** | `hedgeStats` (informational, never scored) | **Yes: transcript** |

13 of 16 parameters work today. The three transcript parameters show "Coming soon" and are left out of the score (their weight is spread across the rest of their group) until a recogniser is wired in.

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

## Where AI would go (options, not yet chosen)

1. **In the browser (free, private):** Whisper via Transformers.js (`onnx-community/whisper-base_timestamped`) for word timestamps, plus `desert-ant-labs/uhm` (98 MB ONNX) to catch the fillers Whisper drops. Downloads are heavy for phones, so run them after recording, in a worker.
2. **On a server (most accurate):** CrisperWhisper (verbatim, keeps fillers, word timestamps) on a Hugging Face Inference Endpoint / Modal / Replicate, called from a Vercel route. **Check its licence: reported as non-commercial.** Uploading audio needs explicit consent (the spec's privacy caveat).
3. Either way, feed the words into `analyse({ v2: { …, words } })`: filler rate, clear close, hedging and exact pace/first-3-second counts switch on automatically (unit-tested in `yapscore.test.ts`).
4. Tone/emotion (emotion2vec) isn't needed: pitch variation and vocal energy already cover "flat vs lively" on-device.

## Still to decide

- Validate bands against ~100 hand-scored clips before launch (spec "Validate before launch").
- Settings are stored per device (`yap101-score-prefs`); move to the profile if they should follow the account.
- Gaze calibration step ("look at the lens for 2 seconds") isn't built; gaze uses fixed thresholds.
