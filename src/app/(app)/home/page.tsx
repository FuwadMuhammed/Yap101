"use client";

import { ChevronRight, Dices, Gift, Lightbulb, Play, Snowflake, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MascotSays, Yapper, YapperAvatar, yapperAt } from "@/components/brand/mascot";
import { TopBar } from "@/components/yap/app-shell";
import { Bar, Chip, Flame, Ring } from "@/components/yap/stats";
import { personalize, visiblePoints, weekFor } from "@/lib/curriculum";
import { api } from "@/lib/data";
import { labelFor, NICHES } from "@/lib/options";
import { LEVELS, XP } from "@/lib/game";
import { useGame } from "@/lib/use-game";
import { cn } from "@/lib/utils";
import { DAILY_LIMIT, pickPrompt, type Prompt } from "@/lib/yap";

const MILESTONES = new Set([7, 14, 21, 30]);
// Prompt card colour rotates by day; each pairs with a Yapper that reads on it.
const CARD = [
  { bg: "bg-sky", y: { shape: "blob" as const, color: "#ffffff" } },
  { bg: "bg-yap", y: { shape: "bubble" as const, color: "#ffffff" } },
  { bg: "bg-grape", y: { shape: "scallop" as const, color: "#ffffff" } },
  { bg: "bg-mint", y: { shape: "bean" as const, color: "#ffffff" } },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning," : h < 18 ? "Good afternoon," : "Good evening,";
}

