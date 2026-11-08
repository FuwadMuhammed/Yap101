"use client";

import { DAILY_LIMIT, localDate } from "@/lib/yap";
import { ALL_PROMPTS } from "@/lib/curriculum";
import { DailyLimitError, type DataApi, type Feedback, type Media, type Profile } from "./types";

// Demo backend: JSON in localStorage, recordings in IndexedDB (too big for localStorage).
// Nothing leaves the browser.

const KEY = "yap101-demo";
type StoredYap = { id: string; prompt_id: number; title: string; skill?: string; media: Media; duration_seconds: number; local_date: string; created_at: string; feedback: Feedback | null };
type State = { signedIn: boolean; profile: Profile; yaps: StoredYap[] };

const emptyProfile: Profile = {
  display_name: "Demo yapper",
  niche: null,
  platform: null,
  confidence: null,
  level: null,
  goal: null,
  track_start_date: null,
  onboarded_at: null,
  yap_time: null,
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { signedIn: false, profile: emptyProfile, yaps: [] };
}

function save(state: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

// --- IndexedDB blob store ---
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("yap101-demo", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("clips");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function clipStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction("clips", mode).objectStore("clips"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Fake AI feedback so the feedback screen can be designed and tested. Filler words
// trend down as you practise, and one tip always matches the day's skill.
function fakeFeedback(seconds: number, practiced: number, skill?: string): Feedback {
  const r = (n: number) => Math.floor(Math.random() * n);
  const total = Math.max(0, Math.round(7 - practiced * 0.35) + r(3) - 1);
  const um = Math.ceil(total * 0.5);
  const like = Math.floor((total - um) * 0.6);
  const filler_words = { um, like, "you know": total - um - like };
  const skillTip = skill ? `Today's skill was "${skill}". ${total <= 2 ? "You nailed it, keep it up." : "Good start. Try it again tomorrow and watch the difference."}` : null;
  const pool = [
    "Strong opening. You got to the point in the first sentence.",
    seconds < 25 ? "You finished early. Add one example to fill the time." : "Good length. End with a question so viewers comment.",
    "Slow down a little on your key point so it lands.",
    "Nice energy. Keep your eyes on the lens for the whole close.",
  ].sort(() => Math.random() - 0.5);
  return {
    words_per_minute: 120 + r(45),
    filler_count: total,
    filler_words,
    tips: [skillTip ?? pool[2], pool[0], pool[1]],
  };
}

export const demoApi: DataApi = {
  async getProfile() {
    const s = load();
    return s.signedIn ? s.profile : null;
  },

  async saveOnboarding(fields, trackStart) {
    const s = load();
    s.profile = { ...s.profile, ...fields, track_start_date: trackStart, onboarded_at: new Date().toISOString() };
    save(s);
  },

  async getPrompts(level, goal) {
    return ALL_PROMPTS.filter((p) => p.level === level && p.goal === goal);
  },

  async getPromptById(id) {
    return ALL_PROMPTS.find((p) => p.id === id) ?? null;
  },

  async getTodayStats(today) {
    const { yaps } = load();
    const days = new Set(yaps.map((y) => y.local_date));
    let streak = 0;
    const cursor = new Date(`${today}T12:00:00`);
    if (!days.has(today)) cursor.setDate(cursor.getDate() - 1); // streak survives until tonight
    while (days.has(localDate(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { streak, usedToday: yaps.filter((y) => y.local_date === today).length };
  },

  async saveYap({ prompt, media, blob, seconds, localDate: day }) {
    const s = load();
    if (s.yaps.filter((y) => y.local_date === day).length >= DAILY_LIMIT) throw new DailyLimitError();
    const id = crypto.randomUUID();
    await clipStore("readwrite", (st) => st.put(blob, id));
    const practiced = s.yaps.length;
    s.yaps.unshift({ id, prompt_id: prompt.id, title: prompt.title, skill: prompt.skill, media, duration_seconds: seconds, local_date: day, created_at: new Date().toISOString(), feedback: null });
    save(s);
    // Simulate the AI taking a moment, so the "preparing" state is visible.
    setTimeout(() => {
      const later = load();
      const yap = later.yaps.find((y) => y.id === id);
      if (yap) {
        yap.feedback = fakeFeedback(seconds, practiced, prompt.skill);
        save(later);
      }
    }, 2500);
    return { id };
  },

  async getYap(id) {
    const s = load();
    const yap = s.yaps.find((y) => y.id === id);
    if (!yap) return null;
    // If the page was reloaded before the simulated AI finished, finish it now.
    if (!yap.feedback && Date.now() - Date.parse(yap.created_at) > 2500) {
      yap.feedback = fakeFeedback(yap.duration_seconds, s.yaps.length - 1 - s.yaps.indexOf(yap), yap.skill);
      save(s);
    }
    const blob = await clipStore<Blob | undefined>("readonly", (st) => st.get(id)).catch(() => undefined);
    return { url: blob ? URL.createObjectURL(blob) : null, media: yap.media, title: yap.title, local_date: yap.local_date, feedback: yap.feedback };
  },

  async listYaps() {
    return load().yaps.map(({ id, title, local_date, duration_seconds, media, feedback }) => ({
      id,
      title,
      local_date,
      duration_seconds,
      media,
      filler_count: feedback?.filler_count ?? null,
      words_per_minute: feedback?.words_per_minute ?? null,
    }));
  },

  async deleteYap(id) {
    const s = load();
    s.yaps = s.yaps.filter((y) => y.id !== id);
    save(s);
    await clipStore("readwrite", (st) => st.delete(id)).catch(() => {});
  },

  async signOut() {
    const s = load();
    s.signedIn = false;
    save(s);
  },
};

/** Demo-only: "sign in" without an account. */
export function demoSignIn() {
  const s = load();
  s.signedIn = true;
  save(s);
}

/** Demo-only: wipe everything, including recordings. */
export async function demoReset() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  await clipStore("readwrite", (st) => st.clear()).catch(() => {});
}

/** Demo-only: pretend you've yapped on the previous N days, to see a streak and a later track day. */
export function demoBackfill(days: number) {
  const s = load();
  const d = new Date();
  for (let i = 1; i <= days; i++) {
    d.setDate(d.getDate() - 1);
    const day = localDate(d);
    s.yaps.push({ id: crypto.randomUUID(), prompt_id: 0, title: "Earlier yap (sample)", media: "audio", duration_seconds: 45, local_date: day, created_at: d.toISOString(), feedback: fakeFeedback(45, days - i) });
  }
  if (s.profile.track_start_date) s.profile.track_start_date = localDate(d);
  save(s);
}
