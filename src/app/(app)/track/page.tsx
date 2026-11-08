"use client";

import { Check, ChevronLeft, Lock, Snowflake, Star, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/yap/app-shell";
import { PageSkeleton } from "@/components/yap/skeleton";
import { personalize, WEEKS } from "@/lib/curriculum";
import { api } from "@/lib/data";
import { shiftDay } from "@/lib/game";
import { labelFor, NICHES } from "@/lib/options";
import { useGame } from "@/lib/use-game";
import { cn } from "@/lib/utils";
import { DAILY_LIMIT, type Prompt } from "@/lib/yap";

// Purple and yellow need dark text for contrast; the others take white.
const WEEK_BG = ["bg-sky text-white", "bg-yap text-white", "bg-grape text-ink", "bg-mint text-white", "bg-ink text-white"];

export default function Track() {
  const { profile, track, yaps, day, game, loading } = useGame();
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    if (!profile?.level || !profile.goal) return;
    const niche = labelFor(NICHES, profile.niche)?.label;
    api.getPrompts(profile.level, profile.goal).then((t) => setPrompts(t.map((p) => personalize(p, niche))));
  }, [profile?.level, profile?.goal, profile?.niche]);

  if (loading || !profile?.track_start_date) return <PageSkeleton rows={6} />;
  const start = profile.track_start_date;
  const canYap = DAILY_LIMIT - game.todayCount > 0;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/home" className="text-stone mb-3 inline-flex items-center gap-1 text-sm font-semibold hover:text-ink">
        <ChevronLeft className="size-4" /> Today
      </Link>
      <TopBar title="Your 30-day track" sub={`Day ${day} of 30 · ${track.filter((s) => s === "done").length} days yapped`} />

      <div className="flex flex-col gap-5">
        {WEEKS.map((w, wi) => {
          const days = prompts.filter((p) => p.week === w.n);
          if (!days.length) return null;
          return (
            <section key={w.n} className={cn(WEEK_BG[wi], "rounded-[32px] p-2.5")}>
              <div className="px-3 pt-2 pb-3">
                <p className="text-sm font-semibold opacity-75">{w.n < 5 ? `Week ${w.n}` : "Finale"}</p>
                <p className="font-display text-2xl font-bold">{w.theme}</p>
                <p className="text-sm opacity-85">{w.blurb}</p>
              </div>
              <ol className="flex flex-col gap-2">
                {days.map((p) => {
                  const status = track[p.day_index - 1];
                  const date = shiftDay(start, p.day_index - 1);
                  const yap = yaps.find((y) => y.local_date === date);
                  const locked = status === "locked";
                  const href =
                    status === "today" && canYap ? `/record?prompt=${p.id}` : yap ? `/feedback/${yap.id}` : null;
                  const row = (
                    <div className={cn("flex items-center gap-3 rounded-full bg-white p-1.5 pr-4 text-ink", locked && "bg-white/85")}>
                      <span
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold",
                          status === "done" && "bg-mint text-white",
                          status === "today" && "bg-yap text-white",
                          status === "frozen" && "bg-sky-soft text-sky",
                          status === "missed" && "bg-mist text-stone",
                          locked && "bg-mist text-stone",
                        )}
                      >
                        {status === "done" ? <Check className="size-5" strokeWidth={3} /> : status === "frozen" ? <Snowflake className="size-5" /> : status === "missed" ? <X className="size-4" /> : locked ? <Lock className="size-4" /> : p.day_index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-stone text-xs">
                          Day {p.day_index} · {p.skill}
                          {p.milestone && " · milestone"}
                        </p>
                        <p className={cn("truncate font-semibold", locked && "blur-[5px] select-none")} aria-hidden={locked}>
                          {p.title}
                        </p>
                        {locked && <span className="sr-only">Locked until day {p.day_index}</span>}
                      </div>
                      {p.milestone && <Star className={cn("size-4 shrink-0", status === "done" ? "fill-sun text-sun" : "text-stone")} />}
                      {status === "today" && <span className="bg-yap shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white">{canYap ? "Start" : "Done"}</span>}
                    </div>
                  );
                  return <li key={p.id}>{href ? <Link href={href} className="tap block rounded-full">{row}</Link> : row}</li>;
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
