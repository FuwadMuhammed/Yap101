// Yap score v2: 16 parameters in four groups (Hook, Voice, Presence, Structure), each scored
// against a target band, weighted by programme week and the user's goal. Implements
// "Yap Score: What Yap101 Should Measure and Show" (Nov 2026). Pure functions, no DOM, so it
// runs on the phone after a take and in tests. All bands marked "proposed" in the spec are
// starting values, meant to be tuned with real user data.

import type { Goal } from "@/lib/yap";
import type { AudioStats } from "./audio";
import type { FaceStats } from "./face";
import { closeDetected, fillerStats, hedgeStats, paceFromWords, wordsBetween, type Word } from "./transcript";

export type Group = "hook" | "voice" | "presence" | "structure";
export type ParamKey =
  | "startLatency" | "first3s" | "faceFirst"
  | "pace" | "fillers" | "pauses" | "pitch" | "energy"
  | "gaze" | "smile" | "framing" | "head" | "lighting"
  | "duration" | "close" | "hedging";
export type Band = "green" | "amber" | "red";

export type Param = {
  key: ParamKey;
  group: Group;
  label: string;
  /** Measured on this take (false: no transcript, no camera, turned off, or too little data). */
  measured: boolean;
  /** Counts towards the score (hedging never does). */
  scored: boolean;
  band: Band | null;
  points: number | null;
  /** Relative weight inside its group (goal adjustments double some). */
  weight: number;
  /** What was measured, in words ("Started talking after 1.4 s"). */
  display: string;
  /** Why it wasn't measured, when it wasn't. */
  missing?: "transcript" | "camera" | "off" | "data";
};

export type Drill = { key: string; name: string; how: string };
export type Fix = { key: ParamKey; happened: string; why: string; tip: string; drill: Drill };
export type Win = { key: ParamKey; text: string; kind: "improved" | "strength" };

export type ScorePrefs = {
  /** Appearance-sensitive mode: no face metrics shown or scored. */
  appearanceSensitive?: boolean;
  /** Eye-contact opt-out (e.g. for neurodivergent users). */
  noEyeContact?: boolean;
  /** Non-native speaker: pause metrics are scored more leniently. */
  nonNative?: boolean;
  /** Filler-word check with on-device speech recognition (default on; false turns it off). */
  transcribe?: boolean;
};

export type YapScore = {
  version: 2;
  overall: number;
  week: 1 | 2 | 3 | 4;
  weights: Record<Group, number>;
  groups: { key: Group; label: string; score: number | null; band: Band | null; weight: number }[];
  params: Param[];
  fixes: Fix[];
  win: Win | null;
  /** 1 for the first take ever, 2 for the second… */
  takeNumber: number;
  /** Voice bands used the user's own first takes (true) or population norms (false). */
  personalBaseline: boolean;
};

/** One earlier take, as much as the score needs from it (oldest first in `history`). */
export type PastTake = { yap?: YapScore | null; audio?: Pick<AudioStats, "pitchRange" | "loudnessRange"> | null };

export type ScoreInput = {
  audio: AudioStats | null;
  face: FaceStats | null;
  /** Clip length in seconds. */
  seconds: number;
  /** The length the user was aiming for (their goal, or 60 s with no limit). */
  targetSeconds: number;
  /** Programme day 1–30. */
  day: number;
  goal: Goal | null;
  prefs?: ScorePrefs;
  /** Word timestamps from speech recognition, when available (see transcript.ts). */
  words?: Word[] | null;
  history?: PastTake[];
};

// ---------------------------------------------------------------------------------------
// Bands → points. Green = 100; amber falls linearly from 100 at the green edge to 60 at the
// far edge; red = 40, or 20 beyond the extreme limits.

type Range = [number, number];
export type BandSpec = { green: Range; amber: Range; extreme?: Range; floor?: number };

export function bandOf(v: number, s: BandSpec): { band: Band; points: number } {
  const [gl, gh] = s.green;
  const [al, ah] = s.amber;
  if (v >= gl && v <= gh) return { band: "green", points: 100 };
  if (v >= al && v < gl) return { band: "amber", points: Math.round(100 - (40 * (gl - v)) / (gl - al || 1)) };
  if (v > gh && v <= ah) return { band: "amber", points: Math.round(100 - (40 * (v - gh)) / (ah - gh || 1)) };
  const extreme = s.extreme && (v < s.extreme[0] || v > s.extreme[1]);
  return { band: "red", points: Math.max(s.floor ?? 0, extreme ? 20 : 40) };
}

