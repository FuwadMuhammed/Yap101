"use client";

import { ChevronDown, Dumbbell, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Ring } from "@/components/yap/stats";
import { YapLink } from "@/components/yap/yap-button";
import type { Analysis } from "@/lib/analysis/score";
import type { Band, Group, YapScore } from "@/lib/analysis/yapscore";
import type { YapSummary } from "@/lib/data";
import { cn } from "@/lib/utils";

// The v2 results screen: show less than we measure. One number, one win, two fixes (each with
// a drill), four group bars; the 16 parameters and the voice timeline are one tap away.

const BAND_BG: Record<Band, string> = { green: "bg-mint", amber: "bg-sun", red: "bg-yap" };
const BAND_WORD: Record<Band, string> = { green: "On target", amber: "Nearly there", red: "Work on this" };
const ringColor = (n: number) => (n >= 80 ? "#74c08d" : n >= 60 ? "#f7c04a" : "#f08a5d");

type Props = { analysis: Analysis & { yap: YapScore }; history: YapSummary[]; yapId: string; localDate: string; promptId: number | null };

/** Score change since the previous day's last yap and since the very first scored yap. */
function changes(history: YapSummary[], yapId: string, localDate: string, overall: number) {
  const scored = history.filter((y) => y.score !== null && y.id !== yapId);
  const earlierDays = scored.filter((y) => y.local_date < localDate); // newest first
  const yesterday = earlierDays[0]?.score ?? null;
  const dayOne = scored.length ? scored[scored.length - 1].score : null;
  return { sinceYesterday: yesterday === null ? null : overall - yesterday, sinceDayOne: dayOne === null ? null : overall - dayOne };
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Why a whole group has no score, in words. */
function missingText(y: YapScore, g: Group) {
  const why = new Set(y.params.filter((p) => p.group === g).map((p) => p.missing));
  if (why.has("off")) return "Off in your settings";
  if (why.has("camera")) return g === "presence" ? "Audio-only take, or the camera check couldn't load" : "Needs the camera";
  if (g === "presence") return "We couldn't see your face";
  return "Not enough speech to measure";
}

export function YapReport({ analysis, history, yapId, localDate, promptId }: Props) {
  const y = analysis.yap;
  const c = analysis.confidence;
  const { sinceYesterday, sinceDayOne } = changes(history, yapId, localDate, y.overall);
  const firstTakes = y.takeNumber <= 7;
  const harsher = c && c.predicted !== null && c.observed !== null ? c.predicted - c.observed : null;
  const drillHref = (key: string) => (promptId ? `/record?prompt=${promptId}&drill=${key}` : `/home`);
  const unmeasured = y.params.filter((p) => !p.measured && p.missing === "transcript");

  return (
    <>
      {/* 1. The Yap score, with the change since yesterday and since day 1. */}
      <section className="bg-ink relative overflow-hidden rounded-[32px] p-5 text-white">
        <div className="flex items-center gap-5">
          <Ring value={y.overall / 100} label={<span className="font-display text-[32px]">{y.overall}</span>} color={ringColor(y.overall)} className="size-24 shrink-0 [&_circle:first-child]:stroke-white/15" />
          <div className="min-w-0">
            <p className="text-sm text-white/60">Yap score</p>
            <p className="font-display text-[26px]">{analysis.verdict}</p>
            {firstTakes ? (
              <p className="mt-1 text-sm font-semibold text-white/80">
                Take {y.takeNumber} of your first 7{sinceDayOne !== null ? ` · ${signed(sinceDayOne)} vs your day 1` : " · this is your day-1 baseline"}
              </p>
            ) : (
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm font-semibold">
                {sinceYesterday !== null && (
                  <span className={cn("inline-flex items-center gap-1", sinceYesterday >= 0 ? "text-mint-soft" : "text-sun")}>
                    {sinceYesterday >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                    {signed(sinceYesterday)} since yesterday
                  </span>
                )}
                {sinceDayOne !== null && <span className="text-white/80">{signed(sinceDayOne)} since day 1</span>}
              </p>
            )}
          </div>
        </div>

        {/* 2. Confidence: tracked next to the score, never inside it. */}
        {c && (c.fearBefore !== null || harsher !== null) && (
          <p className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm">
            {c.fearBefore !== null && (c.fearAfter !== null ? `Nerves ${c.fearBefore} → ${c.fearAfter}` : `Nerves before: ${c.fearBefore}`)}
            {c.fearBefore !== null && harsher !== null && " · "}
            {harsher !== null && (harsher > 0 ? `You rated yourself ${harsher} point${harsher === 1 ? "" : "s"} harsher than the tape.` : harsher < 0 ? "You looked a bit more nervous than you expected. That's normal." : "You judged yourself spot on.")}
          </p>
        )}

        {/* 5. Four group bars, coloured by band. */}
        <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
          {y.groups.map((g) => (
            <li key={g.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">{g.label}</span>
                <span className="tabular-nums text-white/80">{g.score ?? "–"}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`${g.label} ${g.score ?? "not measured"}`} aria-valuenow={g.score ?? 0} aria-valuemin={0} aria-valuemax={100}>
                {g.score !== null && g.band && <div className={cn("h-full rounded-full", BAND_BG[g.band])} style={{ width: `${Math.max(4, g.score)}%` }} />}
              </div>
              {g.score === null && <p className="mt-0.5 text-xs text-white/50">{missingText(y, g.key)}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-white/50">Week {y.week} weighting: {(Object.entries(y.weights) as [Group, number][]).map(([g, w]) => `${y.groups.find((x) => x.key === g)!.label} ${Math.round(w)}%`).join(" · ")}</p>
      </section>

      {/* 3. One win. */}
      {y.win && (
        <section className="bg-mint-soft flex items-start gap-3 rounded-[28px] p-4">
          <span className="bg-mint grid size-9 shrink-0 place-items-center rounded-full"><Sparkles className="size-4" /></span>
          <div>
            <p className="text-stone text-sm font-semibold">{y.win.kind === "improved" ? "Your win" : "Your strength"}</p>
            <p className="mt-0.5 leading-snug">{y.win.text}</p>
          </div>
        </section>
      )}

      {/* 4. Two fixes, each tied to a drill. */}
      {y.fixes.length > 0 && (
        <section className="bg-grape rounded-[32px] p-2.5">
          <p className="px-3 pt-2 pb-3 font-display text-[22px]">{y.fixes.length === 1 ? "One thing to try" : "Two things to try"}</p>
          <ol className="flex flex-col gap-2">
            {y.fixes.map((f) => (
              <li key={f.key} className="rounded-[22px] bg-white p-4">
                <p className="font-semibold leading-snug">{f.tip}</p>
                <p className="text-stone mt-1 text-sm leading-snug">{f.happened} {f.why}</p>
                <YapLink href={drillHref(f.drill.key)} variant="mist" size="sm" className="mt-3">
                  <Dumbbell /> Drill: {f.drill.name}
                </YapLink>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 6. Everything we measured, one tap away. */}
      <details className="surface group rounded-[28px] p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
          See details: all 16 measures
          <ChevronDown className="size-5 transition-transform group-open:rotate-180" />
        </summary>
        {(["hook", "voice", "presence", "structure"] as Group[]).map((g) => (
          <div key={g} className="mt-4">
            <p className="text-stone text-xs font-bold tracking-wide uppercase">{y.groups.find((x) => x.key === g)!.label}</p>
            <ul className="mt-1 divide-y divide-[#eef0f3]">
              {y.params.filter((p) => p.group === g).map((p) => (
                <li key={p.key} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{p.label}{!p.scored && p.measured && <span className="text-stone font-normal"> · not scored</span>}</p>
                    <p className="text-stone text-sm">{p.display}</p>
                  </div>
                  {p.band ? (
                    <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", BAND_BG[p.band])}>{BAND_WORD[p.band]}</span>
                  ) : (
                    <span className="bg-mist text-stone mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">{p.missing === "transcript" ? "Coming soon" : "Not measured"}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {analysis.audio && analysis.audio.timeline.length > 4 && <VoiceTimeline points={analysis.audio.timeline} />}
        {unmeasured.length > 0 && (
          <p className="text-stone mt-4 text-xs leading-snug">
            {unmeasured.map((p) => p.label).join(", ")} need speech recognition, which isn&apos;t switched on yet, so they&apos;re left out of your score for now.
          </p>
        )}
        {y.personalBaseline && <p className="text-stone mt-2 text-xs">Pitch and energy are compared with your own first takes, not other people.</p>}
      </details>
    </>
  );
}

/** Pitch and loudness over the clip: two lines, one panel each, sharing the time axis. */
function VoiceTimeline({ points }: { points: { t: number; st: number | null; db: number | null }[] }) {
  const W = 300, H = 56;
  const end = points[points.length - 1].t || 1;
  const line = (vals: (number | null)[]) => {
    const xs = vals.filter((v): v is number => v !== null);
    if (xs.length < 3) return null;
    const lo = Math.min(...xs), hi = Math.max(...xs), span = hi - lo || 1;
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = vals[i];
      if (v === null) return void (pen = false);
      d += `${pen ? "L" : "M"}${((p.t / end) * W).toFixed(1)} ${(H - 4 - ((v - lo) / span) * (H - 8)).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const pitch = line(points.map((p) => p.st));
  const loud = line(points.map((p) => p.db));
  return (
    <div className="mt-5">
      <p className="text-stone text-xs font-bold tracking-wide uppercase">Your voice over the clip</p>
      {[["Pitch", pitch, "#a993f2"], ["Loudness", loud, "#f08a5d"]].map(([label, d, color]) =>
        d ? (
          <div key={label as string} className="mt-2">
            <p className="text-stone text-xs">{label}</p>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-14 w-full" role="img" aria-label={`${label} over the clip`} preserveAspectRatio="none">
              <path d={d as string} fill="none" stroke={color as string} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        ) : null,
      )}
      <div className="text-stone flex justify-between text-[11px]"><span>0 s</span><span>{Math.round(end)} s</span></div>
    </div>
  );
}
