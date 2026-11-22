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
// The data belongs to one person: `claimDevice` wipes it when someone else signs in, and
// sign-out / "Delete my guest data" call `clearLocalScripts`.

const KEY = "yap101-scripts";
const SUGGEST_KEY = "yap101-suggestions";
const OWNER_KEY = "yap101-scripts-owner";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A stored JSON object, or {} for anything missing, broken or of the wrong shape. */
function readObject(key: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return isRecord(v) ? v : {};
  } catch {
    return {};
  }
}

const isLines = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((l) => typeof l === "string");

/**
 * The person this tab claimed the device for (see `claimDevice`). If another tab has since
 * signed in someone else (or signed out), this tab is stale: it may no longer read or write
 * scripts, or one person's words would end up in the other's store and AI requests.
 */
let claimed: string | null = null;

/** True when another tab changed who owns this device's scripts since this tab claimed it. */
export function isStaleOwner(): boolean {
  if (claimed === null) return false;
  try {
    return localStorage.getItem(OWNER_KEY) !== claimed;
  } catch {
    return false; // storage blocked: nothing shared between tabs either
  }
}

/** The storage key that records the owner, for tabs that listen to `storage` events. */
export const OWNER_STORAGE_KEY = OWNER_KEY;

function readAll(): Record<string, string[]> {
  if (isStaleOwner()) return {};
  return Object.fromEntries(Object.entries(readObject(KEY)).filter(([, v]) => isLines(v))) as Record<string, string[]>;
}

/** Writes a value; on a full store, frees space by dropping cached suggestions and tries once more. */
function write(key: string, value: unknown): boolean {
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(key, json);
    return true;
  } catch {
    try {
      if (key === SUGGEST_KEY) return false;
      localStorage.removeItem(SUGGEST_KEY);
      localStorage.setItem(key, json);
      return true;
    } catch {
      return false;
    }
  }
}

export function loadScript(promptId: number): string[] | null {
  return readAll()[promptId] ?? null;
}

/** Prompt ids are (track * 100) + day: the same track means the same level and goal. */
const trackOf = (promptId: number) => Math.floor(promptId / 100);

/**
 * Scripts saved for other days of the same track (level + goal), newest prompt first, each as
 * one string. Scripts from a track they've since left aren't shown anywhere, so they aren't sent either.
 */
export function otherScripts(promptId: number, limit = 5): string[] {
  return Object.entries(readAll())
    .filter(([id]) => Number(id) !== promptId && trackOf(Number(id)) === trackOf(promptId))
    .sort(([a], [b]) => Number(b) - Number(a))
    .slice(0, limit)
    .map(([, lines]) => lines.join(" "));
}

/** Saves (or, with null, removes) a day's script. Returns false when the device couldn't store it. */
export function saveScript(promptId: number, lines: string[] | null): boolean {
  if (isStaleOwner()) return false;
  const all = readAll();
  if (lines?.length) all[promptId] = lines;
  else delete all[promptId];
  return write(KEY, all);
}

// Unsaved editor text, per day, so a reload or a closed tab doesn't lose it.
const DRAFT_KEY = "yap101-script-drafts";

export function loadDraft(promptId: number): string | null {
  if (isStaleOwner()) return null;
  const v = readObject(DRAFT_KEY)[promptId];
  return typeof v === "string" && v.trim() ? v : null;
}

/** Keeps (or, with an empty string or null, drops) the editor text for a day. */
export function saveDraft(promptId: number, text: string | null) {
  if (isStaleOwner()) return;
  const all = readObject(DRAFT_KEY) as Record<string, unknown>;
  if (text?.trim()) all[promptId] = text.slice(0, 20_000);
  else delete all[promptId];
  try {
    if (Object.keys(all).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* a draft is a convenience; never break typing over it */
  }
}

/** Removes every script and suggestion from this device. */
export function clearLocalScripts() {
  try {
    for (const k of [KEY, SUGGEST_KEY, OWNER_KEY, DRAFT_KEY]) localStorage.removeItem(k);
  } catch {
    /* storage blocked: nothing stored either */
  }
}

/**
 * Call once the signed-in person is known. If the scripts on this device belong to someone
 * else, they are wiped first. Scripts saved before owners were tracked have no owner: they
 * are kept for the first person to sign in (wiping them would lose every existing user's
 * scripts on update); sign-out clears the device from then on. Guest scripts ("local") are
 * adopted the same way when that guest signs in to an account on this device.
 */
export function claimDevice(owner: string) {
  claimed = owner;
  try {
    const current = localStorage.getItem(OWNER_KEY);
    if (current === owner) return;
    const adopt = current === null || (current === "local" && owner !== "local");
    if (!adopt) clearLocalScripts();
    localStorage.setItem(OWNER_KEY, owner);
  } catch {
    /* storage blocked */
  }
}

// --- Our last suggestion for each day ---------------------------------------------------
// So "Use our suggestion" is instant the second time. Each one remembers the profile it was
// written for (`sig`), so a changed name or niche gets a fresh suggestion.

type Cached = { sig: string; lines: string[] };
const isCached = (v: unknown): v is Cached => isRecord(v) && typeof v.sig === "string" && isLines(v.lines);

/** The cached suggestion for a day, if it was written for this profile signature. */
export function loadSuggestion(promptId: number, sig: string): string[] | null {
  if (isStaleOwner()) return null;
  const c = readObject(SUGGEST_KEY)[promptId];
  return isCached(c) && c.sig === sig ? c.lines : null;
}

/** True when `lines` are the suggestion we cached for this day (whatever profile it was for). */
export function isCachedSuggestion(promptId: number, lines: string[] | null): boolean {
  const c = readObject(SUGGEST_KEY)[promptId];
  return Boolean(lines?.length && isCached(c) && c.lines.join("\n") === lines.join("\n"));
}

export function saveSuggestion(promptId: number, lines: string[], sig: string) {
  if (isStaleOwner()) return;
  const all = Object.fromEntries(Object.entries(readObject(SUGGEST_KEY)).filter(([, v]) => isCached(v))) as Record<string, Cached>;
  all[promptId] = { sig, lines };
  // Keep the newest 40 days.
  const keep = Object.keys(all).sort((a, b) => Number(b) - Number(a)).slice(0, 40);
  write(SUGGEST_KEY, Object.fromEntries(keep.map((k) => [k, all[k]])));
}

/** The profile fields a suggestion is written from, as one string (see `saveSuggestion`). */
export function profileSig(p: { name: string | null; niche: string | null; platform: string | null; goal: string | null; level: string | null }) {
  return [p.name, p.niche, p.platform, p.goal, p.level].map((v) => v ?? "").join("|");
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
