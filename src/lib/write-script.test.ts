import { describe, expect, it } from "vitest";
import {
  demoWrittenScript,
  MIN_POLISH_WORDS,
  parseWriteRequest,
  SCRIPT_SYSTEM,
  scriptUserMessage,
  templateSuggestion,
  tidyDraft,
  wordCount,
  type WriteRequest,
} from "./write-script";

const base = {
  title: "Introduce yourself",
  points: ["Your name and what you make", "Why you started"],
  skill: "Smile and start",
  skillTip: "Smile right before you hit record.",
  focus: "Eyes on the lens, energy up.",
  challengeDay: 1,
  seconds: 30,
  name: "Sam",
  niche: "fitness",
  platform: "TikTok",
  goal: "Stop freezing, start talking",
  level: "Beginner",
  previous: [],
};

const req = (over: Record<string, unknown>) => parseWriteRequest({ ...base, ...over }) as WriteRequest;

describe("wordCount", () => {
  it("counts words across spaces and new lines", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  hi  there\nfriend ")).toBe(3);
  });
});

describe("parseWriteRequest", () => {
  it("rejects bodies without a title", () => {
    expect(parseWriteRequest(null)).toBeNull();
    expect(parseWriteRequest("nope")).toBeNull();
    expect(parseWriteRequest({ ...base, title: "  " })).toBeNull();
  });

  it("keeps an explicit mode", () => {
    expect(req({ mode: "suggest" }).mode).toBe("suggest");
    expect(req({ mode: "polish", draft: "hi I am Sam and I make videos" }).mode).toBe("polish");
  });

  it("infers the mode for older clients: a draft means polish, none means suggest", () => {
    expect(req({ draft: "hi I am Sam and I make videos" }).mode).toBe("polish");
    expect(req({ draft: "" }).mode).toBe("suggest");
    expect(req({ mode: "something-else" }).mode).toBe("suggest");
  });

  it(`refuses to polish fewer than ${MIN_POLISH_WORDS} words`, () => {
    expect(parseWriteRequest({ ...base, mode: "polish", draft: "too short" })).toBeNull();
    expect(parseWriteRequest({ ...base, mode: "polish", draft: "" })).toBeNull();
    expect(parseWriteRequest({ ...base, mode: "polish", draft: "one two three four" })).not.toBeNull();
  });

  it("drops the draft for suggestions, so they start from the topic", () => {
    const r = req({ mode: "suggest", draft: "my own words here", avoid: "the last suggestion" });
    expect(r.draft).toBe("");
    expect(r.avoid).toBe("the last suggestion");
  });

  it("drops avoid for polish, which only works from the draft", () => {
    const r = req({ mode: "polish", draft: "hi I am Sam and I make videos", avoid: "x" });
    expect(r.avoid).toBe("");
    expect(r.draft).toBe("hi I am Sam and I make videos");
  });

  it("clamps the length to 15–60 seconds and the day to 1–60", () => {
    expect(req({ seconds: 500 }).seconds).toBe(60);
    expect(req({ seconds: 2 }).seconds).toBe(15);
    expect(req({ seconds: "abc" }).seconds).toBe(30);
    expect(req({ challengeDay: 0 }).challengeDay).toBeNull();
    expect(req({ challengeDay: 12 }).challengeDay).toBe(12);
  });

  it("trims and caps untrusted strings and lists", () => {
    const r = req({ request: "x".repeat(900), points: ["a", 5, "", ...Array(10).fill("p")], name: "   " });
    expect(r.request).toHaveLength(500);
    expect(r.points).toHaveLength(8);
    expect(r.points[0]).toBe("a");
    expect(r.name).toBeNull();
  });
});

