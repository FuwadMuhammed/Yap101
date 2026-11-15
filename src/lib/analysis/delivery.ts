// Delivery check for script reads: did they pause at the pause marks, and push on the
// underlined words? Uses when each word came up on the teleprompter (voice-paced or voice
// follow) and the loudness of the take. On-device; timings are approximate, so the windows
// are generous and only clear hits count.

import type { Word } from "@/lib/prompter";
import type { AudioFrames } from "./audio";

export type DeliveryStats = {
  pausesHit: number;
  pausesTotal: number;
  emphasisHit: number;
  emphasisTotal: number;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

/**
 * `times[i]` is when word i became the current word (seconds, same clock as the frames).
 * Returns null when too little of the script was tracked to judge.
 */
export function checkDelivery(words: Word[], times: number[], frames: AudioFrames): DeliveryStats | null {
  const { rms, times: ft } = frames;
  if (rms.length < 40 || words.length < 4) return null;
  const tracked = times.filter((t) => t !== undefined).length;
  if (tracked < words.length * 0.5) return null;

  const thresh = Math.max(pct(rms, 10) * 3, pct(rms, 90) * 0.22, 0.004);
  const voiced = rms.map((r) => r > thresh);
  const framesIn = (a: number, b: number) => {
    const out: number[] = [];
    for (let i = 0; i < ft.length; i++) if (ft[i] >= a && ft[i] <= b) out.push(i);
    return out;
  };
  const end = (i: number) => times[i + 1] ?? (times[i] !== undefined ? times[i] + 0.6 : undefined);

  // Pauses: a silence of 0.2 s (comma) or 0.35 s (full stop) close to where the next word comes up.
  // Voice-paced moves on right after the last beat (the pause follows); voice follow lags (it precedes).
  let pausesHit = 0;
  let pausesTotal = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i];
    const t = times[i + 1];
    if (w.pause === "none" || t === undefined) continue;
    pausesTotal++;
    const need = w.pause === "long" ? 0.35 : 0.2;
    let run = 0;
    let best = 0;
    const idx = framesIn(t - 1.2, t + 1.2);
    for (let k = 0; k < idx.length; k++) {
      const j = idx[k];
      if (!voiced[j]) {
        run += k > 0 ? ft[j] - ft[idx[k - 1]] : 0.025;
        best = Math.max(best, run);
      } else run = 0;
    }
    if (best >= need) pausesHit++;
  }

  // Emphasis: the loudest moment around an underlined word, against the same for plain words.
  const peakDb = (i: number) => {
    const a = times[i];
    const b = end(i);
    if (a === undefined || b === undefined) return null;
    const idx = framesIn(a - 0.3, b + 0.3).filter((j) => voiced[j]);
    if (!idx.length) return null;
    return 20 * Math.log10(Math.max(...idx.map((j) => rms[j])));
  };
  const plain: number[] = [];
  const pushed: number[] = [];
  words.forEach((w, i) => {
    if (i === 0) return; // word 0 has no reliable start time
    const p = peakDb(i);
    if (p === null) return;
    (w.emphasis ? pushed : plain).push(p);
  });
  const base = median(plain);
  const emphasisHit = plain.length >= 4 ? pushed.filter((p) => p >= base + 2).length : 0;
  const emphasisTotal = plain.length >= 4 ? pushed.length : 0;

  if (pausesTotal + emphasisTotal < 2) return null;
  return { pausesHit, pausesTotal, emphasisHit, emphasisTotal };
}
