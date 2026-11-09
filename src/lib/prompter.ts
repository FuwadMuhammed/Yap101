// Teleprompter text model: splits a script into words, marks the words to push on and the
// places to pause, and gives each line a short delivery cue ("Calm and steady", "Energy up").
// Rule-based on purpose: instant, offline, and predictable. AI coaching can replace it later.

export type Cue = { emoji: string; label: string };
export type Word = {
  i: number; // index across the whole script
  text: string; // as displayed, with punctuation
  norm: string; // lowercase letters/digits, for voice matching
  emphasis: boolean;
  pause: "none" | "short" | "long";
};
export type Line = { words: Word[]; cue: Cue };
export type Script = { lines: Line[]; words: Word[] };

const POWER = new Set([
  "today", "every", "never", "always", "best", "biggest", "worst", "myth", "secret", "stop", "why", "how",
  "first", "last", "only", "more", "most", "new", "made", "it", "free", "mistake", "truth", "real", "love", "hate",
  "challenge", "better", "faster", "nobody", "everyone", "you",
]);
const FILLER_START = new Set(["i", "i'm", "im", "a", "the", "and", "to", "of", "with", "on", "in", "for", "my", "me", "it's", "hey", "hi"]);

export const normWord = (w: string) => w.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");

function cueFor(text: string, index: number, total: number): Cue {
  const words = text.split(/\s+/).length;
  if (index === 0) return /^(hey|hi|hello|what'?s up)/i.test(text) ? { emoji: "😊", label: "Smile, big energy" } : { emoji: "🎯", label: "Hook them, say it strong" };
  if (index === total - 1) return { emoji: "👀", label: "Warm close, look at the lens" };
  if (text.includes("?")) return { emoji: "🤔", label: "Ask it, let your voice go up" };
  if (words > 14) return { emoji: "🫁", label: "Slow down, breathe at the comma" };
  if (/\d/.test(text)) return { emoji: "💪", label: "Push on the numbers" };
  if (text.trim().endsWith("!")) return { emoji: "⚡", label: "Energy up" };
  return { emoji: "🙂", label: "Calm and steady" };
}

/** At most two words per line get emphasis: names/brands and numbers first, then power words. */
function pickEmphasis(raw: string[]): Set<number> {
  const scored = raw
    .map((w, i) => {
      const n = normWord(w);
      let s = 0;
      if (/\d/.test(w)) s = 3;
      else if (i > 0 && /^[A-Z]/.test(w) && !FILLER_START.has(n)) s = 3; // a name, brand or platform
      else if (POWER.has(n)) s = n === "you" || n === "it" ? 1 : 2;
      return { i, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 2);
  return new Set(scored.map((x) => x.i));
}

export function buildScript(lines: string[]): Script {
  let n = 0;
  const out: Line[] = lines.map((text, li) => {
    const raw = text.split(/\s+/).filter(Boolean);
    const emph = pickEmphasis(raw);
    const words = raw.map((w, wi): Word => ({
      i: n++,
      text: w,
      norm: normWord(w),
      emphasis: emph.has(wi),
      pause: /[.!?]$/.test(w) ? "long" : /[,;:—–-]$/.test(w) ? "short" : "none",
    }));
    return { words, cue: cueFor(text, li, lines.length) };
  });
  return { lines: out, words: out.flatMap((l) => l.words) };
}

/** Seconds to hold a word at a given words-per-minute, with breathing room at punctuation. */
export function wordDuration(w: Word, wpm: number) {
  const base = 60 / wpm;
  const long = w.norm.length > 7 ? base * 0.3 : 0;
  const pause = w.pause === "long" ? 0.45 : w.pause === "short" ? 0.2 : 0;
  return base + long + pause;
}

export const estimateSeconds = (s: Script, wpm: number) => Math.round(s.words.reduce((t, w) => t + wordDuration(w, wpm), 0));

// --- Voice follow ---------------------------------------------------------------

const NUMBER_WORDS = new Set("one two three four five six seven eight nine ten eleven twelve fifteen twenty thirty forty fifty sixty hundred first second third".split(" "));

function close(a: string, b: string) {
  if (a === b) return true;
  // "30-day" may be heard as "thirty" or "30"; "Yap101" as "yap" + "101".
  if (/\d/.test(a) && (NUMBER_WORDS.has(b) || /^\d+$/.test(b) || (b.length >= 3 && a.startsWith(b)))) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // one edit apart (typo-level differences from the recogniser)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Where the speaker is in the script, given everything heard so far. Greedy forward match:
 * each heard word may match one of the next few script words, so skipped or misheard words
 * don't stall the prompter. Returns the index of the next word to say.
 */
const CONTRACT: Record<string, string> = {
  "i am": "im", "you will": "youll", "you are": "youre", "it is": "its", "do not": "dont", "we are": "were",
  "i will": "ill", "i have": "ive", "that is": "thats", "let us": "lets", "can not": "cant", "what is": "whats",
};

/** Joins spoken pairs like "I am" into "im" so they line up with "I'm" in the script. */
function joinContractions(words: string[]) {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = CONTRACT[`${words[i]} ${words[i + 1] ?? ""}`];
    if (pair) {
      out.push(pair);
      i++;
    } else out.push(words[i]);
  }
  return out;
}

export function followPosition(script: Word[], heard: string[], window = 4) {
  let pos = 0;
  for (const n of joinContractions(heard.map(normWord).filter(Boolean))) {
    for (let k = pos; k < Math.min(script.length, pos + window); k++) {
      if (close(script[k].norm, n)) {
        pos = k + 1;
        break;
      }
    }
  }
  return pos;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
