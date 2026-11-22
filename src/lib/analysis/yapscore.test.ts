import { describe, expect, it } from "vitest";
import type { AudioStats } from "./audio";
import type { FaceStats } from "./face";
import { closeDetected, fillerStats, hedgeStats, paceFromWords, wordsBetween, type Word } from "./transcript";
import { bandOf, groupWeights, pickFixes, programmeWeek, scoreYap, voiceBaseline, WEEK_WEIGHTS, type PastTake } from "./yapscore";

const audio = (over: Partial<AudioStats> = {}): AudioStats => ({
  seconds: 55, startDelay: 0.6, talkRatio: 0.85, pauses: 6, longPauses: 0, longestPause: 1.2, wpm: 150, pitchRange: 3, loudnessRange: 5,
  speakingSeconds: 50, shortPauses: 6, deadAir: 0, wordsFirst3s: 7, meanDb: -22, clipping: 0, timeline: [], ...over,
});
const face = (over: Partial<FaceStats> = {}): FaceStats => ({
  inFrame: 1, eyeContact: 0.75, smiling: 0.3, smiledAtStart: true, samples: 250, firstFaceAt: 0.2, smileClose: true,
  faceHeight: 0.35, eyeLine: 0.35, headMovement: 3, faceLuma: 140, backlight: 1, ...over,
});
const base = { seconds: 55, targetSeconds: 60, day: 3, goal: null };
const param = (r: ReturnType<typeof scoreYap>, k: string) => r.params.find((p) => p.key === k)!;

describe("bands → points (spec: green 100, amber 100→60, red 40, extreme 20)", () => {
  const spec = { green: [130, 180] as [number, number], amber: [110, 200] as [number, number], extreme: [90, 230] as [number, number] };
  it("scores each band", () => {
    expect(bandOf(150, spec)).toEqual({ band: "green", points: 100 });
    expect(bandOf(120, spec)).toEqual({ band: "amber", points: 80 });
    expect(bandOf(110, spec)).toEqual({ band: "amber", points: 60 });
    expect(bandOf(190, spec)).toEqual({ band: "amber", points: 80 });
    expect(bandOf(100, spec)).toEqual({ band: "red", points: 40 });
    expect(bandOf(80, spec)).toEqual({ band: "red", points: 20 });
  });
  it("fillers never score below 40", () => {
    expect(bandOf(40, { green: [0, 5], amber: [5, 12], floor: 40 }).points).toBe(40);
  });
});

describe("weights", () => {
  it("follow the programme week table", () => {
    expect(programmeWeek(1)).toBe(1);
    expect(programmeWeek(14)).toBe(2);
    expect(programmeWeek(21)).toBe(3);
    expect(programmeWeek(30)).toBe(4);
    expect(groupWeights(1, null)).toEqual(WEEK_WEIGHTS[1]);
  });
  it("goal adjustments: freeze (weeks 1–2), ramble, appearance-sensitive", () => {
    expect(groupWeights(1, "confidence")).toEqual({ hook: 15, voice: 35, presence: 50, structure: 0 });
    expect(groupWeights(3, "confidence")).toEqual(WEEK_WEIGHTS[3]);
    expect(groupWeights(2, "clarity")).toEqual({ hook: 25, voice: 25, presence: 10, structure: 40 });
    expect(groupWeights(1, null, { appearanceSensitive: true })).toEqual({ hook: 15, voice: 55, presence: 0, structure: 30 });
  });
});

