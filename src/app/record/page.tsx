"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mascot } from "@/components/brand/mascot";
import { Recorder } from "@/components/record/recorder";
import { personalize } from "@/lib/curriculum";
import { api } from "@/lib/data";
import { labelFor, NICHES } from "@/lib/options";
import { introScript } from "@/lib/script";
import { localDate, type Level, type Prompt } from "@/lib/yap";

function RecordScreen() {
  const params = useSearchParams();
  const id = Number(params.get("prompt"));
  const first = params.get("first") === "1";
  const [state, setState] = useState<{ prompt: Prompt; firstToday: boolean; level: Level | null; script: string[] | null } | null>(null);

  useEffect(() => {
    if (!id) return;
    const today = localDate();
    Promise.all([api.getPromptById(id), api.listYaps(), api.getProfile()]).then(([prompt, yaps, profile]) => {
      if (!prompt) return;
      setState({
        prompt: personalize(prompt, labelFor(NICHES, profile?.niche)?.label),
        firstToday: !yaps.some((y) => y.local_date === today),
        level: profile?.level ?? null,
        script: introScript(prompt, profile),
      });
    });
  }, [id]);

  if (!state) return <Loading />;
  return <Recorder prompt={state.prompt} firstToday={state.firstToday} level={state.level} first={first} script={state.script} />;
}

function Loading() {
  return (
    <div className="bg-ink grid min-h-dvh place-items-center">
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
