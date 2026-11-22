// Transcript-based measurements for the Yap score: filler rate, a clear close, hedging words,
// and exact pace / first-3-second word counts. The words come from free on-device Whisper
// (asr.ts); hiddenFillers adds the drawn-out "uhh"s Whisper drops. With no transcript the
// score marks these "Needs speech recognition" and leaves them out.

export type Word = {
  /** As recognised, e.g. "um", "Hello,". */
  text: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  /** Not in the transcript: a filled pause heard in the audio between words (see hiddenFillers). */
  heard?: boolean;
};

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");

/** Single-word fillers. "Like" only counts when the recogniser marked it off with commas. */
const FILLERS = new Set(["um", "umm", "uh", "uhh", "uhm", "er", "erm", "hmm", "hm", "mm", "mmm", "mhm", "ah"]);
const PHRASE_FILLERS = [["you", "know"], ["i", "mean"]];
const HEDGES = [["kind", "of"], ["sort", "of"], ["maybe"], ["i", "guess"], ["probably"], ["i", "feel", "like"], ["i", "think"], ["perhaps"], ["somewhat"]];
/** Words that signal a takeaway, a call to action or a sign-off near the end. */
const CLOSERS = [["follow"], ["subscribe"], ["comment"], ["let", "me", "know"], ["try"], ["save"], ["share"], ["see", "you"], ["thanks", "for", "watching"], ["thank", "you"], ["tomorrow"], ["remember"], ["so", "next", "time"], ["link"], ["bye"]];

function countPhrases(tokens: string[], phrases: string[][]) {
  let n = 0;
  const found: string[] = [];
  for (let i = 0; i < tokens.length; i++)
    for (const p of phrases)
      if (p.every((w, j) => tokens[i + j] === w)) {
        n++;
        found.push(p.join(" "));
      }
  return { n, found };
}

/** Whether word i is a single-word filler ("um", or "like" set off by commas). */
export function isFiller(words: Word[], i: number) {
  const t = norm(words[i].text);
  return FILLERS.has(t) || (t === "like" && /,$/.test(words[i].text) && i > 0 && /,$/.test(words[i - 1].text));
}

/** Filler words, with a count per word ({"um": 4, "like": 2}). */
export function fillerStats(words: Word[]) {
  const tokens = words.map((w) => norm(w.text));
  const byWord: Record<string, number> = {};
  let count = 0;
  words.forEach((w, i) => {
    const t = tokens[i];
    if (isFiller(words, i)) {
      count++;
      byWord[t] = (byWord[t] ?? 0) + 1;
    }
  });
  const phrases = countPhrases(tokens, PHRASE_FILLERS);
  for (const p of phrases.found) byWord[p] = (byWord[p] ?? 0) + 1;
  return { count: count + phrases.n, byWord };
}

export function hedgeStats(words: Word[]) {
  const r = countPhrases(words.map((w) => norm(w.text)), HEDGES);
  return { count: r.n, found: r.found };
}

/** Words spoken (fillers excluded) whose start falls in [from, to) seconds. */
export function wordsBetween(words: Word[], from: number, to: number) {
  return words.filter((w) => w.start >= from && w.start < to && !FILLERS.has(norm(w.text)) && norm(w.text)).length;
}

/** Words a minute over the speaking span, not counting fillers or silences over 3 s. */
export function paceFromWords(words: Word[]): number | null {
  const real = words.filter((w) => norm(w.text) && !FILLERS.has(norm(w.text)));
  if (real.length < 5) return null;
  let span = 0;
  for (let i = 0; i < real.length; i++) {
    span += real[i].end - real[i].start;
    const gap = i ? real[i].start - real[i - 1].end : 0;
    if (gap > 0 && gap <= 3) span += gap;
  }
  return span >= 3 ? Math.round((real.length / span) * 60) : null;
}

/** The closing phrase found in the last 5 seconds of speech, or null. */
export function closeDetected(words: Word[], clipSeconds: number): string | null {
  const lastSpoken = words.length ? words[words.length - 1].end : clipSeconds;
  const tail = words.filter((w) => w.start >= Math.max(0, Math.min(clipSeconds, lastSpoken) - 5));
  const r = countPhrases(tail.map((w) => norm(w.text)), CLOSERS);
  return r.found[0] ?? null;
}

/**
 * Fillers the recogniser left out. Whisper tends to drop a drawn-out "uhh", so look at the gaps
 * between recognised words: a stretch of continuous voice of 0.3 s or more inside a gap of
 * 0.45 s or more is a filled pause (silence would be quiet; a real word would be in the
 * transcript). `frames` are the take's 25 ms loudness frames (times in any unit of seconds;
 * the first frame is the start of the recording). Marked `heard` so the UI can say so.
 */
export function hiddenFillers(words: Word[], frames: { rms: number[]; times: number[] }): Word[] {
  const { rms, times } = frames;
  if (rms.length < 20 || words.length < 2) return [];
  const t0 = times[0];
  const thresh = voiceThreshold(rms);
  const found: Word[] = [];
  for (let i = 1; i < words.length; i++) {
    const from = words[i - 1].end + 0.08, to = words[i].start - 0.08; // keep clear of word edges
    if (to - from < 0.45 - 0.16) continue;
    let runStart = -1;
    for (let k = 0; k < rms.length; k++) {
      const t = times[k] - t0;
      if (t < from) continue;
      if (t > to) break;
      if (rms[k] > thresh) {
        if (runStart < 0) runStart = t;
        if (t - runStart >= 0.3 && !found.some((f) => f.start === runStart)) found.push({ text: "uh", start: runStart, end: t, heard: true });
      } else runStart = -1;
    }
  }
  // One per gap is enough: keep the first of any overlapping finds.
  return found.filter((f, i) => !found.slice(0, i).some((g) => f.start < g.end + 0.2));
}

/** Loudness above which a 25 ms frame counts as voice: well over the room's noise floor. */
function voiceThreshold(rms: number[]) {
  const sorted = [...rms].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return Math.max(pct(0.1) * 3, pct(0.9) * 0.22, 0.004);
}

/**
 * Drops words with no voice under them. Whisper is known to invent text ("Thank you.") over
 * silence or noise, which would fake a clear close; a real word has loud frames in its span.
 */
export function voicedOnly(words: Word[], frames: { rms: number[]; times: number[] }): Word[] {
  const { rms, times } = frames;
  if (rms.length < 20) return words;
  const t0 = times[0], thresh = voiceThreshold(rms);
  return words.filter((w) => {
    let loud = 0;
    for (let k = 0; k < rms.length; k++) {
      const t = times[k] - t0;
      if (t >= w.start - 0.1 && t <= w.end + 0.1 && rms[k] > thresh) loud++;
    }
    return loud >= 2; // 50 ms of voice
  });
}

/** Recognised words that were really spoken, plus heard fillers, in time order. */
export function withHiddenFillers(words: Word[], frames: { rms: number[]; times: number[] }) {
  const real = voicedOnly(words, frames);
  return [...real, ...hiddenFillers(real, frames)].sort((a, b) => a.start - b.start);
}

/** The feedback-row fields a transcript fills in (null when there's no transcript). */
export function transcriptFields(words: Word[] | null | undefined) {
  if (!words?.length) return { filler_count: null, filler_words: {} as Record<string, number>, transcript: null };
  const f = fillerStats(words);
  return { filler_count: f.count, filler_words: f.byWord, transcript: words.filter((w) => !w.heard).map((w) => w.text).join(" ") };
}
