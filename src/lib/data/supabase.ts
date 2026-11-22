"use client";

import { transcriptFields } from "@/lib/analysis/transcript";
import { clearLocalScripts } from "@/lib/script";
import { createClient } from "@/lib/supabase/client";
import type { Prompt } from "@/lib/yap";
import type { Analysis } from "@/lib/analysis/score";
import { DailyLimitError, summarise, type AnalysisSummary, type DataApi, type Media } from "./types";

type FeedbackJoin = {
  filler_count: number | null;
  words_per_minute: number | null;
  score: number | null;
  /** Full select (fallback). */
  analysis?: Analysis | null;
  /** Slim select: just the parts of `analysis` that lists use (PostgREST JSON paths). */
  version?: Analysis["version"] | null;
  overall?: number | null;
  parts?: Analysis["parts"] | null;
  yap?: Analysis["yap"] | null;
  confidence?: Analysis["confidence"] | null;
  pitchRange?: number | null;
  loudnessRange?: number | null;
};

// Only what lists, trends and baselines read: the transcript and timeline stay out of the list.
// (Literal strings, so supabase-js type-checks the select syntax, JSON paths included.)
const SLIM_SELECT =
  "id, local_date, duration_seconds, media, title, deleted_at, feedback(filler_count, words_per_minute, score, version:analysis->version, overall:analysis->overall, parts:analysis->parts, yap:analysis->yap, confidence:analysis->confidence, pitchRange:analysis->audio->pitchRange, loudnessRange:analysis->audio->loudnessRange)" as const;
const FULL_SELECT = "id, local_date, duration_seconds, media, title, deleted_at, feedback(filler_count, words_per_minute, score, analysis)" as const;

function summaryOf(f: FeedbackJoin | null | undefined): AnalysisSummary | null {
  if (!f) return null;
  if (f.analysis !== undefined) return summarise(f.analysis);
  if (f.overall == null) return null; // no on-device report saved for this take
  return {
    version: f.version ?? 1,
    overall: f.overall,
    parts: f.parts ?? [],
    yap: f.yap ?? undefined,
    confidence: f.confidence ?? undefined,
    audio: f.pitchRange !== undefined || f.loudnessRange !== undefined ? { pitchRange: f.pitchRange ?? null, loudnessRange: f.loudnessRange ?? null } : null,
  };
}

const PROMPT_COLS = "id, level, goal, day_index, title, talking_points, skill, skill_tip, week, focus, milestone";
const ext = (mime: string) => (mime.includes("mp4") ? (mime.startsWith("audio") ? "m4a" : "mp4") : "webm");