/** Worst of several checks (e.g. energy: level, variation, clipping). */
const worst = (...xs: { band: Band; points: number }[]) => xs.reduce((a, b) => (b.points < a.points ? b : a));

// ---------------------------------------------------------------------------------------
// Weights

export const WEEK_WEIGHTS: Record<1 | 2 | 3 | 4, Record<Group, number>> = {
  1: { hook: 15, voice: 35, presence: 40, structure: 10 },
  2: { hook: 25, voice: 25, presence: 20, structure: 30 },
  3: { hook: 15, voice: 35, presence: 20, structure: 30 },
  4: { hook: 30, voice: 25, presence: 20, structure: 25 },
};

export const programmeWeek = (day: number): 1 | 2 | 3 | 4 => (day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4);

/** The spec's onboarding goals, mapped from Yap101's goal options. */
export const goalStyle = (goal: Goal | null) => (goal === "confidence" ? "freeze" : goal === "clarity" ? "ramble" : goal === "on_camera" ? "professional" : null);

export function groupWeights(week: 1 | 2 | 3 | 4, goal: Goal | null, prefs: ScorePrefs = {}): Record<Group, number> {
  const w = { ...WEEK_WEIGHTS[week] };
  const style = goalStyle(goal);
  if (style === "freeze" && week <= 2) {
    w.presence += 10;
    w.structure = Math.max(0, w.structure - 10);
  }
  if (style === "ramble") {
    w.structure += 10;
    w.presence = Math.max(0, w.presence - 10);
  }
  if (prefs.appearanceSensitive) {
    w.voice += w.presence / 2;
    w.structure += w.presence / 2;
    w.presence = 0;
  }
  return w;
}

// ---------------------------------------------------------------------------------------
// The parameters

const LABELS: Record<ParamKey, string> = {
  startLatency: "Start speed", first3s: "First 3 seconds", faceFirst: "Face in first frame",
  pace: "Pace", fillers: "Filler words", pauses: "Pause quality", pitch: "Pitch variation", energy: "Vocal energy",
  gaze: "Lens connection", smile: "Smile and warmth", framing: "Framing", head: "Head movement", lighting: "Lighting",
  duration: "Duration fit", close: "Clear close", hedging: "Hedging words",
};
const GROUP_OF: Record<ParamKey, Group> = {
  startLatency: "hook", first3s: "hook", faceFirst: "hook",
  pace: "voice", fillers: "voice", pauses: "voice", pitch: "voice", energy: "voice",
  gaze: "presence", smile: "presence", framing: "presence", head: "presence", lighting: "presence",
  duration: "structure", close: "structure", hedging: "structure",
};
export const GROUP_LABELS: Record<Group, string> = { hook: "Hook", voice: "Voice", presence: "Presence", structure: "Structure" };
/** Face-based parameters (hidden in appearance-sensitive mode; their tips are skipped). */
export const APPEARANCE: ParamKey[] = ["faceFirst", "gaze", "smile", "framing", "head", "lighting"];

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Pitch and energy bands from the user's own first takes (≥ 3 of the first 5), else null. */
export function voiceBaseline(history: PastTake[] = []) {
  const first = history.slice(0, 5);
  const pitch = first.map((h) => h.audio?.pitchRange).filter((x): x is number => typeof x === "number");
  const spread = first.map((h) => h.audio?.loudnessRange).filter((x): x is number => typeof x === "number");
  return pitch.length >= 3 ? { pitch: median(pitch)!, spread: spread.length >= 3 ? median(spread)! : null } : null;
}

