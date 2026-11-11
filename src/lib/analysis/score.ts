import type { AudioStats } from "./audio";
import type { FaceStats } from "./face";

// Turns the raw measurements into a Yap score (0-100), sub-scores and three tips.
// Rule-based and transparent: every number on the report says what it was based on.

export type PartKey = "hook" | "pace" | "flow" | "energy" | "eyes" | "smile" | "script";
export type Part = { key: PartKey; label: string; score: number; value: string; focus: boolean };
export type Analysis = {
  version: 1;
  overall: number;
  verdict: string;
  parts: Part[];
  tips: string[];
  wpm: number | null;
  audio: AudioStats | null;
  face: FaceStats | null;
  /** Share of the script said, when Follow my voice ran (0-1). */
  scriptDone: number | null;
};

const clamp = (n: number, lo = 25, hi = 100) => Math.round(Math.max(lo, Math.min(hi, n)));

/** Which part the day's skill is about, so it counts double and leads the tips. */
export function skillPart(skill: string | undefined): PartKey | null {
  const s = (skill ?? "").toLowerCase();
  if (/smile/.test(s)) return "smile";
  if (/eye|lens|look/.test(s)) return "eyes";
  if (/hook|open|first|grab/.test(s)) return "hook";
  if (/pause|um\b|filler|breath/.test(s)) return "flow";
  if (/slow|pace|speed|fast|rush/.test(s)) return "pace";
  if (/energy|voice|tone|emphas|punch|vary|excite/.test(s)) return "energy";
  return null;
}

const TIPS: Record<PartKey, (p: Part, a: { audio: AudioStats | null; face: FaceStats | null }) => string> = {
  hook: () => "Start talking the moment you hit record. Have your first line ready before the countdown ends.",
  pace: (_, { audio }) =>
    (audio?.wpm ?? 150) > 165
      ? "You're going fast. Take a breath at each comma and let the key words land."
      : "Pick up the pace a little. Aim for a natural chat speed, around 140 words a minute.",
  flow: (_, { audio }) =>
    audio && audio.longestPause >= 2
      ? `Your longest pause was ${audio.longestPause} s. Glance at the next point before you finish the current one.`
      : "Keep the flow going. Short pauses are great; long gaps lose people.",
  energy: () => "Your voice stayed quite flat. Lift your tone on the key word in each sentence, as if telling a friend something exciting.",
  eyes: (_, { face }) =>
    face && face.inFrame < 0.7
      ? "You drifted out of frame. Prop your phone at eye level and keep your face in the middle."
      : "Look into the lens, not at yourself on the screen. Pretend your friend lives in the camera.",
  smile: () => "Smile right before you start. It warms up your face and your voice.",
  script: (p) => `You covered ${p.value.match(/\d+%/)?.[0] ?? "part"} of your script. Read a line ahead so the next words are ready.`,
};

const PRAISE: Record<PartKey, string> = {
  hook: "Great start: you got straight into it.",
  pace: "Your pace was spot on, easy to follow.",
  flow: "Lovely flow, no awkward gaps.",
  energy: "Your voice had real energy and variety.",
  eyes: "Strong eye contact. It felt like you were talking to me.",
  smile: "That smile came through. Warm and confident.",
  script: "You nailed your script.",
};

