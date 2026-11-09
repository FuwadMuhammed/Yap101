"use client";

import { Share, Snowflake } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { YapperAvatar } from "@/components/brand/mascot";
import { TopBar } from "@/components/yap/app-shell";
import { ReminderButton } from "@/components/yap/reminder-button";
import { PageSkeleton } from "@/components/yap/skeleton";
import { Sparkline } from "@/components/yap/sparkline";
import { Bar, Flame } from "@/components/yap/stats";
import { YapButton } from "@/components/yap/yap-button";
import { api, isDemo } from "@/lib/data";
import { reloadTo } from "@/lib/data/mode";
import { demoBackfill, demoReset } from "@/lib/data/demo";
import { FREEZE, LEVELS } from "@/lib/game";
import { GOAL_OPTIONS, LEVEL_OPTIONS, NICHES, PLATFORMS, YAP_TIMES, labelFor } from "@/lib/options";
import { useGame } from "@/lib/use-game";
import { cn } from "@/lib/utils";

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

  const fillers = [...yaps].reverse().flatMap((y) => (y.filler_count == null ? [] : [y.filler_count]));

  const chips = [labelFor(NICHES, profile.niche), labelFor(PLATFORMS, profile.platform), labelFor(LEVEL_OPTIONS, profile.level), labelFor(GOAL_OPTIONS, profile.goal), labelFor(YAP_TIMES, profile.yap_time)].filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );

  const stats = [
    { value: game.streak, label: "Day streak", bg: "bg-yap text-white" },
    { value: game.bestStreak, label: "Best streak", bg: "bg-sun" },
    { value: game.totalYaps, label: "Total yaps", bg: "bg-sky text-white" },
    { value: `${game.activeDays}/30`, label: "Days yapped", bg: "bg-grape" },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <TopBar title="Me" right={<span className="surface flex h-11 items-center gap-1.5 rounded-full px-3.5 font-bold"><Flame />{game.streak}</span>} />

      {/* Profile */}
      <section className="surface flex items-center gap-4 rounded-[28px] p-4 sm:p-5">
        <YapperAvatar index={0} mood="cheer" className="size-20" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold">{profile.display_name ?? "Yapper"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => {
              const Icon = c.icon;
              return (
                <span key={c.value} className="bg-mist flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold">
                  <Icon className="size-3.5" strokeWidth={2.4} /> {c.label}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={cn("rounded-[24px] p-4", s.bg)}>
            <p className="font-display text-3xl font-bold">{s.value}</p>
            <p className="text-sm font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Progress + streak protection */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="surface rounded-[28px] p-5">
          <p className="font-bold">Filler words per yap</p>
          {fillers.length >= 2 ? (
            <>
              <Sparkline values={fillers} className="mt-3 h-16 w-full" label={`Filler words went from ${fillers[0]} to ${fillers[fillers.length - 1]}`} />
              <p className="text-stone mt-2 text-sm">
                {fillers[0]} on your first yap → {fillers[fillers.length - 1]} on your latest
              </p>
            </>
          ) : (
            <p className="text-stone mt-2 text-sm">Do two yaps to see your trend.</p>
          )}
        </div>
        <div className="bg-sky-soft rounded-[28px] p-5">
          <p className="flex items-center gap-2 font-bold"><Snowflake className="text-sky size-5" /> Streak freezes: {game.freezes}/{FREEZE.max}</p>
          <p className="text-stone mt-2 text-sm leading-relaxed">
            Every {FREEZE.every}-day streak earns a freeze. If you miss one day, a freeze saves your streak automatically.
          </p>
        </div>
      </section>

      <section className="surface flex flex-col gap-3 rounded-[28px] p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-bold">Daily reminder</p>
          <p className="text-stone text-sm">Adds a {labelFor(YAP_TIMES, profile.yap_time)?.label.toLowerCase() ?? "daily"} yap to your calendar for the rest of your track.</p>
        </div>
        <ReminderButton yapTime={profile.yap_time} daysLeft={31 - day} />
      </section>

      {showInstall && (
        <section className="bg-sun-soft flex items-start gap-3 rounded-[28px] p-5">
          <Share className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm leading-relaxed">
            <span className="font-bold">Add Yap101 to your Home Screen.</span> Tap Share in Safari, then &quot;Add to Home Screen&quot;. It opens like an app, full screen.
          </p>
        </section>
      )}

      {/* Level ladder */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-2xl font-extrabold">Level ladder</h2>
          <p className="font-bold">⭐ {game.xp} XP</p>
        </div>
        <div className="bg-sky rounded-[32px] p-2.5">
          <ol className="flex flex-col gap-2">
            {LEVELS.map((l, i) => {
              const n = i + 1;
              const you = n === game.level;
              const locked = n > game.level;
              return (
                <li key={l.title} className={cn("flex items-center gap-3 rounded-full p-1.5 pr-5", you ? "bg-yap text-white" : "bg-white", locked && "opacity-70")}>
                  <YapperAvatar index={n} mood={you ? "cheer" : locked ? "sleepy" : "happy"} className={cn("size-11", you && "bg-white!")} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-xs", you ? "text-white/80" : "text-stone")}>{you ? "You're here" : `Level ${n}`}</p>
                    <p className="font-semibold">{l.title}</p>
                    {you && game.nextLevelAt && <Bar value={game.levelProgress} className="mt-1.5 max-w-48" color="bg-white" track="bg-white/30" />}
                  </div>
                  <span className="text-sm font-bold">{l.at} XP</span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Badges */}
      <section>
        <h2 className="mb-3 text-2xl font-extrabold">Badges</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
          {game.badges.map((b) => (
            <div key={b.id} className={cn("flex aspect-square flex-col items-center justify-center rounded-[24px] p-3 text-center", b.earned ? cn(b.color, b.color !== "bg-sun" && "text-white") : "surface")}>
              <span className={cn("text-3xl", !b.earned && "opacity-40 grayscale")}>{b.emoji}</span>
              <p className="mt-2 text-sm font-bold">{b.name}</p>
              <p className={cn("mt-0.5 text-xs leading-snug", b.earned ? "opacity-80" : "text-stone")}>{b.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <YapButton variant="soft" onClick={async () => { await api.signOut(); reloadTo("/"); }}>Sign out</YapButton>
        {isDemo && (
          <>
            <YapButton variant="soft" onClick={async () => { demoBackfill(6); await refresh(); toast.success("Added 6 earlier days of yaps"); }}>Demo: fake a 6-day streak</YapButton>
            <YapButton variant="soft" className="text-cherry" onClick={async () => { await demoReset(); reloadTo("/"); }}>Demo: reset everything</YapButton>
          </>
        )}
      </section>
    </div>
  );
}