export function scoreYap(input: ScoreInput): YapScore {
  const { audio, face, words } = input;
  const prefs = input.prefs ?? {};
  const history = input.history ?? [];
  const week = programmeWeek(input.day);
  const style = goalStyle(input.goal);
  const base = voiceBaseline(history);
  const params: Param[] = [];
  const hasWords = Boolean(words && words.length);
  const sawFace = Boolean(face && face.samples >= 5 && face.inFrame >= 0.25);
  const faceOff = Boolean(prefs.appearanceSensitive);

  const add = (key: ParamKey, r: { band: Band; points: number } | null, display: string, opts: { weight?: number; scored?: boolean; missing?: Param["missing"] } = {}) =>
    params.push({
      key,
      group: GROUP_OF[key],
      label: LABELS[key],
      measured: r !== null,
      scored: r !== null && opts.scored !== false,
      band: r?.band ?? null,
      points: r?.points ?? null,
      weight: opts.weight ?? 1,
      display,
      ...(r === null ? { missing: opts.missing ?? "data" } : {}),
    });
  const voiced = Boolean(audio && audio.startDelay !== null);
  const speakingMin = audio && audio.speakingSeconds > 0 ? audio.speakingSeconds / 60 : 0;

  // ---- Hook ----
  if (voiced) add("startLatency", bandOf(audio!.startDelay!, { green: [0, 1], amber: [1, 2], extreme: [0, 4] }), `Started talking after ${audio!.startDelay!.toFixed(1)} s`, { weight: style === "freeze" ? 2 : 1 });
  else add("startLatency", null, "No speech heard");
  const w3 = hasWords ? wordsBetween(words!, 0, 3) : audio?.wordsFirst3s ?? null;
  if (w3 !== null && voiced) add("first3s", bandOf(w3, { green: [5, Infinity], amber: [2, 5], extreme: [1, Infinity] }), `${hasWords ? "" : "About "}${w3} word${w3 === 1 ? "" : "s"} in the first 3 seconds`);
  else add("first3s", null, "Not measured");
  if (faceOff) add("faceFirst", null, "Off in appearance-sensitive mode", { missing: "off" });
  else if (!face || face.samples < 5) add("faceFirst", null, "Needs the camera", { missing: "camera" });
  else if (face.firstFaceAt === null) add("faceFirst", { band: "red", points: 40 }, "Face not found in the first seconds");
  else add("faceFirst", bandOf(face.firstFaceAt, { green: [0, 0.5], amber: [0.5, 1.5] }), face.firstFaceAt <= 0.5 ? "Face visible from the first frame" : `Face appeared after ${face.firstFaceAt.toFixed(1)} s`);

  // ---- Voice ----
  const wpm = hasWords ? paceFromWords(words!) : audio?.wpm ?? null;
  const paceGreen: Range = style === "professional" ? [130, 165] : [130, 180];
  if (wpm !== null) add("pace", bandOf(wpm, { green: paceGreen, amber: [110, 200], extreme: [90, 230] }), `${hasWords ? "" : "About "}${wpm} words a minute`);
  else add("pace", null, "Not enough speech to measure");

  if (hasWords && speakingMin > 0) {
    const f = fillerStats(words!);
    const perMin = Math.round((f.count / speakingMin) * 10) / 10;
    add("fillers", bandOf(perMin, { green: [0, 5], amber: [5, 12], floor: 40 }), `${f.count} filler word${f.count === 1 ? "" : "s"} (${perMin} a minute)`);
  } else add("fillers", null, "Needs speech recognition", { missing: "transcript" });

  if (voiced && speakingMin > 0) {
    const shortPerMin = Math.round((audio!.shortPauses / speakingMin) * 10) / 10;
    const lenient = prefs.nonNative;
    const rate = bandOf(shortPerMin, lenient ? { green: [2, 14], amber: [0.5, 20] } : { green: [3, 10], amber: [1, 15] });
    const dead = audio!.deadAir;
    const air = dead === 0 ? { band: "green" as Band, points: 100 } : dead === 1 || (lenient && dead === 2) ? { band: "amber" as Band, points: 70 } : { band: "red" as Band, points: 40 };
    add("pauses", worst(rate, air), `${shortPerMin} short pauses a minute${dead ? `, ${dead} silence${dead > 1 ? "s" : ""} over 3 s` : ", no dead air"}`);
  } else add("pauses", null, "Not enough speech to measure");

  if (audio && audio.pitchRange !== null) {
    // Within-speaker band: lively relative to their own first takes; never reward "more" without limit.
    const ref = base?.pitch ?? 3;
    const green: Range = [Math.max(1.6, ref * 0.85), Math.max(5.5, ref * 1.8)];
    const r = bandOf(audio.pitchRange, { green, amber: [green[0] * 0.7, green[1] * 1.3] });
    add("pitch", r, r.band === "green" ? "Lively pitch" : audio.pitchRange < green[0] ? "Quite monotone" : "Very big pitch swings");
  } else add("pitch", null, "Not enough voice to measure");

  if (audio && audio.meanDb !== null && audio.loudnessRange !== null) {
    const ref = base?.spread ?? 5;
    const level = bandOf(audio.meanDb, { green: [-30, -10], amber: [-38, -6] });
    const spread = bandOf(audio.loudnessRange, { green: [Math.max(2.5, ref * 0.75), Math.max(9, ref * 1.8)], amber: [Math.max(1.5, ref * 0.5), Math.max(12, ref * 2.4)] });
    const clip = bandOf(audio.clipping * 100, { green: [0, 1], amber: [1, 3] });
    const r = worst(level, spread, clip);
    const why = r === clip && clip.band !== "green" ? "Clipping: too loud for the mic" : r === level && level.band !== "green" ? (audio.meanDb < -30 ? "Too quiet" : "Very loud") : r === spread && spread.band !== "green" ? "Flat: little loudness variation" : "Steady, audible, with variation";
    add("energy", r, why);
  } else add("energy", null, "Not enough voice to measure");

  // ---- Presence ----
  const presence = (key: ParamKey, fn: () => [{ band: Band; points: number }, string]) => {
    if (faceOff) return add(key, null, "Off in appearance-sensitive mode", { missing: "off" });
    if (!face || face.samples < 5) return add(key, null, "Needs the camera", { missing: "camera" });
    if (!sawFace) return add(key, null, "We couldn't see your face", { missing: "data" });
    const [r, display] = fn();
    add(key, r, display);
  };
  if (prefs.noEyeContact) add("gaze", null, "Turned off in settings", { missing: "off" });
  else
    presence("gaze", () => [bandOf(face!.eyeContact * 100, { green: [60, 100], amber: [40, 60] }), `Looked into the lens ${Math.round(face!.eyeContact * 100)}% of the time${face!.calibrated ? " (measured against your own look at the lens)" : ""}`]);
  presence("smile", () => {
    const open = face!.smiledAtStart, close = face!.smileClose;
    return [open && close ? { band: "green", points: 100 } : open || close ? { band: "amber", points: 70 } : { band: "red", points: 40 }, open && close ? "Smiled at the open and the close" : open ? "Smiled at the open, not the close" : close ? "Smiled at the close, not the open" : "No smile at the open or close"];
  });
  presence("framing", () => {
    if (face!.faceHeight === null || face!.eyeLine === null) return [{ band: "amber", points: 70 }, "Framing not clear"];
    const size = bandOf(face!.faceHeight * 100, { green: [25, 45], amber: [15, 60] });
    const eyes = bandOf(face!.eyeLine * 100, { green: [30, 40], amber: [20, 52] });
    const r = worst(size, eyes);
    return [r, r.band === "green" ? "Face centred, eyes in the upper third" : size.points <= eyes.points ? (face!.faceHeight < 0.25 ? "Too far from the camera" : "Too close to the camera") : face!.eyeLine < 0.3 ? "Eyes too near the top of the frame" : "Eyes too low in the frame"];
  });
  presence("head", () => {
    if (face!.headMovement === null) return [{ band: "amber", points: 70 }, "Head movement not clear"];
    const r = bandOf(face!.headMovement, { green: [1.5, 6], amber: [0.8, 10] });
    return [r, r.band === "green" ? "Natural head movement" : face!.headMovement < 1.5 ? "Head quite still (frozen)" : "A lot of head movement"];
  });
  presence("lighting", () => {
    if (face!.faceLuma === null) return [{ band: "amber", points: 70 }, "Lighting not measured"];
    const level = bandOf(face!.faceLuma, { green: [90, 200], amber: [60, 230] });
    const back = face!.backlight === null ? level : bandOf(face!.backlight, { green: [0.7, Infinity], amber: [0.5, 0.7] });
    const r = worst(level, back);
    return [r, r.band === "green" ? "Face clearly lit" : r === back ? "Backlit: the light is behind you" : face!.faceLuma < 90 ? "Face underexposed" : "Face overexposed"];
  });

  // ---- Structure ----
  const T = input.targetSeconds;
  const dur = bandOf(input.seconds, { green: [T * 0.83, T * 1.08], amber: [T * 0.67, T * 1.25] });
  add("duration", input.seconds >= 1 ? dur : null, `${Math.round(input.seconds)} s (aiming for ${T} s)`, { weight: style === "ramble" ? 2 : 1 });
  if (hasWords) {
    const c = closeDetected(words!, input.seconds);
    add("close", c ? { band: "green", points: 100 } : { band: "red", points: 40 }, c ? `Clear close: "${c}"` : "No takeaway or sign-off at the end", { weight: style === "ramble" ? 2 : 1 });
    const h = hedgeStats(words!);
    const perMin = speakingMin ? Math.round((h.count / speakingMin) * 10) / 10 : 0;
    add("hedging", bandOf(perMin, { green: [0, 4], amber: [4, 8] }), `${h.count} hedge${h.count === 1 ? "" : "s"} (${perMin} a minute)`, { scored: false });
  } else {
    add("close", null, "Needs speech recognition", { missing: "transcript" });
    add("hedging", null, "Needs speech recognition", { missing: "transcript" });
  }

  // ---- Groups: weighted mean, but one parameter can pull its group down by 25 points at most.
  const weights = groupWeights(week, input.goal, prefs);
  const groups = (Object.keys(GROUP_LABELS) as Group[]).map((g) => {
    const ps = params.filter((p) => p.group === g && p.scored && p.points !== null);
    const W = ps.reduce((t, p) => t + p.weight, 0);
    const score = ps.length ? Math.round(100 - ps.reduce((t, p) => t + Math.min(25, ((100 - p.points!) * p.weight) / W), 0)) : null;
    return { key: g, label: GROUP_LABELS[g], score, band: score === null ? null : score >= 85 ? ("green" as Band) : score >= 60 ? ("amber" as Band) : ("red" as Band), weight: weights[g] };
  });
  const live = groups.filter((g) => g.score !== null && g.weight > 0);
  const W = live.reduce((t, g) => t + g.weight, 0);
  // If only zero-weight groups could be measured (e.g. Structure in a "freeze" week 1), use their
  // plain average rather than showing 0 for a take we did measure.
  const scored = groups.filter((g) => g.score !== null);
  const overall = W ? Math.round(live.reduce((t, g) => t + g.score! * g.weight, 0) / W) : scored.length ? Math.round(scored.reduce((t, g) => t + g.score!, 0) / scored.length) : 0;

  return {
    version: 2,
    overall,
    week,
    weights,
    groups,
    params,
    fixes: pickFixes(params, weights, history, prefs, { audio, face, wpm, style, seconds: input.seconds, target: T }),
    win: pickWin(params, history),
    takeNumber: history.length + 1,
    personalBaseline: Boolean(base),
  };
}

