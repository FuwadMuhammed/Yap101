import { describe, expect, it } from "vitest";
import { summarise } from "./audio";
import { analyse } from "./score";

/** Synthetic take: 25 ms frames. Speech = syllable bumps at ~4 per second. */
function take(segments: [kind: "silence" | "speech" | "clip", seconds: number][]) {
  const rms: number[] = [], times: number[] = [], peaks: number[] = [], pitch: (number | null)[] = [];
  let t = 0, i = 0;
  for (const [kind, secs] of segments)
    for (let k = 0; k < secs / 0.025; k++, i++, t += 0.025) {
      const bump = 0.5 + 0.5 * Math.sin((k / 10) * 2 * Math.PI); // 4 bumps a second
      const r = kind === "silence" ? 0.001 : 0.02 + 0.06 * bump;
      rms.push(r);
      times.push(t);
      peaks.push(kind === "clip" ? 1 : r * 1.4);
      pitch.push(kind === "silence" || i % 4 ? null : 120 + 40 * Math.sin(k / 7));
    }
  return summarise(rms, pitch, times, peaks);
}

describe("audio summarise: v2 measurements", () => {
  const a = take([["silence", 1], ["speech", 6], ["silence", 0.5], ["speech", 6], ["silence", 3.5], ["speech", 6], ["clip", 1], ["silence", 1]]);
  it("start delay, short pauses and dead air", () => {
    expect(a.startDelay).toBeCloseTo(1, 1);
    expect(a.deadAir).toBe(1);
    expect(a.shortPauses).toBeGreaterThanOrEqual(1);
  });
  it("words in the first 3 seconds (2 s of speech ≈ 8 syllables ≈ 5–6 words)", () => {
    expect(a.wordsFirst3s).toBeGreaterThanOrEqual(4);
    expect(a.wordsFirst3s).toBeLessThanOrEqual(7);
  });
  it("loudness level, clipping share and a 0.5 s timeline", () => {
    expect(a.meanDb).toBeGreaterThan(-35);
    expect(a.meanDb).toBeLessThan(-15);
    expect(a.clipping).toBeGreaterThan(0.03);
    expect(a.timeline.length).toBeGreaterThan(40);
    expect(a.timeline[0]).toEqual({ t: 0, st: null, db: null }); // silent first half-second
  });
  it("a silent take measures nothing and doesn't crash", () => {
    const s = take([["silence", 5]]);
    expect(s).toMatchObject({ startDelay: null, wordsFirst3s: 0, meanDb: null, deadAir: 0, timeline: [] });
  });
});

describe("analyse with v2", () => {
  it("returns version 2 with the Yap score, and tips from its fixes", () => {
    const audio = take([["silence", 2.5], ["speech", 20]]);
    const r = analyse({ audio, face: null, scriptDone: null, v2: { seconds: 22.5, targetSeconds: 30, day: 2, goal: "confidence" } });
    expect(r.version).toBe(2);
    expect(r.yap?.params).toHaveLength(16);
    expect(r.overall).toBe(r.yap?.overall);
    expect(r.tips[0]).toMatch(/Drill: /);
  });
  it("without v2 input it stays version 1 (older callers)", () => {
    expect(analyse({ audio: take([["speech", 10]]), face: null, scriptDone: null }).version).toBe(1);
  });
});
