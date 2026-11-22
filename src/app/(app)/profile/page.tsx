"use client";

import { BellRing, ChevronDown, Share, Snowflake, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { YapperAvatar } from "@/components/brand/mascot";
import { TopBar } from "@/components/yap/app-shell";
import { ReminderButton } from "@/components/yap/reminder-button";
import { PageSkeleton } from "@/components/yap/skeleton";
import { Bar, Flame } from "@/components/yap/stats";
import { YapButton } from "@/components/yap/yap-button";
import { api, isDemo } from "@/lib/data";
import { envDemo } from "@/lib/data/mode";
import { reloadTo } from "@/lib/data/mode";
import { demoBackfill, demoReset } from "@/lib/data/demo";
import { FREEZE, LEVELS } from "@/lib/game";
import { GOAL_OPTIONS, LEVEL_OPTIONS, PLATFORMS, YAP_TIMES, labelFor, nicheOptions } from "@/lib/options";
import { useGame } from "@/lib/use-game";
import { cn } from "@/lib/utils";
import { ScoreSettings, YapTrends } from "@/components/yap/yap-trends";


export default function Me() {
  const { profile, game, yaps, day, refresh, loading } = useGame();
  // iOS only lets home-screen web apps send notifications, so nudge iPhone users to install.
  const [showInstall, setShowInstall] = useState(false);
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const t = setTimeout(() => setShowInstall(ios && !standalone), 0);
    return () => clearTimeout(t);
  }, []);
  if (loading || !profile) return <PageSkeleton rows={4} />;


  const picks = nicheOptions(profile.niche);
  const nicheChip = picks[0] && { ...picks[0], value: "niche", label: picks.map((o) => o.label).join(", ") };
  const chips = [nicheChip, labelFor(PLATFORMS, profile.platform), labelFor(LEVEL_OPTIONS, profile.level), labelFor(GOAL_OPTIONS, profile.goal), labelFor(YAP_TIMES, profile.yap_time)].filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );

  const stats = [
    { value: game.streak, label: "Streak" },
    { value: game.bestStreak, label: "Best" },
    { value: game.totalYaps, label: "Yaps" },
    { value: `${game.activeDays}/30`, label: "Days" },
  ];
  const next = LEVELS[game.level];
  const earnedBadges = game.badges.filter((b) => b.earned).length;
  const time = labelFor(YAP_TIMES, profile.yap_time);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <TopBar title="Me" right={<span className="surface flex h-11 items-center gap-1.5 rounded-full px-3.5 font-bold"><Flame />{game.streak}</span>} />

      {/* Who you are: one quiet line instead of a wall of chips */}
      <section className="flex items-center gap-4 px-1">
        <YapperAvatar index={0} mood="cheer" className="size-16" />
        <div className="min-w-0">
          <p className="font-display text-[28px] leading-tight">{profile.display_name ?? "Yapper"}</p>
          <p className="text-stone truncate text-sm">{chips.slice(0, 3).map((c) => c.label).join(" · ")}</p>
          {chips[3] && <p className="text-stone truncate text-sm">Goal: {chips[3].label.toLowerCase()}</p>}
        </div>
      </section>

      {/* Stats in one card */}
      <section className="surface grid grid-cols-4 divide-x divide-line rounded-[24px] py-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-[26px] leading-none">{s.value}</p>
            <p className="text-stone mt-1 text-xs font-semibold">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Level: where you are, with the full ladder one tap away */}
      <section className="surface rounded-[24px] p-4">
        <div className="flex items-center gap-3">
          <YapperAvatar index={game.level} mood="cheer" className="size-12" />
          <div className="min-w-0 flex-1">
            <p className="text-stone text-xs font-semibold">Level {game.level} · {game.xp} XP</p>
            <p className="font-display text-[22px] leading-tight">{game.levelTitle}</p>
          </div>
          {next && <p className="text-stone text-right text-xs">{next.at - game.xp} XP to<br /><span className="text-ink font-semibold">{next.title}</span></p>}
        </div>
        {game.nextLevelAt && <Bar value={game.levelProgress} className="mt-3" />}
        <details className="group mt-3">
          <summary className="text-stone flex cursor-pointer list-none items-center gap-1 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            See all levels <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ol className="mt-2 flex flex-col">
            {LEVELS.map((l, i) => {
              const n = i + 1;
              const you = n === game.level;
              return (
                <li key={l.title} className={cn("flex items-center justify-between rounded-full px-3 py-2 text-sm", you && "bg-yap-soft font-semibold", n > game.level && "text-stone")}>
                  <span>{n}. {l.title}{you && " · you"}</span>
                  <span>{l.at} XP</span>
                </li>
              );
            })}
          </ol>
        </details>
      </section>

      {/* Yap score trend: score and nerves over the programme, each group vs day 1 */}
      <section className="surface rounded-[24px] p-4">
        <p className="font-semibold">Your progress</p>
        <YapTrends yaps={yaps} />
      </section>

      {/* How the Yap score treats you */}
      <section className="surface rounded-[24px] p-4">
        <p className="mb-3 font-semibold">Yap score settings</p>
        <ScoreSettings />
      </section>

      {/* Badges: compact, details on hover/long-press */}
      <section className="surface rounded-[24px] p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Badges</p>
          <p className="text-stone text-sm">{earnedBadges}/{game.badges.length}</p>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-y-3">
          {game.badges.map((b) => (
            <div key={b.id} className="flex flex-col items-center gap-1 text-center" title={`${b.name}: ${b.hint}`}>
              <span className={cn("grid size-12 place-items-center rounded-full text-2xl", b.earned ? b.color : "bg-mist grayscale opacity-50")}>{b.emoji}</span>
              <span className={cn("text-[11px] leading-tight font-semibold", !b.earned && "text-stone")}>{b.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Habit tools in one list */}
      <section className="surface divide-line divide-y rounded-[24px]">
        <div className="flex items-center gap-3 p-4">
          <BellRing className="size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Daily reminder</p>
            <p className="text-stone text-sm">{time ? `${time.label}, in your calendar` : "In your calendar"}</p>
          </div>
          <ReminderButton yapTime={profile.yap_time} daysLeft={31 - day} compact />
        </div>
        <div className="flex items-center gap-3 p-4">
          <Snowflake className="text-sky size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Streak freezes · {game.freezes}/{FREEZE.max}</p>
            <p className="text-stone text-sm">Earn one every {FREEZE.every}-day streak. It saves your streak if you miss a day.</p>
          </div>
        </div>
        {showInstall && (
          <div className="flex items-center gap-3 p-4">
            <Share className="size-5 shrink-0" />
            <p className="text-sm"><span className="font-semibold">Add to Home Screen:</span> Share in Safari, then &quot;Add to Home Screen&quot;.</p>
          </div>
        )}
      </section>

      <p className="text-stone flex items-center gap-1.5 px-1 text-sm">
        <Sparkles className="size-4 shrink-0" /> Coming soon: an AI coach that talks you through each take.
      </p>

      <section className="flex flex-wrap gap-2 pt-2">
        <YapButton variant="soft" onClick={async () => { await api.signOut(); reloadTo("/"); }}>Sign out</YapButton>
        {envDemo && (
          <YapButton variant="soft" onClick={async () => { demoBackfill(6); await refresh(); toast.success("Added 6 earlier days of yaps"); }}>Demo: fake a 6-day streak</YapButton>
        )}
        {isDemo && (
          <YapButton
            variant="soft"
            className="text-cherry"
            onClick={async () => {
              if (!window.confirm("Delete all your yaps, streaks and settings from this browser? This can't be undone.")) return;
              await demoReset();
              reloadTo("/");
            }}
          >
            Delete my guest data
          </YapButton>
        )}
      </section>
    </div>
  );
}