// ---------------------------------------------------------------------------------------
// Tips: which two fixes to show, and the one win.

export const DRILLS: Record<string, Drill> = {
  countdown: { key: "countdown", name: "Countdown start", how: "Count 3-2-1 in your head, then say your first line on 'go'. No warm-up words." },
  slow: { key: "slow", name: "Slow-down drill", how: "Read your script at 80% speed. Breathe at every full stop." },
  pace: { key: "pace", name: "Chat-speed drill", how: "Tell it like you'd tell a friend over coffee: a little quicker, a little looser." },
  pause: { key: "pause", name: "Pause-instead-of-um", how: "Every time you feel an 'um' coming, close your mouth and pause for half a second." },
  threeWord: { key: "threeWord", name: "Three-word yap", how: "Write three bullet words. Talk through them in order, nothing else." },
  emphasis: { key: "emphasis", name: "Emphasis drill", how: "Pick one word in each sentence and push it: a little louder and slower." },
  energy: { key: "energy", name: "Energy-up take", how: "Stand up and speak to someone across the room, not next to you." },
  friend: { key: "friend", name: "Hey [name] yap", how: "Stick a note with a friend's name next to the lens. Talk to them." },
  bookend: { key: "bookend", name: "Bookend smile", how: "Smile on your first line and your last line only." },
  fortyFive: { key: "fortyFive", name: "45-second challenge", how: "Make one point in 45 seconds. Cut everything else." },
  close: { key: "close", name: "Close-only drill", how: "Record just your last 10 seconds: one takeaway, then your sign-off." },
  hookSprint: { key: "hookSprint", name: "Hook sprint", how: "Say your most surprising line in the first 3 seconds, then stop. Do it 3 times." },
  frame: { key: "frame", name: "Frame check", how: "Prop the phone at eye level, an arm's length away. Eyes a third of the way down." },
  light: { key: "light", name: "Face the light", how: "Turn to face a window or lamp. Nothing bright behind you." },
  still: { key: "still", name: "Anchor drill", how: "Plant your feet and keep your head mostly still; let your hands do the moving." },
  loosen: { key: "loosen", name: "Nod-along take", how: "Nod or tilt your head on your key points, the way you would in a chat." },
  extend: { key: "extend", name: "One-more-point take", how: "Add one example to your point so you fill the time." },
};

