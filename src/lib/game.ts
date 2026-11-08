import type { YapSummary } from "@/lib/data/types";
import { localDate } from "@/lib/yap";

// Gamification is derived from the yaps list, so it needs no extra tables and can't drift.

export const XP = { base: 10, fullMinute: 5, dailyGoal: 5 } as const;
export const FULL_YAP_SECONDS = 45;

export const LEVELS = [
  { at: 0, title: "Mumbler" },
  { at: 50, title: "Chatter" },
  { at: 120, title: "Talker" },
  { at: 220, title: "Storyteller" },
  { at: 350, title: "Hype Host" },
  { at: 520, title: "Yap Star" },
  { at: 750, title: "Mic Magnet" },
  { at: 1000, title: "Yap Legend" },
] as const;

export type BadgeId =
  | "first_words"
  | "camera_brave"
  | "full_minute"
  | "triple_yap"
  | "streak_3"
  | "streak_7"
  | "streak_14"
  | "yaps_10"
  | "yaps_25"
  | "graduate";

export type Badge = { id: BadgeId; name: string; hint: string; emoji: string; color: string; earned: boolean };

const BADGES: Omit<Badge, "earned">[] = [
  { id: "first_words", name: "First words", hint: "Finish your first yap", emoji: "🎤", color: "bg-yap" },
  { id: "camera_brave", name: "Camera brave", hint: "Record a yap on video", emoji: "📸", color: "bg-sky" },
  { id: "full_minute", name: "Full minute", hint: "Yap for 45 seconds or more", emoji: "⏱️", color: "bg-sun" },
  { id: "triple_yap", name: "Triple yap", hint: "Do 3 yaps in one day", emoji: "🔁", color: "bg-berry" },
  { id: "streak_3", name: "On a roll", hint: "Reach a 3-day streak", emoji: "🔥", color: "bg-yap" },
  { id: "streak_7", name: "Week warrior", hint: "Reach a 7-day streak", emoji: "⚡", color: "bg-sun" },
  { id: "streak_14", name: "Unstoppable", hint: "Reach a 14-day streak", emoji: "🚀", color: "bg-berry" },
  { id: "yaps_10", name: "Ten yaps", hint: "Finish 10 yaps", emoji: "🔟", color: "bg-mint" },
  { id: "yaps_25", name: "Yap machine", hint: "Finish 25 yaps", emoji: "🤖", color: "bg-sky" },
  { id: "graduate", name: "Yap graduate", hint: "Yap on 30 different days", emoji: "🎓", color: "bg-ink" },
];

export type WeekDay = { date: string; label: string; dayNum: number; done: boolean; frozen: boolean; isToday: boolean; isFuture: boolean };

export type GameState = {
  xp: number;
  level: number;
  levelTitle: string;
  levelFloor: number;
  nextLevelAt: number | null;
  levelProgress: number; // 0–1 within the current level
  streak: number;
  bestStreak: number;
  /** Streak freezes in the bank (earned every 7-day run, max 2). */
  freezes: number;
  /** Days a freeze covered, so the week strip can show them. */
  frozenDays: string[];
  totalYaps: number;
  activeDays: number;
  todayCount: number;
  dailyGoalMet: boolean;
  week: WeekDay[];
  badges: Badge[];
};

export function xpForYap(seconds: number, firstOfDay: boolean) {
  return XP.base + (seconds >= FULL_YAP_SECONDS ? XP.fullMinute : 0) + (firstOfDay ? XP.dailyGoal : 0);
}

export function shiftDay(date: string, by: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + by);
  return localDate(d);
}

export const FREEZE = { every: 7, max: 2 } as const;

/**
 * Streaks with freezes. Walk the yap days oldest to newest: every 7 days in a run earns a
 * freeze (max 2). A single missed day between yap days uses a freeze instead of breaking
 * the run. Frozen days keep the streak alive but don't add to it.
 */
