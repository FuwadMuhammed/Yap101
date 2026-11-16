"use client";

import { Lock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mascot } from "@/components/brand/mascot";
import { Recorder } from "@/components/record/recorder";
import { YapLink } from "@/components/yap/yap-button";
import { personalize } from "@/lib/curriculum";
import { api } from "@/lib/data";
import { nicheForDay } from "@/lib/options";
import { introScript } from "@/lib/script";
import { DAILY_LIMIT, localDate, trackDay, type Level, type Prompt } from "@/lib/yap";

type Ready = { kind: "ready"; prompt: Prompt; firstToday: boolean; level: Level | null; script: string[] | null };
type Blocked = { kind: "missing" } | { kind: "locked"; day: number; unlocks: string } | { kind: "limit" };

function RecordScreen() {
  const params = useSearchParams();
  const id = Number(params.get("prompt"));
  const first = params.get("first") === "1";
  const [state, setState] = useState<Ready | Blocked | null>(null);

  useEffect(() => {
    const today = localDate();
    // Deleted yaps still count towards today's 3, so ask for them too.
    Promise.all([id ? api.getPromptById(id) : null, api.listYaps({ includeDeleted: true }), api.getProfile()])
      .then(([prompt, yaps, profile]) => {
        if (!prompt) return setState({ kind: "missing" });
        // Days unlock one at a time from the track start; earlier days stay open for catch-up.
        if (profile?.track_start_date) {
          const day = trackDay(profile.track_start_date, today);
          if (prompt.day_index > day) {
            const d = new Date(`${profile.track_start_date}T12:00:00`);
            d.setDate(d.getDate() + prompt.day_index - 1);
            return setState({ kind: "locked", day: prompt.day_index, unlocks: d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }) });
          }
        }
        const usedToday = yaps.filter((y) => y.local_date === today).length;
        if (usedToday >= DAILY_LIMIT) return setState({ kind: "limit" });
        setState({
          kind: "ready",
          prompt: personalize(prompt, nicheForDay(profile?.niche, prompt.day_index)),
          firstToday: usedToday === 0,
          level: profile?.level ?? null,
          script: introScript(prompt, profile),
        });
      })
      .catch(() => setState({ kind: "missing" }));
  }, [id]);

  if (!state) return <Loading />;
  if (state.kind === "ready") return <Recorder prompt={state.prompt} firstToday={state.firstToday} level={state.level} first={first} script={state.script} />;
  return <BlockedScreen state={state} />;
}

function BlockedScreen({ state }: { state: Blocked }) {
  const copy =
    state.kind === "locked"
      ? { mood: "think" as const, title: `Day ${state.day} is locked`, body: `It unlocks on ${state.unlocks}. One day at a time is how the habit sticks.` }
      : state.kind === "limit"
        ? { mood: "cheer" as const, title: "That's 3 yaps today!", body: `You've used all ${DAILY_LIMIT} of today's yaps. Rest that voice and come back tomorrow.` }
        : { mood: "think" as const, title: "We couldn't find that yap", body: "The link may be old or mistyped. Today's prompt is waiting for you." };
  return (
    <div className="bg-grid flex min-h-[calc(100dvh-var(--banner-h,0px))] items-center justify-center px-5">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <Mascot mood={copy.mood} className="animate-float size-24" />
        <h1 className="flex items-center gap-2 text-[31px]">
          {state.kind === "locked" && <Lock className="size-6" />}
          {copy.title}
        </h1>
        <p className="text-stone text-lg">{copy.body}</p>
        <div className="flex w-full flex-col gap-2">
          <YapLink href="/home" size="xl" block arrow>Back to today</YapLink>
          {state.kind !== "missing" && <YapLink href="/track" variant="soft" size="lg" block>See your 30 days</YapLink>}
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="bg-ink grid min-h-[calc(100dvh-var(--banner-h,0px))] place-items-center">
      <Mascot mood="think" className="animate-float size-20" />
    </div>
  );
}

export default function RecordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RecordScreen />
    </Suspense>
  );
}
