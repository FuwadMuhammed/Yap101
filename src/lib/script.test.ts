// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/data/types";
import type { Prompt } from "@/lib/yap";
import { claimDevice, clearLocalScripts, introScript, isCachedSuggestion, isIntroPrompt, linesToText, loadScript, loadSuggestion, otherScripts, profileSig, saveScript, saveSuggestion, textToLines } from "./script";

const prompt = (over: Partial<Prompt> = {}) =>
  ({ id: 1, day_index: 1, title: "Introduce yourself", talking_points: [], skill: "", skill_tip: "", week: 1, focus: "", milestone: false, level: "beginner", goal: "confidence", ...over }) as Prompt;

const profile: Profile = {
  display_name: "Sam",
  niche: "fitness,tech",
  platform: "tiktok",
  confidence: 2,
  level: "beginner",
  goal: "confidence",
  track_start_date: null,
  onboarded_at: null,
  yap_time: null,
};

describe("introScript (the day 1 / day 30 suggestion)", () => {
  it("is only made for intro prompts", () => {
    expect(isIntroPrompt(prompt())).toBe(true);
    expect(isIntroPrompt(prompt({ title: "Introduce yourself, again" }))).toBe(true);
    expect(introScript(prompt({ title: "Why you got into fitness" }), profile)).toBeNull();
  });

  it("builds day 1 from their onboarding answers", () => {
    expect(introScript(prompt(), profile)).toEqual([
      "Hey, I'm Sam!",
      "I make content about fitness and tech.",
      "Today I'm starting the 30-day yap challenge with Yap101, to get comfortable talking on camera.",
      "You'll see me here on TikTok, getting a little better every day.",
      "Stay tuned for more!",
    ]);
  });

  it("uses placeholders for guests with no answers", () => {
    const s = introScript(prompt(), { ...profile, display_name: "Guest", niche: null, platform: null, goal: null })!;
    expect(s[0]).toBe("Hey, I'm [your name]!");
    expect(s[1]).toBe("I make content about the things I love.");
  });

  it("writes the day 30 version", () => {
    expect(introScript(prompt({ day_index: 30, title: "Introduce yourself, again" }), profile)![2]).toBe("Today is day 30, and I made it.");
  });
});

describe("textToLines / linesToText", () => {
  it("splits paragraphs into sentences and drops blank lines", () => {
    expect(textToLines("Hi there. I'm Sam!\n\n  I make   videos  ")).toEqual(["Hi there.", "I'm Sam!", "I make videos"]);
  });
  it("round-trips", () => {
    expect(linesToText(["a", "b"])).toBe("a\nb");
    expect(linesToText(null)).toBe("");
  });
});

describe("saved scripts", () => {
  it("saves, loads and deletes a day's script", () => {
    saveScript(5, ["one", "two"]);
    expect(loadScript(5)).toEqual(["one", "two"]);
    saveScript(5, null);
    expect(loadScript(5)).toBeNull();
  });

  it("lists other days' scripts, newest first", () => {
    saveScript(1, ["day one"]);
    saveScript(3, ["day three"]);
    saveScript(2, ["day two"]);
    expect(otherScripts(2)).toEqual(["day three", "day one"]);
  });
});

describe("saved suggestions", () => {
  it("saves and loads a day's suggestion for the same profile", () => {
    expect(loadSuggestion(7, "sig")).toBeNull();
    saveSuggestion(7, ["Hey!", "Today: wins."], "sig");
    expect(loadSuggestion(7, "sig")).toEqual(["Hey!", "Today: wins."]);
  });

  it("ignores it once the profile changed (BUG-12)", () => {
    saveSuggestion(7, ["Hey, I'm Sam!"], profileSig({ name: "Sam", niche: "fitness", platform: null, goal: null, level: null }));
    expect(loadSuggestion(7, profileSig({ name: "Alex", niche: "fitness", platform: null, goal: null, level: null }))).toBeNull();
    expect(isCachedSuggestion(7, ["Hey, I'm Sam!"])).toBe(true);
  });

  it("ignores broken storage and the old array format", () => {
    localStorage.setItem("yap101-suggestions", "{not json");
    expect(loadSuggestion(7, "")).toBeNull();
    localStorage.setItem("yap101-suggestions", JSON.stringify({ 7: ["old format"] }));
    expect(loadSuggestion(7, "")).toBeNull();
    localStorage.setItem("yap101-suggestions", "null");
    expect(loadSuggestion(7, "")).toBeNull();
  });

  it("keeps only the newest 40 days", () => {
    for (let id = 1; id <= 45; id++) saveSuggestion(id, [`s${id}`], "x");
    expect(loadSuggestion(45, "x")).toEqual(["s45"]);
    expect(loadSuggestion(6, "x")).toEqual(["s6"]);
    expect(loadSuggestion(5, "x")).toBeNull();
  });
});

describe("corrupted storage (BUG-06, BUG-09)", () => {
  for (const raw of ["null", "\"a string\"", "[1,2]", "42", "{bad json", JSON.stringify({ 2: "not lines", 3: [1, 2] })])
    it(`survives yap101-scripts = ${raw}`, () => {
      localStorage.setItem("yap101-scripts", raw);
      expect(loadScript(2)).toBeNull();
      expect(otherScripts(9)).toEqual([]);
      expect(saveScript(2, ["Fresh."])).toBe(true);
      expect(loadScript(2)).toEqual(["Fresh."]);
    });
});

describe("storage full (BUG-05)", () => {
  it("frees space by dropping cached suggestions, then saves", () => {
    saveSuggestion(1, ["cached"], "x");
    const real = Storage.prototype.setItem;
    let calls = 0;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === "yap101-scripts" && calls++ === 0) throw new DOMException("full", "QuotaExceededError");
      return real.call(this, k, v);
    });
    expect(saveScript(2, ["Kept."])).toBe(true);
    expect(localStorage.getItem("yap101-suggestions")).toBeNull();
    spy.mockRestore();
    expect(loadScript(2)).toEqual(["Kept."]);
  });

  it("reports failure when nothing can be stored", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveScript(2, ["Lost."])).toBe(false);
    spy.mockRestore();
  });
});

describe("one person per device (BUG-18)", () => {
  it("wipes another person's scripts when someone else signs in", () => {
    claimDevice("user-a");
    saveScript(3, ["A's private script."]);
    saveSuggestion(3, ["A's suggestion."], "x");
    claimDevice("user-a");
    expect(loadScript(3)).toEqual(["A's private script."]);
    claimDevice("user-b");
    expect(loadScript(3)).toBeNull();
    expect(otherScripts(9)).toEqual([]);
    expect(loadSuggestion(3, "x")).toBeNull();
  });

  it("keeps scripts saved before ownership was tracked (existing users updating)", () => {
    saveScript(3, ["Saved before the update."]);
    claimDevice("user-b");
    expect(loadScript(3)).toEqual(["Saved before the update."]);
    claimDevice("user-c");
    expect(loadScript(3)).toBeNull();
  });

  it("clearLocalScripts removes scripts and suggestions", () => {
    saveScript(3, ["x"]);
    saveSuggestion(3, ["y"], "s");
    clearLocalScripts();
    expect(localStorage.getItem("yap101-scripts")).toBeNull();
    expect(localStorage.getItem("yap101-suggestions")).toBeNull();
  });
});
