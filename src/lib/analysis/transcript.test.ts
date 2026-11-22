import { describe, expect, it } from "vitest";
import { analyse } from "./score";
import { hiddenFillers, isFiller, transcriptFields, voicedOnly, withHiddenFillers, type Word } from "./transcript";

const w = (text: string, start: number, end: number): Word => ({ text, start, end });

/** 25 ms loudness frames: quiet (0.002) except where `voiced` ranges say otherwise. */
function frames(seconds: number, voiced: [number, number][], t0 = 1000) {
  const rms: number[] = [], times: number[] = [];
  for (let t = 0; t < seconds; t += 0.025) {
    rms.push(voiced.some(([a, b]) => t >= a && t < b) ? 0.1 : 0.002);
    times.push(t0 + t);
  }
  return { rms, times };
}

describe("hiddenFillers", () => {
  const words = [w("Hello", 0, 0.5), w("there", 0.6, 1.0), w("friends", 2.5, 3.0)];

  it("finds a voiced stretch in a gap between words as a heard filler", () => {
    const f = frames(4, [[0, 1.0], [1.4, 2.0], [2.5, 3.0]]);
    const found = hiddenFillers(words, f);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ text: "uh", heard: true });
    expect(found[0].start).toBeGreaterThanOrEqual(1.35);
    expect(found[0].start).toBeLessThan(1.5);
  });

  it("ignores silent gaps, short blips and gaps too small to hold one", () => {
    expect(hiddenFillers(words, frames(4, [[0, 1.0], [2.5, 3.0]]))).toEqual([]); // silence
    expect(hiddenFillers(words, frames(4, [[0, 1.0], [1.5, 1.65], [2.5, 3.0]]))).toEqual([])  ; // 0.15 s blip
    const tight = [w("one", 0, 0.5), w("two", 0.8, 1.2), w("three", 1.3, 1.8), w("four", 1.9, 2.4), w("five", 2.5, 3)];
    expect(hiddenFillers(tight, frames(4, [[0, 3]]))).toEqual([]);
  });

  it("one per filled pause, and none with too little data", () => {
    const f = frames(4, [[0, 1.0], [1.2, 2.3], [2.5, 3.0]]);
    expect(hiddenFillers(words, f)).toHaveLength(1);
    expect(hiddenFillers(words.slice(0, 1), f)).toEqual([]);
    expect(hiddenFillers(words, { rms: [0.1], times: [0] })).toEqual([]);
  });

  it("withHiddenFillers keeps time order", () => {
    const merged = withHiddenFillers(words, frames(4, [[0, 1.0], [1.4, 2.0], [2.5, 3.0]]));
    expect(merged.map((x) => x.text)).toEqual(["Hello", "there", "uh", "friends"]);
  });
});

describe("voicedOnly", () => {
  it("drops words invented over silence (Whisper's 'Thank you.' on a quiet room)", () => {
    const words = [w("Hello", 0, 0.5), w("there", 0.6, 1.0), w("Thank", 3, 3.3), w("you.", 3.3, 3.6)];
    const kept = voicedOnly(words, frames(4, [[0, 1.0]]));
    expect(kept.map((x) => x.text)).toEqual(["Hello", "there"]);
    expect(withHiddenFillers(words, frames(4, [[0, 1.0]])).map((x) => x.text)).toEqual(["Hello", "there"]);
  });
  it("keeps everything when there's too little audio to judge", () => {
    const words = [w("Hi", 0, 0.5)];
    expect(voicedOnly(words, { rms: [0.001], times: [0] })).toEqual(words);
  });
});

describe("isFiller and transcriptFields", () => {
  const words = [w("So,", 0, 0.3), w("um,", 0.4, 0.6), w("it's,", 0.7, 0.9), w("like,", 1, 1.2), w("good.", 1.3, 1.6), { ...w("uh", 1.8, 2.2), heard: true }];

  it("flags um/uh and comma-wrapped like only", () => {
    expect(words.map((_, i) => isFiller(words, i))).toEqual([false, true, false, true, false, true]);
    expect(isFiller([w("I", 0, 1), w("like", 1, 2), w("it", 2, 3)], 1)).toBe(false);
  });

  it("feedback fields: counts per word; transcript text leaves out heard fillers", () => {
    expect(transcriptFields(words)).toEqual({ filler_count: 3, filler_words: { um: 1, like: 1, uh: 1 }, transcript: "So, um, it's, like, good." });
    expect(transcriptFields(null)).toEqual({ filler_count: null, filler_words: {}, transcript: null });
    expect(transcriptFields([])).toEqual({ filler_count: null, filler_words: {}, transcript: null });
  });
});

describe("analyse with a transcript", () => {
  it("stores the transcript and uses word timestamps for pace", () => {
    const words = "Hi I'm Sam and today I want to show you one simple trick for better sleep so try it tonight and follow for more".split(" ").map((t, i) => w(t, i * 0.4, i * 0.4 + 0.3));
    const a = analyse({ audio: null, face: null, scriptDone: null, v2: { seconds: 10, targetSeconds: 30, day: 1, goal: null, words } });
    expect(a.transcript).toBe(words);
    expect(a.wpm).toBeGreaterThan(130);
    const none = analyse({ audio: null, face: null, scriptDone: null, v2: { seconds: 10, targetSeconds: 30, day: 1, goal: null } });
    expect(none.transcript).toBeNull();
  });
});
