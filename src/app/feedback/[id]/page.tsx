"use client";

import { ChevronLeft, Share2, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mascot, MascotSays, Yapper, YapperAvatar, YapperCluster } from "@/components/brand/mascot";
import { Confetti } from "@/components/yap/confetti";
import { Bar, Flame, Ring } from "@/components/yap/stats";
import { ReminderButton } from "@/components/yap/reminder-button";
import { YapButton, YapLink } from "@/components/yap/yap-button";
import { personalize } from "@/lib/curriculum";
import { api, isDemo, type Profile, type YapDetail, type YapSummary } from "@/lib/data";
import { computeGame, gameDiff, type GameState } from "@/lib/game";
import { labelFor, NICHES } from "@/lib/options";
import { cn } from "@/lib/utils";
import { DAILY_LIMIT, localDate, pickPrompt, trackDay } from "@/lib/yap";

type Celebration = { before: GameState; after: GameState; diff: ReturnType<typeof gameDiff> };

function useCountUp(target: number, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return n;
}

function CelebrationScreen({ c, onDone }: { c: Celebration; onDone: () => void }) {
  const xp = useCountUp(c.diff.xpGained);
  const [bar, setBar] = useState(c.before.level === c.after.level ? c.before.levelProgress : 0);
  useEffect(() => {
    const t = setTimeout(() => setBar(c.after.levelProgress), 500);
    return () => clearTimeout(t);
  }, [c]);

  const row = "animate-rise flex items-center gap-3 rounded-full bg-white p-1.5 pr-5 text-ink";
  return (
    <div className="bg-mint fixed inset-0 z-40 overflow-y-auto px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
      <Confetti />
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <YapperCluster mood="cheer" className="animate-pop mt-4" />
        <h1 className="animate-rise mt-6 text-center text-5xl font-extrabold [animation-delay:120ms]">Yap complete!</h1>
        <p className="animate-pop mx-auto mt-4 rounded-full bg-white px-6 py-2 text-4xl font-extrabold text-ink [animation-delay:250ms]">+{xp} XP</p>

        <ul className="mt-8 flex flex-col gap-2">
          <li className={row} style={{ animationDelay: "350ms" }}>
            <span className="bg-yap-soft grid size-11 place-items-center rounded-full"><Flame className="size-6" /></span>
            <div className="flex-1">
              <p className="text-stone text-xs">{c.diff.streakUp ? "Streak +1" : "Streak safe"}</p>
              <p className="font-semibold">{c.after.streak} day streak</p>
            </div>
          </li>
          <li className={row} style={{ animationDelay: "450ms" }}>
            <YapperAvatar index={c.after.level} className="size-11" />
            <div className="min-w-0 flex-1">
              <p className="text-stone text-xs">Level {c.after.level}</p>
              <p className="font-semibold">{c.after.levelTitle}</p>
              <Bar value={bar} className="mt-1 max-w-40" />
            </div>
            <span className="font-bold">{c.after.xp} XP</span>
          </li>
          {c.diff.leveledUp && (
            <li className={cn(row, "bg-sun")} style={{ animationDelay: "550ms" }}>
              <span className="grid size-11 place-items-center rounded-full bg-white text-xl">⬆️</span>
              <p className="font-semibold">Level up! You&apos;re a {c.after.levelTitle}</p>
            </li>
          )}
          {c.diff.newBadges.map((b, i) => (
            <li key={b.id} className={row} style={{ animationDelay: `${650 + i * 120}ms` }}>
              <span className={cn("grid size-11 place-items-center rounded-full text-xl", b.color)}>{b.emoji}</span>
              <div className="flex-1">
                <p className="text-stone text-xs">New badge</p>
                <p className="font-semibold">{b.name}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-8">
          <YapButton variant="white" size="xl" block arrow onClick={onDone}>See my feedback</YapButton>
        </div>
      </div>
    </div>
  );
}

const scoreColor = (n: number) => (n >= 80 ? "#1fa463" : n >= 60 ? "#ffd23f" : "#ff6b2c");
const scoreBg = (n: number) => (n >= 80 ? "bg-mint" : n >= 60 ? "bg-sun" : "bg-yap");

function pace(wpm: number) {
  if (wpm < 110) return "A bit slow";
  if (wpm <= 170) return "Sweet spot";
  return "Speedy";
}

function FeedbackScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const celebrate = useSearchParams().get("celebrate") === "1";
  const [yap, setYap] = useState<YapDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [all, setAll] = useState<YapSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tomorrow, setTomorrow] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listYaps(), api.getProfile()]).then(async ([list, p]) => {
      const t = localDate();
      setAll(list);
      setProfile(p);
      setToday(t);
      if (celebrate) {
        const after = computeGame(list, t);
        const before = computeGame(list.filter((y) => y.id !== id), t);
        setCelebration({ before, after, diff: gameDiff(before, after) });
      }
      if (p?.level && p.goal && p.track_start_date) {
        const day = trackDay(p.track_start_date, t);
        if (day < 30) {
          const track = (await api.getPrompts(p.level, p.goal)).map((x) => personalize(x, labelFor(NICHES, p.niche)?.label));
          setTomorrow(pickPrompt(track, day + 1)?.title ?? null);
        }
      }
    });
  }, [celebrate, id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let url: string | null = null;
    const load = async () => {
      const y = await api.getYap(id);
      if (!y) return setMissing(true);
      // Keep the first playback URL so the player doesn't reset while polling.
      if (url && y.url && y.url !== url && y.url.startsWith("blob:")) URL.revokeObjectURL(y.url);
      url ??= y.url;
      setYap({ ...y, url });
      if (!y.feedback) timer = setTimeout(load, 1500);
    };
    load();
    return () => clearTimeout(timer);
  }, [id]);

  if (missing)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <MascotSays mood="sleepy">This yap was deleted.</MascotSays>
        <YapLink href="/home" arrow>Back to today</YapLink>
      </div>
    );

  const f = yap?.feedback;
  const isVideo = yap?.media === "video";
  // Compare with the most recent earlier yap that has feedback.
  const idx = all.findIndex((y) => y.id === id);
  const prev = idx >= 0 ? all.slice(idx + 1).find((y) => y.filler_count !== null) : undefined;
  const fillerDelta = f?.filler_count != null && prev?.filler_count != null ? f.filler_count - prev.filler_count : null;
  const a = f?.analysis && f.analysis.parts.length ? f.analysis : null;
  const prevScored = idx >= 0 ? all.slice(idx + 1).find((y) => y.score !== null) : undefined;
  const scoreDelta = a && prevScored?.score != null ? a.overall - prevScored.score : null;
  const leftToday = today ? DAILY_LIMIT - all.filter((y) => y.local_date === today).length : 0;

  async function share() {
    if (!yap?.url) return;
    const blob = await fetch(yap.url).then((r) => r.blob());
    const ext = blob.type.includes("mp4") ? (yap.media === "audio" ? "m4a" : "mp4") : "webm";
    const file = new File([blob], `yap101-${yap.local_date}.${ext}`, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: yap.title });
      } catch {}
      return;
    }
    const a = document.createElement("a");
    a.href = yap.url;
    a.download = file.name;
    a.click();
  }

  return (
    <>
      {celebrate && celebration && <CelebrationScreen c={celebration} onDone={() => router.replace(`/feedback/${id}`)} />}

      <div className={cn("mx-auto flex w-full flex-1 flex-col gap-5 px-4 pt-4 pb-10 sm:px-6 lg:pt-8", isVideo ? "max-w-5xl" : "max-w-2xl")}>
        <div className="flex items-center gap-3">
          <Link href="/home" className="surface tap grid size-11 shrink-0 place-items-center rounded-full" aria-label="Back to today">
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-stone text-sm">Yap report</p>
            <h1 className="truncate text-2xl font-extrabold">{yap?.title ?? "…"}</h1>
          </div>
        </div>

        {/* Phone: clip on top, report below. Tablet and up (video): clip on the left, stays in view. */}
        <div className={cn("flex flex-col gap-5", isVideo && "md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-8")}>
        {yap?.url &&
          (yap.media === "video" ? (
            <div className="md:sticky md:top-6">
              <video src={yap.url} controls playsInline className="bg-ink mx-auto aspect-[9/16] max-h-[52dvh] w-auto max-w-full rounded-[28px] object-cover md:max-h-[calc(100dvh-8rem)] md:w-full" />
            </div>
          ) : (
            <div className="surface flex items-center gap-3 rounded-full p-2 pr-4">
              <YapperAvatar index={0} mood="talk" />
              <audio src={yap.url} controls className="h-10 min-w-0 flex-1" />
            </div>
          ))}
        <div className="flex min-w-0 flex-col gap-5">

        {!f ? (
          <div className="surface flex flex-col items-center gap-3 rounded-[28px] px-6 py-10 text-center">
            <Mascot mood="think" className="animate-wiggle size-16" />
            <p className="text-lg font-semibold">Yappy is listening back…</p>
            <p className="text-stone text-sm">Checking your pace, pauses and energy.</p>
          </div>
        ) : (
          <>
            {a && (
              <section className="bg-ink relative overflow-hidden rounded-[32px] p-5 text-white">
                <div className="flex items-center gap-5">
                  <Ring value={a.overall / 100} label={<span className="font-display text-3xl">{a.overall}</span>} color={scoreColor(a.overall)} className="size-24 shrink-0 [&_circle:first-child]:stroke-white/15" />
                  <div className="min-w-0">
                    <p className="text-sm text-white/60">Yap score</p>
                    <p className="font-display text-2xl font-bold">{a.verdict}</p>
                    {scoreDelta !== null && (
                      <p className={cn("mt-1 inline-flex items-center gap-1 text-sm font-semibold", scoreDelta >= 0 ? "text-mint-soft" : "text-sun")}>
                        {scoreDelta >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                        {scoreDelta === 0 ? "Same as last time" : `${scoreDelta > 0 ? "+" : ""}${scoreDelta} vs last time`}
                      </p>
                    )}
                  </div>
                </div>
                <ul className="mt-5 flex flex-col gap-3.5">
                  {a.parts.map((p) => (
                    <li key={p.key}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-semibold">
                          {p.label}
                          {p.focus && <span className="bg-grape ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-bold text-ink">Today&apos;s skill</span>}
                        </p>
                        <span className="font-bold tabular-nums">{p.score}</span>
                      </div>
                      <Bar value={p.score / 100} track="bg-white/10" color={scoreBg(p.score)} className="mt-1.5" />
                      <p className="mt-1 text-sm text-white/60">{p.value}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="grid grid-cols-2 gap-3">
              {f.words_per_minute != null && (
                <div className="bg-sky relative overflow-hidden rounded-[28px] p-5 text-white">
                  <p className="text-sm text-white/75">Pace</p>
                  <p className="font-display mt-1 text-4xl font-bold">{a ? "~" : ""}{Math.round(f.words_per_minute)}</p>
                  <p className="text-sm text-white/75">words / min</p>
                  <span className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-bold text-ink">{pace(f.words_per_minute)}</span>
                  <Yapper shape="blob" color="#ffffff" mood="talk" className="absolute -right-3 -bottom-3 size-16 opacity-90" />
                </div>
              )}
              {f.filler_count != null ? (
                <div className="bg-berry relative overflow-hidden rounded-[28px] p-5 text-white">
                  <p className="text-sm text-white/75">Filler words</p>
                  <p className="font-display mt-1 text-4xl font-bold">{f.filler_count}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(f.filler_words)
                      .filter(([, n]) => n > 0)
                      .map(([w, n]) => (
                        <span key={w} className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold">“{w}” ×{n}</span>
                      ))}
                    {f.filler_count === 0 && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-ink">Clean!</span>}
                  </div>
                </div>
              ) : (
                <div className="surface flex flex-col justify-between rounded-[28px] p-5">
                  <p className="text-stone text-sm">Filler words</p>
                  <p className="font-display mt-1 text-xl font-bold">Coming soon</p>
                  <p className="text-stone mt-1 text-xs">Counting “um” and “like” needs a transcript. That&apos;s the next update.</p>
                </div>
              )}
            </div>

            {fillerDelta !== null && (
              <div className={cn("flex items-center gap-3 rounded-full px-5 py-3 font-semibold", fillerDelta <= 0 ? "bg-mint-soft" : "bg-sun-soft")}>
                {fillerDelta <= 0 ? <TrendingDown className="text-mint size-5" /> : <TrendingUp className="size-5" />}
                {fillerDelta < 0
                  ? `${-fillerDelta} fewer filler word${fillerDelta === -1 ? "" : "s"} than last time. Nice!`
                  : fillerDelta === 0
                    ? "Same filler count as last time. Steady!"
                    : `${fillerDelta} more filler word${fillerDelta === 1 ? "" : "s"} than last time. Try pausing instead.`}
              </div>
            )}

            <section className="bg-grape rounded-[32px] p-2.5">
              <p className="px-3 pt-2 pb-3 font-display text-xl font-bold">Yappy&apos;s tips</p>
              <ol className="flex flex-col gap-2">
                {f.tips.map((t, i) => (
                  <li key={t} className="animate-rise flex items-center gap-3 rounded-[22px] bg-white p-2 pr-4" style={{ animationDelay: `${i * 80}ms` }}>
                    <YapperAvatar index={i + 1} className="size-10" />
                    <p className="text-[15px] leading-snug">{t}</p>
                  </li>
                ))}
              </ol>
            </section>
            <p className="text-stone text-center text-xs">
              {a
                ? "Measured on your phone: nothing was uploaded. Pace is an estimate from your voice rhythm."
                : isDemo
                  ? "Sample numbers for an earlier demo yap."
                  : "Detailed feedback is on its way."}
            </p>
          </>
        )}

        {/* What next */}
        <section className="mt-2 flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">What&apos;s next</h2>
          {tomorrow && (
            <div className="surface flex items-center gap-3 rounded-full p-1.5 pr-5">
              <YapperAvatar index={3} mood="happy" className="size-11" />
              <div className="min-w-0">
                <p className="text-stone text-xs">Tomorrow&apos;s yap</p>
                <p className="truncate font-semibold">{tomorrow}</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {leftToday > 0 ? (
              <YapLink href="/home" size="lg" arrow>Yap again ({leftToday} left)</YapLink>
            ) : (
              <YapLink href="/home" size="lg" arrow>Back to today</YapLink>
            )}
            {yap?.url && (
              <YapButton variant="soft" size="lg" onClick={share}><Share2 /> Share or save clip</YapButton>
            )}
            <ReminderButton yapTime={profile?.yap_time ?? null} daysLeft={profile?.track_start_date && today ? 31 - trackDay(profile.track_start_date, today) : 30} />
            <YapLink href="/history" variant="soft" size="lg">All my yaps</YapLink>
          </div>
        </section>
        </div>
        </div>
      </div>
    </>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={null}>
      <FeedbackScreen />
    </Suspense>
  );
}