type Ctx = { audio: AudioStats | null; face: FaceStats | null; wpm: number | null; style: ReturnType<typeof goalStyle>; seconds: number; target: number };

function fixFor(p: Param, c: Ctx): Omit<Fix, "key"> | null {
  const a = c.audio, f = c.face;
  switch (p.key) {
    case "startLatency": return { happened: `You started speaking at ${a?.startDelay?.toFixed(1)} s.`, why: "Viewers decide in the first 1–3 seconds whether to keep watching.", tip: "Start talking before you feel ready. Your first word is your hook.", drill: DRILLS.countdown };
    case "first3s": return { happened: "Your first 3 seconds had only a few words.", why: "A real line in the first 3 seconds keeps people watching.", tip: "Open with your most interesting line, not a greeting.", drill: DRILLS.hookSprint };
    case "faceFirst": return { happened: "Your face wasn't in frame right away.", why: "Clips with a person on screen from the start hold viewers longer.", tip: "Be in frame and looking at the lens before you hit record.", drill: DRILLS.frame };
    case "pace": return (c.wpm ?? 150) > 180
      ? { happened: `You spoke at about ${c.wpm} words a minute.`, why: "Rushing usually means nerves, and it's harder to follow.", tip: "You're rushing. Breathe at each full stop.", drill: DRILLS.slow }
      : { happened: `You spoke at about ${c.wpm} words a minute.`, why: "Very slow speech can sound unsure and loses energy.", tip: "Pick it up a little, like chatting with a friend.", drill: DRILLS.pace };
    case "fillers": return { happened: p.display + ".", why: "About 12 fillers a minute hurts how credible you sound; 5 is fine.", tip: "Swap 'um' for a silent half-second pause.", drill: DRILLS.pause };
    case "pauses": return (a?.deadAir ?? 0) > 0
      ? { happened: `You had ${a!.deadAir} silence${a!.deadAir > 1 ? "s" : ""} longer than 3 seconds.`, why: "Long gaps lose people; short pauses help them follow.", tip: "You lost the thread. Use three bullet words.", drill: DRILLS.threeWord }
      : { happened: "You hardly paused between sentences.", why: "Short pauses at sentence ends make each point land.", tip: "Take a half-second beat at each full stop.", drill: DRILLS.pause };
    case "pitch": return p.display === "Very big pitch swings"
      ? { happened: "Your pitch swung a lot.", why: "Past a point, more variation stops sounding natural.", tip: "Save your big emphasis for one word per sentence.", drill: DRILLS.emphasis }
      : { happened: "Your voice stayed on quite a flat note.", why: "Pitch variation is linked to sounding engaging and confident.", tip: "Push one word per sentence.", drill: DRILLS.emphasis };
    case "energy": return { happened: p.display + ".", why: "Steady, audible volume with some variation sounds confident.", tip: p.display.startsWith("Clipping") || p.display === "Very loud" ? "Ease off a little or move the phone back: the mic was overloaded." : "Speak to someone across the room, not next to you.", drill: DRILLS.energy };
    case "gaze": return { happened: `You looked into the lens ${Math.round((f?.eyeContact ?? 0) * 100)}% of the time.`, why: "Looking at the camera reads as talking to the viewer.", tip: "Put a sticky note with a friend's name next to the lens.", drill: DRILLS.friend };
    case "smile": return { happened: p.display + ".", why: "A genuine smile at the start and end makes you more likeable. Constant smiling isn't the goal.", tip: "Smile on your first and last line only.", drill: DRILLS.bookend };
    case "framing": return { happened: p.display + ".", why: "Viewers look at your face first; good framing makes it easy.", tip: "Phone at eye level, an arm's length away, eyes a third of the way down.", drill: DRILLS.frame };
    case "head": return (f?.headMovement ?? 3) < 1.5
      ? { happened: "Your head stayed very still.", why: "Natural movement reads as relaxed and authentic.", tip: "Let yourself nod on your key points.", drill: DRILLS.loosen }
      : { happened: "Your head moved around a lot.", why: "Too much movement is distracting and can look nervous.", tip: "Plant your feet; let your hands do the moving.", drill: DRILLS.still };
    case "lighting": return { happened: p.display + ".", why: "Viewers need to see your face, and dim light also makes eye tracking less accurate.", tip: "Face a window or lamp, with nothing bright behind you.", drill: DRILLS.light };
    case "duration": return c.seconds > c.target
      ? { happened: `Your yap ran ${Math.round(c.seconds)} seconds (aiming for ${c.target}).`, why: "Short-form viewers drop off when a clip runs long.", tip: "Cut to one point.", drill: DRILLS.fortyFive }
      : { happened: `Your yap ran ${Math.round(c.seconds)} seconds (aiming for ${c.target}).`, why: "Too short to make and land a point.", tip: "Add one example to fill the time.", drill: DRILLS.extend };
    case "close": return { happened: "Your yap stopped without a takeaway or sign-off.", why: "A clear close is what makes a clip feel finished and postable.", tip: "Land it: one takeaway, then your sign-off.", drill: DRILLS.close };
    case "hedging": return c.style === "professional" ? { happened: p.display + ".", why: "Too many hedges ('kind of', 'maybe') can sound unsure in a professional setting.", tip: "Say your point plainly; save 'maybe' for real uncertainty.", drill: DRILLS.emphasis } : null;
  }
}

