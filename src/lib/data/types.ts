import type { Goal, Level, Prompt } from "@/lib/yap";

export type Media = "video" | "audio";

export type Profile = {
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
  words_per_minute: number;
  filler_count: number;
  filler_words: Record<string, number>;
  tips: string[];
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
};

export type YapDetail = { url: string | null; media: Media; title: string; local_date: string; feedback: Feedback | null };

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
  saveYap(input: { prompt: Prompt; media: Media; blob: Blob; seconds: number; localDate: string }): Promise<{ id: string }>;
  getYap(id: string): Promise<YapDetail | null>;
  listYaps(): Promise<YapSummary[]>;
  deleteYap(id: string): Promise<void>;
  signOut(): Promise<void>;
}
