import type { Profile } from "@/lib/data/types";
import type { Prompt } from "@/lib/yap";
import { nicheList } from "@/lib/options";

// Ready-made scripts for the "Introduce yourself" yaps (day 1, and again on day 30),
// built from what the user told us in onboarding. Each string is one teleprompter line.

const GOAL_LINE: Record<string, string> = {
  confidence: "to get comfortable talking on camera",
  storytelling: "to get better at telling stories",
  clarity: "to learn to get to the point",
  on_camera: "to sound more confident and clear",
  hooks: "to learn to grab you in the first 3 seconds",
};

const WHERE: Record<string, string> = {
  tiktok: "here on TikTok",
  instagram: "here on Instagram",
  youtube: "here on YouTube",
  linkedin: "here on LinkedIn",
  podcast: "on my podcast",
};

export function isIntroPrompt(p: Prompt) {
  return p.title.toLowerCase().startsWith("introduce yourself");
}

export function introScript(p: Prompt, profile: Profile | null): string[] | null {
  if (!isIntroPrompt(p)) return null;
  const name = profile?.display_name && profile.display_name !== "Guest" ? profile.display_name : "[your name]";
  const niche = nicheList(profile?.niche) || "the things I love";
  const goal = GOAL_LINE[profile?.goal ?? ""] ?? "to get better at talking on camera";
  const where = WHERE[profile?.platform ?? ""] ?? "here";

  if (p.day_index >= 30)
    return [
      `Hey, it's ${name} again!`,
      `30 days ago I started the Yap101 yap challenge ${goal}.`,
      `Today is day 30, and I made it.`,
      `I'm sticking with ${niche} content, so you'll keep seeing me ${where}.`,
      "Thanks for watching, and stay tuned for more!",
    ];

  return [
    `Hey, I'm ${name}!`,
    `I make content about ${niche}.`,
    `Today I'm starting the 30-day yap challenge with Yap101, ${goal}.`,
    `You'll see me ${where}, getting a little better every day.`,
    "Stay tuned for more!",
  ];
}

// --- The user's own scripts -------------------------------------------------------
// Saved per prompt on this device, so an edited script is there next time they open the day.

const KEY = "yap101-scripts";

function readAll(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function loadScript(promptId: number): string[] | null {
  const s = readAll()[promptId];
  return Array.isArray(s) && s.length ? s : null;
}

/** Scripts saved for other days, newest prompt first, each as one string. */
export function otherScripts(promptId: number, limit = 5): string[] {
  return Object.entries(readAll())
    .filter(([id, lines]) => Number(id) !== promptId && Array.isArray(lines) && lines.length)
    .sort(([a], [b]) => Number(b) - Number(a))
    .slice(0, limit)
    .map(([, lines]) => lines.join(" "));
}

export function saveScript(promptId: number, lines: string[] | null) {
  try {
    const all = readAll();
    if (lines?.length) all[promptId] = lines;
    else delete all[promptId];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: the script still works for this visit */
  }
}

// --- Our last suggestion for each day ---------------------------------------------------
// So "Use our suggestion" is instant the second time (and doesn't spend a guest's allowance).

const SUGGEST_KEY = "yap101-suggestions";

export function loadSuggestion(promptId: number): string[] | null {
  try {
    const s = (JSON.parse(localStorage.getItem(SUGGEST_KEY) ?? "{}") as Record<string, unknown>)[promptId];
    return Array.isArray(s) && s.length && s.every((l) => typeof l === "string") ? (s as string[]) : null;
  } catch {
    return null;
  }
}

export function saveSuggestion(promptId: number, lines: string[]) {
  try {
    const all = JSON.parse(localStorage.getItem(SUGGEST_KEY) ?? "{}") as Record<string, string[]>;
    all[promptId] = lines;
    // Keep the newest 40 days.
    const keep = Object.keys(all).sort((a, b) => Number(b) - Number(a)).slice(0, 40);
    localStorage.setItem(SUGGEST_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))));
  } catch {
    /* private mode */
  }
}

/** Typed or pasted text → teleprompter lines: one per line, long paragraphs split into sentences. */
export function textToLines(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((para) => para.trim().split(/(?<=[.!?])\s+(?=\S)/))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export const linesToText = (lines: string[] | null) => (lines ?? []).join("\n");
