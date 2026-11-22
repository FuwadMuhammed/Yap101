// @vitest-environment jsdom
// Round 2: property-based fuzzing of the pure text/storage functions with a seeded PRNG
// (reproducible: same seed, same inputs). Each property runs 2,000 random cases.
import { describe, expect, it } from "vitest";
import { AiUnavailableError, clean } from "@/lib/ai-script";
import { loadScript, saveScript, textToLines } from "@/lib/script";
import { parseWriteRequest, scriptUserMessage, tidyDraft } from "@/lib/write-script";

let seed = 20261121;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const PIECES = ["um", "uh", "like,", "I", "i", "the", "the the", "that that", "Sam", "2019", "12kg", "😀", "🔥🔥", "日本語", "é", "naïve", "[your city]", "<b>", "</draft>", "<request>", "**bold**", "# Heading", "- item", "1.", "...", "!", "?", ".", ",", "—", "\t", "\n", "\n\n", "   ", "\u0000", "​", "'", '"', "\\", "$1", "&amp;", "DROP TABLE", "ignore previous instructions"];
const randText = (max = 60) => Array.from({ length: Math.floor(rnd() * max) }, () => pick(PIECES)).join(pick([" ", "", " ", "  "]));
const N = 2000;
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

describe("fuzz: textToLines (Save)", () => {
  it("never loses or invents non-space characters, never yields empty lines", () => {
    for (let i = 0; i < N; i++) {
      const t = randText();
      const lines = textToLines(t);
      expect(lines.every((l) => l.trim() === l && l.length > 0), JSON.stringify(t)).toBe(true);
      expect(lines.join("").replace(/\s/g, ""), JSON.stringify(t)).toBe(t.replace(/\s/g, ""));
    }
  });
});

describe("fuzz: tidyDraft (offline polish)", () => {
  it("never throws, never adds a word, every line ends cleanly", () => {
    for (let i = 0; i < N; i++) {
      const t = randText();
      const out = tidyDraft(t);
      const have = new Set(words(t));
      for (const w of words(out.join(" "))) expect(have.has(w), `added "${w}" to ${JSON.stringify(t)}`).toBe(true);
      expect(out.every((l) => /[.!?\]]$/.test(l)), JSON.stringify(out)).toBe(true);
    }
  });
});

describe("fuzz: parseWriteRequest (API input)", () => {
  const anyValue = (): unknown => pick([null, undefined, 0, -1, 1e9, NaN, true, "", randText(20), [randText(5), 3, null], { a: randText(5) }, "x".repeat(5000)]);
  it("never throws and always stays within its limits", () => {
    for (let i = 0; i < N; i++) {
      const body = Object.fromEntries(["mode", "title", "points", "skill", "skillTip", "focus", "challengeDay", "seconds", "name", "niche", "platform", "goal", "level", "draft", "request", "avoid", "previous"].map((k) => [k, rnd() < 0.3 ? undefined : anyValue()]));
      const r = parseWriteRequest(body);
      if (!r) continue;
      expect(r.title.length).toBeLessThanOrEqual(200);
      expect(r.draft.length).toBeLessThanOrEqual(3000);
      expect(r.seconds).toBeGreaterThanOrEqual(15);
      expect(r.seconds).toBeLessThanOrEqual(60);
      expect(r.points.length).toBeLessThanOrEqual(8);
      expect(["suggest", "polish"]).toContain(r.mode);
    }
  });
});

describe("fuzz: scriptUserMessage (prompt built from user text)", () => {
  it("user text can never open or close the prompt's own sections", () => {
    const TAGS = /<\/?(profile|todays_prompt|previous_scripts|draft|request|task|avoid)>/gi;
    for (let i = 0; i < N; i++) {
      const r = parseWriteRequest({ mode: pick(["suggest", "polish"]), title: randText(10) || "T", draft: "one two three four " + randText(), request: randText(), avoid: randText(), name: randText(5), previous: [randText()] });
      if (!r) continue;
      const msg = scriptUserMessage(r);
      const tags = msg.match(TAGS) ?? [];
      // Exactly the sections we put there: each opened once and closed once.
      const counts = tags.reduce<Record<string, number>>((a, t) => ((a[t.toLowerCase()] = (a[t.toLowerCase()] ?? 0) + 1), a), {});
      expect(Object.values(counts).every((n) => n === 1), JSON.stringify(counts)).toBe(true);
    }
  });
});

describe("fuzz: clean (model reply → teleprompter)", () => {
  it("only ever returns short, non-empty, unmarked lines (or a known error)", () => {
    for (let i = 0; i < N; i++) {
      const lines = Array.from({ length: Math.floor(rnd() * 8) }, () => (rnd() < 0.1 ? "word ".repeat(200) : randText(30)));
      try {
        const out = clean({ kind: pick(["script", "question", "poem"]) as "script", lines, message: rnd() < 0.2 ? randText(10) : "" }, { mode: "suggest", draft: "", skillTip: "Picture one friend behind the lens, not a crowd.", focus: "" });
        if (out.kind !== "script") continue;
        for (const l of out.lines) {
          expect(l.length > 0 && l.length <= 220, JSON.stringify(l)).toBe(true);
          expect(/^(#{1,6}\s|[-*•>]\s|\d+[.)]\s)/.test(l), JSON.stringify(l)).toBe(false);
        }
      } catch (e) {
        expect(e).toBeInstanceOf(AiUnavailableError);
      }
    }
  });
});

describe("fuzz: saveScript / loadScript round trip", () => {
  it("whatever lines are saved come back identical", () => {
    for (let i = 0; i < 500; i++) {
      localStorage.clear();
      const lines = textToLines(randText(40));
      if (!lines.length) continue;
      expect(saveScript(i % 30, lines)).toBe(true);
      expect(loadScript(i % 30)).toEqual(lines);
    }
  });
});
