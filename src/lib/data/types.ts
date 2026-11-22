import type { AudioStats } from "@/lib/analysis/audio";
import type { Analysis } from "@/lib/analysis/score";

/**
 * The part of a take's report that lists, trends and baselines use. The transcript, voice
 * timeline and face details stay on the take's own page, so listing 90 takes stays small.
 */
export type AnalysisSummary = Pick<Analysis, "version" | "overall" | "parts" | "yap" | "confidence"> & {
  audio: Pick<AudioStats, "pitchRange" | "loudnessRange"> | null;
};

/** Cuts a full report down to its summary. */
export function summarise(a: Analysis | null | undefined): AnalysisSummary | null {
  if (!a) return null;
  return {
    version: a.version,
    overall: a.overall,
    parts: a.parts,
    yap: a.yap,
    confidence: a.confidence,
    audio: a.audio ? { pitchRange: a.audio.pitchRange, loudnessRange: a.audio.loudnessRange } : null,
  };
}
import type { Goal, Level, Prompt } from "@/lib/yap";

export type Media = "video" | "audio";

export type Profile = {
  /** The account id (Supabase). Demo profiles have none. */
  id?: string;
  display_name: string | null;
  niche: string | null;
  platform: string | null;
  confidence: number | null;
  level: Level | null;
  goal: Goal | null;
  track_start_date: string | null;
  onboarded_at: string | null;
  /** When the user plans to yap: "morning" | "midday" | "evening". Used for reminders. */
  yap_time: string | null;
};

export type Onboarding = Pick<Profile, "display_name" | "niche" | "platform" | "confidence" | "level" | "goal" | "yap_time">;

export type Feedback = {
  /** Estimated on the phone today; exact once transcripts arrive. */
  words_per_minute: number | null;
  /** From the on-device transcript (filler-word check); null when it didn't run. */
  filler_count: number | null;
  filler_words: Record<string, number>;
  tips: string[];
  /** On-device measurements: Yap score, sub-scores, raw stats. */
  analysis?: Analysis | null;
};

export type YapSummary = {
  id: string;
  title: string;
  local_date: string;
  duration_seconds: number;
  media: Media;
  /** From feedback, when it's ready. Used for progress trends. */
  filler_count: number | null;
  words_per_minute: number | null;
  /** Yap score (0-100) from on-device analysis. */
  score: number | null;
  /** The report's summary, for baselines, trends and "since day 1" (null if none). */
  analysis?: AnalysisSummary | null;
  /** Deleted by the user: the clip is gone, but it still counts for XP, streaks and the daily limit. */
  deleted?: boolean;
};

export type YapDetail = { url: string | null; media: Media; title: string; local_date: string; feedback: Feedback | null; /** For "try the drill" on the same day's prompt. */ prompt_id?: number | null };

export class DailyLimitError extends Error {
  constructor() {
    super("You've used your 3 yaps for today.");
  }
}

/** Everything the screens need. Demo and Supabase both implement this. */
export interface DataApi {
  /** null when nobody is signed in. */
  getProfile(): Promise<Profile | null>;
  saveOnboarding(fields: Onboarding, trackStart: string): Promise<void>;
  getPrompts(level: Level, goal: Goal): Promise<Prompt[]>;
  getPromptById(id: number): Promise<Prompt | null>;
  getTodayStats(today: string): Promise<{ streak: number; usedToday: number }>;
  /** Throws DailyLimitError after 3 yaps on `localDate`. */
  saveYap(input: { prompt: Prompt; media: Media; blob: Blob; seconds: number; localDate: string; analysis?: Analysis | null }): Promise<{ id: string }>;
  getYap(id: string): Promise<YapDetail | null>;
  /** Saved yaps, newest first. `includeDeleted` adds deleted ones (for XP, streaks and the daily limit). */
  listYaps(opts?: { includeDeleted?: boolean }): Promise<YapSummary[]>;
  deleteYap(id: string): Promise<void>;
  signOut(): Promise<void>;
}