describe("scriptUserMessage", () => {
  it("sends the profile and today's prompt", () => {
    const m = scriptUserMessage(req({ mode: "suggest" }));
    expect(m).toContain("Name: Sam");
    expect(m).toContain("Speaking niche: fitness");
    expect(m).toContain("Posts on: TikTok");
    expect(m).toContain("Title: Introduce yourself");
    expect(m).toContain("- Why you started");
    expect(m).toContain("Target length: 30 seconds (60 to 75 words)");
  });

  it("suggest: asks for a script and includes the request and avoid, never a draft", () => {
    const m = scriptUserMessage(req({ mode: "suggest", request: "I'm a nurse", avoid: "Hey, I'm Sam!" }));
    expect(m).toContain("<task>\nsuggest:");
    expect(m).toContain("<request>\nI'm a nurse\n</request>");
    expect(m).toContain("<avoid>\nHey, I'm Sam!\n</avoid>");
    expect(m).not.toContain("<draft>");
  });

  it("suggest: with no request, writes for today's prompt", () => {
    const m = scriptUserMessage(req({ mode: "suggest" }));
    expect(m).toContain("(none: write a script for today's prompt)");
    expect(m).not.toContain("<avoid>");
  });

  it("polish: sends the draft and the polish task, no request", () => {
    const m = scriptUserMessage(req({ mode: "polish", draft: "um hi I'm Sam and I make videos", request: "ignored" }));
    expect(m).toContain("<task>\npolish:");
    expect(m).toContain("<draft>\num hi I'm Sam and I make videos\n</draft>");
    expect(m).not.toContain("<request>");
    expect(m).not.toContain("ignored");
  });
});

describe("SCRIPT_SYSTEM", () => {
  it("briefs the writer on both jobs", () => {
    expect(SCRIPT_SYSTEM).toContain("## suggest");
    expect(SCRIPT_SYSTEM).toContain("## polish");
    expect(SCRIPT_SYSTEM).toMatch(/Never add facts/);
  });
});

describe("tidyDraft", () => {
  it("cuts filler words and doubled words", () => {
    expect(tidyDraft("um so hi i'm Sam and i i make like, fitness videos uh basically for busy moms")).toEqual([
      "Hi I'm Sam and I make fitness videos for busy moms.",
    ]);
  });

  it("puts one sentence on each line and ends each with punctuation", () => {
    expect(tidyDraft("I started last year. it was hard!\n\nnow I love it")).toEqual(["I started last year.", "It was hard!", "Now I love it."]);
  });

  it("keeps [placeholders] and drops lines with no words", () => {
    expect(tidyDraft("I live in [your city]\n...\num")).toEqual(["I live in [your city]"]);
  });

  it("leaves words that only contain filler, like 'umbrella', alone", () => {
    expect(tidyDraft("my umbrella is red")).toEqual(["My umbrella is red."]);
  });
});

describe("templateSuggestion", () => {
  it("uses their name, niche, the topic and each talking point", () => {
    expect(templateSuggestion({ name: "Sam", niche: "fitness", title: "Why you got into fitness", points: ["The moment it clicked", "Who you want to help"], request: "" })).toEqual([
      "Hey, I'm Sam and I talk about fitness!",
      "Today: why you got into fitness.",
      "The moment it clicked: [say it in one line].",
      "Who you want to help: [say it in one line].",
      "That's it from me. See you tomorrow!",
    ]);
  });

  it("leaves a placeholder when we don't know their name", () => {
    expect(templateSuggestion({ name: null, niche: null, title: "A win", points: [], request: "" })[0]).toBe("Hey, it's [your name]!");
  });

  it("uses their request as the topic when they gave one", () => {
    expect(templateSuggestion({ name: null, niche: null, title: "A win", points: [], request: "My first marathon." })[1]).toBe("Today: my first marathon.");
  });
});

describe("demoWrittenScript", () => {
  it("polishes the draft in polish mode and suggests otherwise", () => {
    expect(demoWrittenScript(req({ mode: "polish", draft: "um hi I make fitness videos" }))).toEqual(["Hi I make fitness videos."]);
    expect(demoWrittenScript(req({ mode: "suggest" }))[0]).toBe("Hey, I'm Sam and I talk about fitness!");
  });
});