export default function Today() {
  const { profile, game, day, track, yaps, loading } = useGame();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [skip, setSkip] = useState(0);
  const [hello, setHello] = useState("Hey there,");

  useEffect(() => {
    const t = setTimeout(() => setHello(greeting()), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!profile?.level || !profile.goal) return;
    const niche = labelFor(NICHES, profile.niche)?.label;
    api.getPrompts(profile.level, profile.goal).then((t) => setPrompts(t.map((p) => personalize(p, niche))));
  }, [profile?.level, profile?.goal, profile?.niche]);

  if (loading) return <MascotSays mood="think" className="mt-10">Getting your yap ready…</MascotSays>;
  const firstName = profile?.display_name?.split(" ")[0];

  const prompt = pickPrompt(prompts, day, skip);
  const left = DAILY_LIMIT - game.todayCount;
  const href = prompt && left > 0 ? `/record?prompt=${prompt.id}` : null;
  const card = game.dailyGoalMet ? { bg: "bg-ink", y: { shape: "bubble" as const, color: "#ff6b2c" } } : CARD[(day - 1) % CARD.length];
  const earned = game.badges.filter((b) => b.earned).length;
  const doneDays = track.filter((s) => s === "done").length;
  const nextMilestone = [7, 14, 21, 30].find((m) => m >= day);

  return (
    <>
      <TopBar
        title={firstName && firstName !== "Demo" ? `${hello.replace(",", "")}, ${firstName}` : hello}
        sub={game.dailyGoalMet ? "You yapped today. Nice work!" : "Ready for today's yap?"}
        right={
          <>
            <Link href="/profile" aria-label={`${earned} badges`}>
              <Chip tone="sun"><Gift className="size-5" strokeWidth={2.2} />{earned}</Chip>
            </Link>
            <Chip label={`Day streak${game.freezes ? ` · ${game.freezes} streak freeze${game.freezes > 1 ? "s" : ""}` : ""}`}>
              <Flame lit={game.streak > 0} />
              {game.streak}
              {game.freezes > 0 && (
                <span className="text-sky ml-0.5 flex items-center text-sm"><Snowflake className="size-3.5" />{game.freezes}</span>
              )}
            </Chip>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Week strip */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {game.week.map((d, i) => {
              const y = yapperAt(i);
              const yap = d.done ? yaps.find((x) => x.local_date === d.date) : undefined;
              const tile = (
                <>
                  <span
                    className={cn(
                      "grid aspect-square w-full max-w-14 place-items-center rounded-[14px] transition-colors",
                      !d.done && (d.frozen ? "bg-sky-soft" : d.isFuture ? "bg-[#ecebe7]" : "bg-line"),
                    )}
                    style={d.done ? { background: y.color } : undefined}
                  >
                    {d.frozen ? (
                      <Snowflake className="text-sky size-5" />
                    ) : (
                      <Yapper shape="square" color="transparent" mood={d.done || d.isFuture ? "happy" : "sleepy"} className={cn("size-[92%]", !d.done && "opacity-30")} />
                    )}
                  </span>
                  <span className="text-[13px] leading-none">{d.label}</span>
                  <span className="text-lg leading-none font-bold">{d.dayNum}</span>
                </>
              );
              const cls = cn("flex flex-col items-center gap-1.5 rounded-[18px] py-2", d.isToday && "bg-mist");
              return yap ? (
                <Link key={d.date} href={`/feedback/${yap.id}`} className={cn(cls, "tap hover:bg-mist")} aria-label={`${d.label} ${d.dayNum}: open your yap`}>
                  {tile}
                </Link>
              ) : (
                <div key={d.date} className={cls} aria-label={`${d.label} ${d.dayNum}${d.frozen ? ": streak freeze used" : ""}`}>
                  {tile}
                </div>
              );
            })}
          </div>

          {/* Today's yap */}
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-extrabold">Today&apos;s yap</h2>
            <Ring value={game.todayCount / DAILY_LIMIT} label={game.todayCount} />
            <span className="text-stone ml-auto text-sm">{left > 0 ? `${left} of ${DAILY_LIMIT} left` : "All done"}</span>
          </div>

          <section className={cn(card.bg, "relative min-h-[260px] overflow-hidden rounded-[32px] p-6 text-white sm:p-7")}>
            <p className="text-sm font-semibold text-white/70">
              {game.dailyGoalMet ? "✓ Daily goal done" : `Day ${day} of 30 · ${weekFor(day).theme}`}
            </p>
            <h3 key={prompt?.id} className="animate-rise mt-2 max-w-[72%] text-[30px] leading-[1.08] font-bold sm:text-4xl">
              {prompt?.title ?? "No prompt yet"}
            </h3>
            <ul className="mt-3 max-w-[62%] space-y-1 text-[15px] text-white/80">
              {prompt && visiblePoints(prompt.talking_points, profile?.level).map((t) => <li key={t}>{t}</li>)}
            </ul>
            {prompt && (
              <p className="mt-4 inline-flex max-w-[80%] items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold">
                {prompt.milestone ? <Star className="size-4 shrink-0 fill-current" /> : <Lightbulb className="size-4 shrink-0" />}
                <span className="truncate">{prompt.milestone ? "Milestone · " : "Skill · "}{prompt.skill}</span>
              </p>
            )}
            <div className="relative z-10 mt-6 flex items-center gap-2">
              {href ? (
                <Link href={href} className="tap flex h-13 items-center gap-2 rounded-full bg-white px-6 font-semibold text-ink">
                  <Play className="size-4 fill-current" /> {game.dailyGoalMet ? "Yap again" : "Start yapping"}
                </Link>
              ) : (
                <span className="flex h-13 items-center rounded-full bg-white/15 px-6 font-semibold">See you tomorrow</span>
              )}
              <button onClick={() => setSkip((s) => s + 1)} className="tap grid size-13 place-items-center rounded-full bg-white/20 hover:bg-white/30" aria-label="Shuffle prompt" disabled={!prompt}>
                <Dices className="size-5" />
              </button>
            </div>
            <Yapper
              shape={card.y.shape}
              color={card.y.color}
              mood={game.dailyGoalMet ? "cheer" : "talk"}
              className="animate-float pointer-events-none absolute top-8 -right-5 size-28 sm:size-36"
            />
          </section>
          <p className="text-stone -mt-2 text-sm">
            +{XP.base} XP per yap · +{XP.fullMinute} for 45 s or more{!game.dailyGoalMet && ` · +${XP.dailyGoal} first yap of the day`}
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {/* 30-day track */}
          <Link href="/track" className="bg-mint tap block rounded-[32px] p-6 text-white" aria-label="Open your 30-day track">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">30-day track</h2>
              <span className="flex items-center gap-1 font-semibold text-white/85">{doneDays}/30 <ChevronRight className="size-5" /></span>
            </div>
            <div className="mt-4 grid grid-cols-10 gap-1.5">
              {track.map((s, i) => {
                const n = i + 1;
                return (
                  <span
                    key={n}
                    title={`Day ${n}`}
                    className={cn(
                      "grid aspect-square place-items-center rounded-full",
                      s === "done" && "bg-white",
                      s === "today" && "bg-white/35 ring-2 ring-white",
                      s === "missed" && "bg-black/15",
                      s === "frozen" && "bg-sky-soft",
                      s === "locked" && "bg-white/20",
                    )}
                  >
                    {MILESTONES.has(n) && s !== "done" && <Star className="size-2.5 fill-white text-white" />}
                    {MILESTONES.has(n) && s === "done" && <Star className="text-mint size-2.5 fill-current" />}
                  </span>
                );
              })}
            </div>
            {nextMilestone && (
              <p className="mt-4 text-sm text-white/85">
                ⭐ Reward on day {nextMilestone} · {nextMilestone === day ? "that's today!" : `${nextMilestone - day} day${nextMilestone - day === 1 ? "" : "s"} away`}
              </p>
            )}
          </Link>

          {/* Level */}
          <Link href="/profile" className="surface tap flex items-center gap-4 rounded-[28px] p-4">
            <YapperAvatar index={game.level} className="size-14" />
            <div className="min-w-0 flex-1">
              <p className="text-stone text-sm">Level {game.level}</p>
              <p className="font-display text-xl font-bold">{game.levelTitle}</p>
              <Bar value={game.levelProgress} className="mt-2" />
            </div>
            <div className="text-right">
              <p className="font-bold">{game.xp} XP</p>
              <p className="text-stone text-xs">{game.nextLevelAt ? `${game.nextLevelAt - game.xp} to ${LEVELS[game.level]?.title}` : "Max"}</p>
            </div>
          </Link>

          {/* Badges */}
          <Link href="/profile" className="surface tap rounded-[28px] p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold">Badges</p>
              <p className="text-stone text-sm">{earned}/{game.badges.length}</p>
            </div>
            <div className="mt-3 flex gap-2 overflow-hidden">
              {game.badges.slice(0, 6).map((b) => (
                <span key={b.id} className={cn("grid size-11 shrink-0 place-items-center rounded-full text-xl", b.earned ? b.color : "bg-mist opacity-50 grayscale")}>
                  {b.emoji}
                </span>
              ))}
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
