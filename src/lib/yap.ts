export const LEVELS = ["beginner", "intermediate", "pro"] as const;
export const GOALS = ["confidence", "storytelling", "clarity", "on_camera", "hooks"] as const;
export type Level = (typeof LEVELS)[number];
export type Goal = (typeof GOALS)[number];

export type Prompt = {
  id: number;
  level: Level;
  goal: Goal;
  day_index: number;
  title: string;
  talking_points: string[];
  /** Today's micro-skill, taught before recording. */
  skill: string;
  skill_tip: string;
  week: number;
  /** Goal-specific reminder shown on every prompt. */
  focus: string;
  milestone: boolean;
};

export const DAILY_LIMIT = 3;
export const MAX_SECONDS = 60;

/** The user's calendar date (YYYY-MM-DD) in their own timezone. */
export function localDate(d = new Date()) {
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

/** Day 1–30 of the user's track, based on when they started. */
export function trackDay(trackStart: string, today = localDate()) {
  const days = Math.floor((Date.parse(today) - Date.parse(trackStart)) / 86_400_000);
  return Math.min(30, Math.max(1, days + 1));
}

/**
 * Today's prompt from a track. `skip` (shuffle) cycles back through days already unlocked,
 * never ahead: future days stay locked until their day comes.
 */
export function pickPrompt(track: Prompt[], day: number, skip = 0): Prompt | null {
  const open = unlockedPrompts(track, day);
  return open.length ? open[skip % open.length] : null;
}

/** Prompts up to and including `day`, newest first. */
export function unlockedPrompts(track: Prompt[], day: number) {
  return track.filter((p) => p.day_index <= day).sort((a, b) => b.day_index - a.day_index);
}