export const supabaseApi: DataApi = {
  async getProfile() {
    const sb = createClient();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) return null;
    const { data } = await sb.from("profiles").select("*").eq("id", auth.user.id).single();
    return data;
  },

  async saveOnboarding(fields, trackStart) {
    const sb = createClient();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");
    const { error } = await sb
      .from("profiles")
      .update({ ...fields, track_start_date: trackStart, onboarded_at: new Date().toISOString() })
      .eq("id", auth.user.id);
    if (error) throw error;
  },

  async getPrompts(level, goal) {
    const { data } = await createClient()
      .from("prompts")
      .select(PROMPT_COLS)
      .eq("level", level)
      .eq("goal", goal)
      .eq("active", true)
      .order("day_index");
    return (data ?? []) as Prompt[];
  },

  async getPromptById(id) {
    const { data, error } = await createClient().from("prompts").select(PROMPT_COLS).eq("id", id).maybeSingle();
    // An outage is not "no such prompt": throw so the screen can say so and offer a retry.
    if (error) throw new Error(error.message || "Couldn't load today's prompt");
    return data as Prompt | null;
  },

  async getTodayStats(today) {
    const sb = createClient();
    const [{ data: streak }, { count }] = await Promise.all([
      sb.rpc("current_streak", { p_today: today }),
      sb.from("yaps").select("id", { count: "exact", head: true }).eq("local_date", today),
    ]);
    return { streak: streak ?? 0, usedToday: count ?? 0 };
  },

  async saveYap({ prompt, media, blob, seconds, localDate, analysis }) {
    const sb = createClient();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");
    const path = `${auth.user.id}/${crypto.randomUUID()}.${ext(blob.type)}`;
    const upload = await sb.storage.from("yaps").upload(path, blob, { contentType: blob.type });
    if (upload.error) throw new Error("Upload failed. Check your connection and try again.");
    const { data, error } = await sb.rpc("insert_yap", {
      p_prompt_id: prompt.id,
      p_title: prompt.title,
      p_media: media,
      p_storage_path: path,
      p_duration_seconds: Math.round(seconds * 10) / 10,
      p_local_date: localDate,
    });
    if (error) {
      await sb.storage.from("yaps").remove([path]);
      throw error.message.includes("daily limit") ? new DailyLimitError() : error;
    }
    // On-device analysis (and the on-device transcript, when the filler check ran) is saved straight away.
    if (analysis)
      await sb.from("feedback").insert({
        yap_id: data.id,
        user_id: auth.user.id,
        ...transcriptFields(analysis.transcript),
        words_per_minute: analysis.wpm,
        tips: analysis.tips,
        score: analysis.overall,
        analysis,
      });
    return { id: data.id };
  },

  async getYap(id) {
    const sb = createClient();
    const { data: yap, error } = await sb.from("yaps").select("storage_path, media, local_date, title, prompt_id").eq("id", id).is("deleted_at", null).maybeSingle();
    // A database or network failure is not "deleted": throw, so the page can offer a retry.
    if (error) throw new Error(error.message || "Couldn't load this yap");
    if (!yap) return null;
    const [{ data: signed }, { data: feedback }] = await Promise.all([
      sb.storage.from("yaps").createSignedUrl(yap.storage_path, 3600),
      sb.from("feedback").select("*").eq("yap_id", id).maybeSingle(),
    ]);
    const title = yap.title ?? "Yap";
    return { url: signed?.signedUrl ?? null, media: yap.media, title, local_date: yap.local_date, feedback, prompt_id: yap.prompt_id ?? null };
  },

  async listYaps(opts) {
    const sb = createClient();
    const live = <Q extends { is: (c: "deleted_at", v: null) => Q }>(q: Q) => (opts?.includeDeleted ? q : q.is("deleted_at", null));
    const slim = await live(sb.from("yaps").select(SLIM_SELECT).order("created_at", { ascending: false }));
    // Belt and braces: if the slim select is ever rejected, use the full one.
    const data: { id: string; local_date: string; duration_seconds: number; media: Media; title: string | null; deleted_at: string | null; feedback: unknown }[] | null = slim.error
      ? (await live(sb.from("yaps").select(FULL_SELECT).order("created_at", { ascending: false }))).data
      : slim.data;
    return (data ?? []).map((r) => {
      // One feedback row per yap; PostgREST may type the embed as an object or a one-item list.
      const f = (Array.isArray(r.feedback) ? r.feedback[0] : r.feedback) as FeedbackJoin | null | undefined;
      return {
        id: r.id,
        local_date: r.local_date,
        duration_seconds: r.duration_seconds,
        media: r.media,
        title: r.title ?? "Yap",
        filler_count: f?.filler_count ?? null,
        words_per_minute: f?.words_per_minute ?? null,
        score: f?.score ?? null,
        analysis: summaryOf(f),
        deleted: Boolean(r.deleted_at),
      };
    });
  },

  async deleteYap(id) {
    const sb = createClient();
    const { data } = await sb.from("yaps").select("storage_path").eq("id", id).single();
    if (data) await sb.storage.from("yaps").remove([data.storage_path]);
    // Soft delete: the clip and feedback go, the row stays so the limit and XP can't be gamed.
    const { error } = await sb.rpc("delete_yap", { p_id: id });
    if (error) throw error;
  },

  async signOut() {
    await createClient().auth.signOut();
    // Scripts live on the device; the next person to sign in here must not see them.
    clearLocalScripts();
  },
};
