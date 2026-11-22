"use client";

import type { ScorePrefs } from "@/lib/analysis/yapscore";

// Yap score settings chosen on the profile page. Kept on this device for now; they only change
// how a take is scored and which tips show, so nothing sensitive is stored.

const KEY = "yap101-score-prefs";

export function loadScorePrefs(): ScorePrefs {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const o = v as Record<string, unknown>;
    return { appearanceSensitive: o.appearanceSensitive === true, noEyeContact: o.noEyeContact === true, nonNative: o.nonNative === true, transcribe: o.transcribe !== false };
  } catch {
    return {};
  }
}

export function saveScorePrefs(p: ScorePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the setting lasts for this visit only */
  }
}

/** The last answer to "How nervous are you?", to pre-fill the slider. */
const FEAR_KEY = "yap101-last-fear";
export function lastFear(): number | null {
  try {
    const n = Number(localStorage.getItem(FEAR_KEY));
    return localStorage.getItem(FEAR_KEY) !== null && n >= 0 && n <= 10 ? n : null;
  } catch {
    return null;
  }
}
export function rememberFear(n: number) {
  try {
    localStorage.setItem(FEAR_KEY, String(n));
  } catch {
    /* fine */
  }
}