/** Rank by gap × week weight, skip tips shown in the last 2 takes and appearance tips if opted out; top 2. */
export function pickFixes(params: Param[], weights: Record<Group, number>, history: PastTake[], prefs: ScorePrefs, ctx: Ctx): Fix[] {
  const recent = new Set(history.slice(-2).flatMap((h) => h.yap?.fixes.map((f) => f.key) ?? []));
  const candidates = params
    .filter((p) => p.measured && p.points !== null && p.points < 100)
    .filter((p) => p.scored || (p.key === "hedging" && ctx.style === "professional" && p.band !== "green"))
    .filter((p) => !(prefs.appearanceSensitive && APPEARANCE.includes(p.key)))
    .map((p) => ({ p, rank: ((100 - (p.points ?? 100)) / 100) * (weights[p.group] || 1) * p.weight }))
    .sort((a, b) => b.rank - a.rank);
  const fixes: Fix[] = [];
  for (const { p } of candidates) {
    if (fixes.length >= 2) break;
    if (recent.has(p.key)) continue;
    const f = fixFor(p, ctx);
    if (f) fixes.push({ key: p.key, ...f });
  }
  return fixes;
}

/** The parameter that improved most against the user's own first take; else their strongest. */
export function pickWin(params: Param[], history: PastTake[]): Win | null {
  const first = history.find((h) => h.yap)?.yap;
  if (first) {
    const before = new Map(first.params.map((p) => [p.key, p.points]));
    const best = params
      .filter((p) => p.scored && p.points !== null && typeof before.get(p.key) === "number")
      .map((p) => ({ p, gain: p.points! - (before.get(p.key) as number) }))
      .sort((a, b) => b.gain - a.gain)[0];
    if (best && best.gain > 0) return { key: best.p.key, kind: "improved", text: `${best.p.label} is up ${best.gain} points since your first yap. ${best.p.display}.` };
  }
  const strong = params.filter((p) => p.scored && p.band === "green");
  const order: ParamKey[] = ["startLatency", "pace", "gaze", "pauses", "energy", "smile", "pitch", "duration", "first3s", "framing", "lighting", "head", "faceFirst", "fillers", "close"];
  const pick = order.map((k) => strong.find((p) => p.key === k)).find(Boolean);
  return pick ? { key: pick.key, kind: "strength", text: `${pick.label}: ${pick.display}.` } : null;
}
