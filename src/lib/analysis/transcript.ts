// Transcript-based measurements for the Yap score: filler rate, a clear close, hedging words,
// and exact pace / first-3-second word counts. They need word-level timestamps from speech
// recognition (see the "AI" note in docs: CrisperWhisper on a server, or Whisper + a filler
// detector in the browser). Until a recogniser is wired in, the score marks these
// "Needs speech recognition" and leaves them out.

export type Word = {
  /** As recognised, e.g. "um", "Hello,". */
  text: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
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

/** Filler words, with a count per word ({"um": 4, "like": 2}). */
export function fillerStats(words: Word[]) {
  const tokens = words.map((w) => norm(w.text));
  const byWord: Record<string, number> = {};
  let count = 0;
  words.forEach((w, i) => {
    const t = tokens[i];
    const commaLike = t === "like" && /,$/.test(w.text) && i > 0 && /,$/.test(words[i - 1].text);
    if (FILLERS.has(t) || commaLike) {
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