describe("scoreYap", () => {
  it("a strong take scores high, all groups present, transcript items marked as needing speech recognition", () => {
    const r = scoreYap({ ...base, audio: audio(), face: face() });
    expect(r.overall).toBeGreaterThanOrEqual(90);
    expect(r.groups.every((g) => g.score !== null)).toBe(true);
    for (const k of ["fillers", "close", "hedging"]) expect(param(r, k)).toMatchObject({ measured: false, missing: "transcript" });
    expect(r.params).toHaveLength(16);
  });

  it("start latency > 2 s is red, and leads the fixes for a 'freeze' user", () => {
    const r = scoreYap({ ...base, goal: "confidence", audio: audio({ startDelay: 2.4 }), face: face() });
    expect(param(r, "startLatency")).toMatchObject({ band: "red", points: 40, weight: 2 });
    expect(r.fixes[0]).toMatchObject({ key: "startLatency", tip: "Start talking before you feel ready. Your first word is your hook." });
    expect(r.fixes[0].happened).toBe("You started speaking at 2.4 s.");
  });

  it("one bad parameter can pull its group down by 25 points at most", () => {
    const r = scoreYap({ ...base, audio: audio(), face: null, seconds: 5 }); // duration far off: the only scored Structure item
    expect(param(r, "duration").points).toBe(40);
    expect(r.groups.find((g) => g.key === "structure")!.score).toBe(75);
  });

  it("no camera: presence left out, weights renormalised; appearance-sensitive hides face metrics and tips", () => {
    const noCam = scoreYap({ ...base, audio: audio(), face: null });
    expect(noCam.groups.find((g) => g.key === "presence")!.score).toBeNull();
    const sens = scoreYap({ ...base, audio: audio(), face: face({ eyeContact: 0.1 }), prefs: { appearanceSensitive: true } });
    expect(param(sens, "gaze")).toMatchObject({ measured: false, missing: "off" });
    expect(sens.fixes.some((f) => f.key === "gaze")).toBe(false);
  });

  it("eye-contact opt-out removes gaze only", () => {
    const r = scoreYap({ ...base, audio: audio(), face: face({ eyeContact: 0.1 }), prefs: { noEyeContact: true } });
    expect(param(r, "gaze").measured).toBe(false);
    expect(param(r, "smile").measured).toBe(true);
  });

  it("professional goal narrows the pace band to 130–165", () => {
    expect(param(scoreYap({ ...base, audio: audio({ wpm: 175 }), face: face() }), "pace").band).toBe("green");
    expect(param(scoreYap({ ...base, goal: "on_camera", audio: audio({ wpm: 175 }), face: face() }), "pace").band).toBe("amber");
  });

  it("dead air over 3 s caps pause quality; smiles only count at the open and close", () => {
    const r = scoreYap({ ...base, audio: audio({ deadAir: 2 }), face: face({ smiledAtStart: false, smileClose: false, smiling: 0.9 }) });
    expect(param(r, "pauses").band).toBe("red");
    expect(param(r, "smile")).toMatchObject({ band: "red", display: "No smile at the open or close" });
  });

  it("lighting: backlit and underexposed faces are flagged", () => {
    expect(param(scoreYap({ ...base, audio: audio(), face: face({ backlight: 0.4 }) }), "lighting").display).toBe("Backlit: the light is behind you");
    expect(param(scoreYap({ ...base, audio: audio(), face: face({ faceLuma: 50 }) }), "lighting").band).toBe("red");
  });

  it("with a transcript: fillers, close and hedging are measured; hedging never counts", () => {
    const words: Word[] = "Stop doing push ups wrong um here is the fix uh keep your elbows in kind of tight and follow for more".split(" ").map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.3 }));
    const r = scoreYap({ ...base, seconds: 10, targetSeconds: 15, audio: audio({ speakingSeconds: 9 }), face: face(), words });
    expect(param(r, "fillers").measured).toBe(true);
    expect(param(r, "close")).toMatchObject({ band: "green", display: 'Clear close: "follow"' });
    expect(param(r, "hedging")).toMatchObject({ measured: true, scored: false });
  });

  it("personal baselines: pitch band follows the user's own first takes", () => {
    const history: PastTake[] = [1.2, 1.3, 1.1].map((p) => ({ audio: audio({ pitchRange: p }) }));
    expect(voiceBaseline(history)).toMatchObject({ pitch: 1.2 });
    const quietVoice = scoreYap({ ...base, audio: audio({ pitchRange: 1.7 }), face: face(), history });
    expect(param(quietVoice, "pitch").band).toBe("green"); // lively for them
    expect(quietVoice.personalBaseline).toBe(true);
    expect(param(scoreYap({ ...base, audio: audio({ pitchRange: 1.7 }), face: face() }), "pitch").band).not.toBe("green");
  });

  it("tips don't nag: a fix shown in either of the last 2 takes is skipped", () => {
    const first = scoreYap({ ...base, audio: audio({ startDelay: 3, wpm: 230 }), face: face() });
    const keys = first.fixes.map((f) => f.key);
    const next = scoreYap({ ...base, audio: audio({ startDelay: 3, wpm: 230 }), face: face(), history: [{ yap: first }] });
    expect(next.fixes.some((f) => keys.includes(f.key))).toBe(false);
  });

  it("the win is the biggest gain since the first take, else a strength", () => {
    const day1 = scoreYap({ ...base, audio: audio({ startDelay: 3 }), face: face() });
    const now = scoreYap({ ...base, audio: audio(), face: face(), history: [{ yap: day1 }] });
    expect(now.win).toMatchObject({ key: "startLatency", kind: "improved" });
    expect(scoreYap({ ...base, audio: audio(), face: face() }).win?.kind).toBe("strength");
    expect(now.takeNumber).toBe(2);
  });

  it("fixes are ranked by gap × group weight", () => {
    const r = scoreYap({ ...base, day: 1, audio: audio({ wpm: 205 }), face: face({ eyeContact: 0.3 }) });
    // Week 1: Presence weighs 40, Voice 35; gaze is red (40 pts), pace amber.
    expect(r.fixes[0].key).toBe("gaze");
    expect(pickFixes(r.params, r.weights, [], {}, { audio: null, face: null, wpm: 205, style: null, seconds: 55, target: 60 })[0].key).toBe("gaze");
  });
});

describe("edge cases", () => {
  it("only a zero-weight group measured: plain average, not 0", () => {
    // Freeze goal, week 1: Structure weighs 0. No speech, no camera: only duration is measurable.
    const r = scoreYap({ ...base, day: 1, goal: "confidence", audio: null, face: null });
    expect(r.weights.structure).toBe(0);
    expect(r.overall).toBe(r.groups.find((g) => g.key === "structure")!.score);
    expect(r.overall).toBeGreaterThan(0);
  });
});

describe("transcript helpers", () => {
  const w = (s: string, step = 0.4): Word[] => s.split(" ").map((t, i) => ({ text: t, start: i * step, end: i * step + 0.3 }));
  it("counts fillers, including phrases and comma-marked 'like'", () => {
    expect(fillerStats(w("so um I think, like, you know it's uh fine"))).toEqual({ count: 4, byWord: { um: 1, uh: 1, like: 1, "you know": 1 } });
    expect(fillerStats(w("I like running")).count).toBe(0);
  });
  it("hedges, words in a window, pace, close", () => {
    expect(hedgeStats(w("it is kind of maybe sort of good")).count).toBe(3);
    expect(wordsBetween(w("um hello there my friend how are you"), 0, 3)).toBe(7);
    expect(paceFromWords(w("one two three four five six seven eight nine ten", 0.4))).toBe(154); // 10 words over 3.9 s of speech
    expect(closeDetected(w("that is the tip so try it today"), 3)).toBe("try");
    expect(closeDetected(w("and that is all I had to say"), 3)).toBeNull();
  });
});
