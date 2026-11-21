// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Profile } from "@/lib/data/types";
import type { Prompt } from "@/lib/yap";
import { introScript, isIntroPrompt, linesToText, loadScript, loadSuggestion, otherScripts, saveScript, saveSuggestion, textToLines } from "./script";

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
  it("saves and loads a day's suggestion", () => {
    expect(loadSuggestion(7)).toBeNull();
    saveSuggestion(7, ["Hey!", "Today: wins."]);
    expect(loadSuggestion(7)).toEqual(["Hey!", "Today: wins."]);
  });

  it("ignores broken storage", () => {
    localStorage.setItem("yap101-suggestions", "{not json");
    expect(loadSuggestion(7)).toBeNull();
    localStorage.setItem("yap101-suggestions", JSON.stringify({ 7: [1, 2] }));
    expect(loadSuggestion(7)).toBeNull();
  });

  it("keeps only the newest 40 days", () => {
    for (let id = 1; id <= 45; id++) saveSuggestion(id, [`s${id}`]);
    expect(loadSuggestion(45)).toEqual(["s45"]);
    expect(loadSuggestion(6)).toEqual(["s6"]);
    expect(loadSuggestion(5)).toBeNull();
  });
});