function streaks(days: Set<string>, today: string) {
  const sorted = [...days].sort();
  let run = 0;
  let best = 0;
  let freezes = 0;
  const frozen: string[] = [];
  let prev: string | null = null;
  for (const day of sorted) {
    if (prev === null || shiftDay(prev, 1) === day) {
      run++;
    } else if (shiftDay(prev, 2) === day && freezes > 0) {
      freezes--;
      frozen.push(shiftDay(prev, 1));
      run++;
    } else {
      run = 1;
      freezes = 0;
    }
    if (run % FREEZE.every === 0) freezes = Math.min(FREEZE.max, freezes + 1);
    best = Math.max(best, run);
    prev = day;
  }

  // Is the run still alive today? Today or yesterday counts; one missed day can be frozen.
  let current = 0;
  if (prev) {
    if (prev === today || prev === shiftDay(today, -1)) current = run;
    else if (prev === shiftDay(today, -2) && freezes > 0) {
      current = run;
      freezes--;
      frozen.push(shiftDay(today, -1));
    } else freezes = 0;
  }
  return { current, best, freezes, frozen };
}

export function computeGame(yaps: YapSummary[], today = localDate()): GameState {
  // Oldest first, so "first of the day" is the earliest yap on each date.
  const ordered = [...yaps].reverse();
  const seen = new Set<string>();
  let xp = 0;
  const perDay = new Map<string, number>();
  for (const y of ordered) {
    xp += xpForYap(y.duration_seconds, !seen.has(y.local_date));
    seen.add(y.local_date);
    perDay.set(y.local_date, (perDay.get(y.local_date) ?? 0) + 1);
  }

  let li = 0;
  while (li + 1 < LEVELS.length && xp >= LEVELS[li + 1].at) li++;
  const floor = LEVELS[li].at;
  const next = LEVELS[li + 1]?.at ?? null;

  const { current, best, freezes, frozen } = streaks(seen, today);

  // This calendar week, Monday to Sunday.
  const dow = (new Date(`${today}T12:00:00`).getDay() + 6) % 7; // 0 = Monday
  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(today, i - dow);
    const d = new Date(`${date}T12:00:00`);
    return {
      date,
      label: d.toLocaleDateString("en", { weekday: "short" }),
      dayNum: d.getDate(),
      done: seen.has(date),
      frozen: frozen.includes(date),
      isToday: date === today,
      isFuture: date > today,
    };
  });

  const earned: Record<BadgeId, boolean> = {
    first_words: yaps.length >= 1,
    camera_brave: yaps.some((y) => y.media === "video"),
    full_minute: yaps.some((y) => y.duration_seconds >= FULL_YAP_SECONDS),
    triple_yap: [...perDay.values()].some((n) => n >= 3),
    streak_3: best >= 3,
    streak_7: best >= 7,
    streak_14: best >= 14,
    yaps_10: yaps.length >= 10,
    yaps_25: yaps.length >= 25,
    graduate: seen.size >= 30,
  };

  return {
    xp,
    level: li + 1,
    levelTitle: LEVELS[li].title,
    levelFloor: floor,
    nextLevelAt: next,
    levelProgress: next ? (xp - floor) / (next - floor) : 1,
    streak: current,
    bestStreak: best,
    freezes,
    frozenDays: frozen,
    totalYaps: yaps.length,
    activeDays: seen.size,
    todayCount: perDay.get(today) ?? 0,
    dailyGoalMet: seen.has(today),
    week,
    badges: BADGES.map((b) => ({ ...b, earned: earned[b.id] })),
  };
}

/** What changed between two states, for the celebration screen. */
export function gameDiff(before: GameState, after: GameState) {
  return {
    xpGained: after.xp - before.xp,
    leveledUp: after.level > before.level,
    streakUp: after.streak > before.streak,
    newBadges: after.badges.filter((b) => b.earned && !before.badges.find((x) => x.id === b.id)?.earned),
  };
}

/** Status of each of the 30 days on the user's track. */
export type DayStatus = "done" | "frozen" | "missed" | "today" | "locked";
export function trackStatuses(trackStart: string, yaps: YapSummary[], today = localDate(), frozen: string[] = []): DayStatus[] {
  const days = new Set(yaps.map((y) => y.local_date));
  const iced = new Set(frozen);
  return Array.from({ length: 30 }, (_, i) => {
    const date = shiftDay(trackStart, i);
    if (date === today) return days.has(date) ? "done" : "today";
    if (date > today) return "locked";
    return days.has(date) ? "done" : iced.has(date) ? "frozen" : "missed";
  });
}