export function analyse(input: { audio: AudioStats | null; face: FaceStats | null; scriptDone: number | null; skill?: string }): Analysis {
  const { audio, face, scriptDone } = input;
  const focus = skillPart(input.skill);
  const parts: Part[] = [];
  const add = (key: PartKey, label: string, score: number, value: string) => parts.push({ key, label, score: clamp(score), value, focus: key === focus });

  if (audio && audio.startDelay !== null) {
    const d = audio.startDelay;
    add("hook", "Quick start", d <= 0.8 ? 100 : 100 - (d - 0.8) * 28, `Started talking after ${d.toFixed(1)} s`);
    if (audio.wpm) {
      const w = audio.wpm;
      add("pace", "Pace", w < 125 ? 100 - (125 - w) * 1.4 : w > 170 ? 100 - (w - 170) * 1.4 : 100, `About ${w} words a minute`);
    }
    add(
      "flow",
      "Flow",
      100 - audio.longPauses * 15 - Math.max(0, 0.6 - audio.talkRatio) * 120,
      audio.longPauses ? `${audio.longPauses} long pause${audio.longPauses > 1 ? "s" : ""} (longest ${audio.longestPause} s)` : audio.pauses ? `${audio.pauses} short pauses, no long gaps` : "No long gaps",
    );
    if (audio.pitchRange !== null || audio.loudnessRange !== null) {
      const pitch = audio.pitchRange ?? 2.5;
      const loud = audio.loudnessRange ?? 5;
      const score = Math.min(100, (Math.min(pitch, 4) / 4) * 70 + (Math.min(loud, 7) / 7) * 30 + 8);
      add("energy", "Energy", score, score >= 80 ? "Lively voice" : score >= 60 ? "Some variety in your voice" : "Quite a flat tone");
    }
  }
  // If the camera never saw a face (dark room, phone flat on a table), skip these parts
  // rather than scoring zero; a tip explains why.
  const sawFace = Boolean(face && face.samples >= 5 && face.inFrame >= 0.25);
  if (face && sawFace) {
    add("eyes", "Eye contact", 30 + face.eyeContact * face.inFrame * 80, `Looked at the lens ${Math.round(face.eyeContact * 100)}% of the time`);
    add("smile", "Smile", face.smiledAtStart ? Math.max(85, 60 + face.smiling * 60) : 40 + face.smiling * 80, face.smiledAtStart ? "Smiled at the start" : face.smiling > 0.15 ? `Smiled ${Math.round(face.smiling * 100)}% of the time` : "No smile spotted");
  }
  if (scriptDone !== null) add("script", "Script", scriptDone * 100, `Said ${Math.round(scriptDone * 100)}% of your script`);

  const weight = (p: Part) => (p.focus ? 2 : 1);
  const total = parts.reduce((t, p) => t + weight(p), 0);
  const overall = total ? Math.round(parts.reduce((t, p) => t + p.score * weight(p), 0) / total) : 0;

  const tooShort = !audio || audio.speakingSeconds < 4;
  const sorted = [...parts].sort((a, b) => a.score - b.score);
  const tips: string[] = [];
  const focused = parts.find((p) => p.focus);
  if (focused) tips.push(focused.score >= 80 ? `Today's skill: ${PRAISE[focused.key]}` : `Today's skill: ${TIPS[focused.key](focused, input)}`);
  for (const p of sorted) {
    if (tips.length >= 2) break;
    if (p.focus || p.score >= 75) continue;
    tips.push(TIPS[p.key](p, input));
  }
  const best = [...parts].sort((a, b) => b.score - a.score).find((p) => !p.focus && p.score >= 75);
  if (best) tips.push(PRAISE[best.key]);
  if (face && face.samples >= 5 && !sawFace) tips.unshift("We couldn't see your face, so eye contact and smile weren't scored. Face the camera in good light.");
  if (tooShort) tips.unshift("That was a short one. Talk for at least 15 seconds so Yappy can measure more.");
  while (tips.length < 3) tips.push(["Watch your clip back once. You'll spot one thing to try next time.", "Same time tomorrow? Daily reps are what make it feel easy."][tips.length % 2]);

  return {
    version: 1,
    overall: tooShort ? Math.min(overall, 50) : overall,
    verdict: tooShort ? "Too short to judge" : overall >= 85 ? "Brilliant yap!" : overall >= 70 ? "Strong yap" : overall >= 55 ? "Good start" : "Keep practising",
    parts,
    tips: tips.slice(0, 3),
    wpm: audio?.wpm ?? null,
    audio,
    face,
    scriptDone,
  };
}
