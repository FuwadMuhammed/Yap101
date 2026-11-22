// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/data/types";
import type { Prompt } from "@/lib/yap";
import { claimDevice, clearLocalScripts, introScript, isCachedSuggestion, isStaleOwner, isIntroPrompt, linesToText, loadDraft, loadScript, loadSuggestion, otherScripts, profileSig, saveDraft, saveScript, saveSuggestion, textToLines } from "./script";

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

  it("only sends scripts from the same track: a level change leaves old ones out (BUG-30)", () => {
    localStorage.clear();
    saveScript(101, ["old track day one"]);
    saveScript(402, ["new track day two"]);
    saveScript(403, ["new track day three"]);
    expect(otherScripts(401)).toEqual(["new track day three", "new track day two"]);
    expect(otherScripts(102)).toEqual(["old track day one"]);
  });
});

describe("unsaved drafts (BUG-29)", () => {
  it("keeps, restores and drops a day's draft", () => {
    localStorage.clear();
    expect(loadDraft(7)).toBeNull();
    saveDraft(7, "my rough words");
    saveDraft(8, "another day");
    expect(loadDraft(7)).toBe("my rough words");
    saveDraft(7, null);
    expect(loadDraft(7)).toBeNull();
    expect(loadDraft(8)).toBe("another day");
    saveDraft(8, "   ");
    expect(localStorage.getItem("yap101-script-drafts")).toBeNull();
  });

  it("is wiped with the rest of the device's scripts", () => {
    saveDraft(3, "draft");
    clearLocalScripts();
    expect(loadDraft(3)).toBeNull();
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
    // An existing user's device: scripts, no owner key yet.
    localStorage.setItem("yap101-scripts", JSON.stringify({ 3: ["Saved before the update."] }));
    claimDevice("user-b");
    expect(loadScript(3)).toEqual(["Saved before the update."]);
    claimDevice("user-c");
    expect(loadScript(3)).toBeNull();
  });

  it("guest scripts are adopted when that guest signs in to an account", () => {
    claimDevice("local");
    saveScript(4, ["Written as a guest."]);
    claimDevice("account-1");
    expect(loadScript(4)).toEqual(["Written as a guest."]);
  });

  it("BUG-26: a tab whose person was replaced in another tab can't read or write", () => {
    claimDevice("sam");
    saveScript(2, ["Sam's script."]);
    // Another tab signs Priya in: the device is now hers and Sam's scripts are gone.
    localStorage.setItem("yap101-scripts-owner", "priya");
    localStorage.setItem("yap101-scripts", JSON.stringify({ 6: ["Priya's script."] }));
    expect(isStaleOwner()).toBe(true);
    expect(saveScript(2, ["Sam saves from the old tab."])).toBe(false);
    expect(otherScripts(1)).toEqual([]); // Priya's scripts are not readable from Sam's tab
    expect(loadScript(6)).toBeNull();
    saveSuggestion(2, ["x"], "s");
    expect(localStorage.getItem("yap101-suggestions")).toBeNull();
    expect(JSON.parse(localStorage.getItem("yap101-scripts")!)).toEqual({ 6: ["Priya's script."] });
  });

  it("BUG-26: signing out in another tab also makes this tab stale", () => {
    claimDevice("sam");
    clearLocalScripts();
    expect(isStaleOwner()).toBe(true);
    expect(saveScript(2, ["after sign-out"])).toBe(false);
  });

  it("clearLocalScripts removes scripts and suggestions", () => {
    claimDevice("someone");
    saveScript(3, ["x"]);
    saveSuggestion(3, ["y"], "s");
    clearLocalScripts();
    expect(localStorage.getItem("yap101-scripts")).toBeNull();
    expect(localStorage.getItem("yap101-suggestions")).toBeNull();
  });
});
