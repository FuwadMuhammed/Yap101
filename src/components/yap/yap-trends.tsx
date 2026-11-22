"use client";

import { useState } from "react";
import { Sparkline } from "@/components/yap/sparkline";
import type { Group, ScorePrefs } from "@/lib/analysis/yapscore";
import { GROUP_LABELS } from "@/lib/analysis/yapscore";
import type { YapSummary } from "@/lib/data";
import { loadScorePrefs, saveScorePrefs } from "@/lib/score-prefs";
import { cn } from "@/lib/utils";

// Weekly view of progress: the Yap score and pre-recording nerves on one chart (comfort rising),
// each group against the user's own day 1, and day 1 next to the latest take. Never a ranking
// against other people: that recreates the judgement users came here to escape.

const GROUPS: Group[] = ["hook", "voice", "presence", "structure"];

export function YapTrends({ yaps }: { yaps: YapSummary[] }) {
  const takes = [...yaps].reverse().filter((y) => y.score !== null); // oldest first
  const v2 = takes.filter((y) => y.analysis?.yap);
  if (takes.length < 2) return <p className="text-stone mt-1 text-sm">Do two yaps to see your trend.</p>;

  const scores = takes.map((y) => y.score!);
  const fear = takes.map((y) => y.analysis?.confidence?.fearBefore ?? null);
  const hasFear = fear.filter((f) => f !== null).length >= 2;
  const W = 300, H = 90;
  const x = (i: number) => (takes.length === 1 ? W / 2 : (i / (takes.length - 1)) * (W - 8) + 4);
  const y = (v: number) => H - 6 - (v / 100) * (H - 12);
  const path = (vals: (number | null)[], scale = 1) => {
    let d = "", pen = false;
    vals.forEach((v, i) => {
      if (v === null) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v * scale).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const first = v2[0]?.analysis?.yap, last = v2[v2.length - 1]?.analysis?.yap;

  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label={`Yap score went from ${scores[0]} to ${scores[scores.length - 1]}${hasFear ? "; nerves before recording shown too" : ""}`} preserveAspectRatio="none">
        <path d={path(scores)} fill="none" stroke="#f08a5d" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hasFear && <path d={path(fear, 10)} fill="none" stroke="#6fb3ec" strokeWidth="2" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="text-stone mt-1 flex flex-wrap gap-x-4 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-[#f08a5d]" /> Yap score: {scores[0]} → {scores[scores.length - 1]}</span>
        {hasFear && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-[#6fb3ec]" /> Nerves before recording (0–10): {fear.find((f) => f !== null)} → {[...fear].reverse().find((f) => f !== null)}</span>}
      </div>

      {v2.length >= 2 && first && last && (
        <>
          <p className="text-stone mt-4 text-xs font-bold tracking-wide uppercase">Each group vs your day 1</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2">
            {GROUPS.map((g) => {
              const vals = v2.map((t) => t.analysis!.yap!.groups.find((x) => x.key === g)?.score ?? null).filter((v): v is number => v !== null);
              return (
                <li key={g}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold">{GROUP_LABELS[g]}</span>
                    <span className="text-stone tabular-nums">{vals.length ? `${vals[0]} → ${vals[vals.length - 1]}` : "–"}</span>
                  </div>
                  {vals.length >= 2 && <Sparkline values={vals} className="h-8 w-full" label={`${GROUP_LABELS[g]} from ${vals[0]} to ${vals[vals.length - 1]}`} />}
                </li>
              );
            })}
          </ul>

          <p className="text-stone mt-4 text-xs font-bold tracking-wide uppercase">Day 1 vs now</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {[["Your day 1", first, v2[0]], ["Latest", last, v2[v2.length - 1]]].map(([label, s, t]) => {
              const sc = s as typeof first;
              return (
                <div key={label as string} className="bg-mist rounded-[20px] p-3">
                  <p className="text-stone text-xs">{label as string} · {(t as YapSummary).local_date}</p>
                  <p className="font-display text-[28px] leading-tight">{sc!.overall}</p>
                  <ul className="mt-1 text-xs">
                    {sc!.groups.map((g) => <li key={g.key} className="flex justify-between"><span>{g.label}</span><span className="tabular-nums">{g.score ?? "–"}</span></li>)}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** The opt-ins from the Yap score spec, kept on this device. */
export function ScoreSettings() {
  const [prefs, setPrefs] = useState<ScorePrefs>(() => (typeof window === "undefined" ? {} : loadScorePrefs()));
  // The filler check is on unless turned off; the others are off unless turned on.
  const on = (k: keyof ScorePrefs) => (k === "transcribe" ? prefs[k] !== false : Boolean(prefs[k]));
  const toggle = (k: keyof ScorePrefs) => {
    const next = { ...prefs, [k]: !on(k) };
    setPrefs(next);
    saveScorePrefs(next);
  };
  const rows: [keyof ScorePrefs, string, string][] = [
    ["transcribe", "Filler-word check (beta)", "Listens back on your phone with a free speech model (about 80 MB, downloaded once). Nothing is uploaded."],
    ["appearanceSensitive", "Appearance-sensitive mode", "No face measures (gaze, smile, framing, lighting) in your score or tips."],
    ["noEyeContact", "Don't score eye contact", "Leaves lens connection out; the rest of Presence still counts."],
    ["nonNative", "I'm not a native speaker", "Pauses are scored more gently."],
  ];
  return (
    <ul className="flex flex-col gap-2">
      {rows.map(([k, title, hint]) => (
        <li key={k}>
          <button role="switch" aria-checked={on(k)} onClick={() => toggle(k)} className="tap flex w-full items-start justify-between gap-3 text-left">
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="text-stone block text-sm">{hint}</span>
            </span>
            <span className={cn("mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors", on(k) ? "bg-ink" : "bg-mist")}>
              <span className={cn("size-5 rounded-full bg-white shadow transition-transform", on(k) && "translate-x-5")} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
