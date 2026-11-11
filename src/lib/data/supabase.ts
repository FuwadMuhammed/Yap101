"use client";

import { createClient } from "@/lib/supabase/client";
import type { Prompt } from "@/lib/yap";
import { DailyLimitError, type DataApi } from "./types";

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
    const { data } = await createClient().from("prompts").select(PROMPT_COLS).eq("id", id).single();
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
    // On-device analysis is saved straight away. Transcript-based feedback (filler words,
    // AI tips) will update this row from a server route later.
    if (analysis)
      await sb.from("feedback").insert({
        yap_id: data.id,
        user_id: auth.user.id,
        words_per_minute: analysis.wpm,
        tips: analysis.tips,
        score: analysis.overall,
        analysis,
      });
    return { id: data.id };
  },

  async getYap(id) {
    const sb = createClient();
    const { data: yap } = await sb.from("yaps").select("storage_path, media, local_date, title").eq("id", id).single();
    if (!yap) return null;
    const [{ data: signed }, { data: feedback }] = await Promise.all([
      sb.storage.from("yaps").createSignedUrl(yap.storage_path, 3600),
      sb.from("feedback").select("*").eq("yap_id", id).maybeSingle(),
    ]);
    const title = yap.title ?? "Yap";
    return { url: signed?.signedUrl ?? null, media: yap.media, title, local_date: yap.local_date, feedback };
  },

  async listYaps() {
    const { data } = await createClient()
      .from("yaps")
      .select("id, local_date, duration_seconds, media, title, feedback(filler_count, words_per_minute, score)")
      .order("created_at", { ascending: false });
    return (data ?? []).map((r) => ({
      id: r.id,
      local_date: r.local_date,
      duration_seconds: r.duration_seconds,
      media: r.media,
      title: r.title ?? "Yap",
      filler_count: (r.feedback as unknown as { filler_count: number } | null)?.filler_count ?? null,
      words_per_minute: (r.feedback as unknown as { words_per_minute: number } | null)?.words_per_minute ?? null,
      score: (r.feedback as unknown as { score: number | null } | null)?.score ?? null,
    }));
  },

  async deleteYap(id) {
    const sb = createClient();
    const { data } = await sb.from("yaps").select("storage_path").eq("id", id).single();
    if (data) await sb.storage.from("yaps").remove([data.storage_path]);
    const { error } = await sb.from("yaps").delete().eq("id", id);
    if (error) throw error;
  },

  async signOut() {
    await createClient().auth.signOut();
  },
};
