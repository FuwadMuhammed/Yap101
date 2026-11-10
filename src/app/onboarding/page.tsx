"use client";

import { Check, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Yapper, YapperCluster } from "@/components/brand/mascot";
import { YapButton } from "@/components/yap/yap-button";
import { api } from "@/lib/data";
import { CONFIDENCE, GOAL_OPTIONS, LEVEL_OPTIONS, NICHES, PLATFORMS, YAP_TIMES, labelFor, type Option } from "@/lib/options";
import { personalize, TARGET_SECONDS } from "@/lib/curriculum";
import { cn } from "@/lib/utils";
import { localDate, pickPrompt, type Goal, type Level, type Prompt } from "@/lib/yap";

type Answers = { name: string; niche: string; platform: string; confidence: string; level: Level | ""; goal: Goal | ""; time: string };
type Key = keyof Answers;

const STEPS: { key: Key; title: string; sub: string }[] = [
  { key: "name", title: "Hey, I'm Yappy! What should we call you?", sub: "Just a first name or nickname." },
  { key: "niche", title: "What do you make content about?", sub: "Pick the one closest to you." },
  { key: "platform", title: "Where do you post?", sub: "Or where you want to start." },
  { key: "confidence", title: "How do you feel on camera?", sub: "Be honest, nobody's watching." },
  { key: "level", title: "Where are you at?", sub: "We'll match the prompts to you." },
  { key: "goal", title: "What do you want to get better at?", sub: "Your 30-day track is built around this." },
  { key: "time", title: "When will you yap?", sub: "Same time every day is how habits stick." },
];

function Tile({ o, selected, onClick }: { o: Option; selected: boolean; onClick: () => void }) {
  const Icon = o.icon;
  return (
    <button
      type="button"
      role="radio"
      onClick={onClick}
      aria-checked={selected}
      className={cn(
        "tap focus-visible:outline-ink flex aspect-square flex-col items-center justify-center gap-2 rounded-[24px] text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2",
        selected ? cn(o.fill, !o.lightFill && "text-white", "scale-[1.03]") : "surface hover:bg-mist/60",
      )}
    >
      <Icon className="size-6" strokeWidth={2.2} />
      {o.label}
    </button>
  );
}

function Row({ o, selected, onClick }: { o: Option; selected: boolean; onClick: () => void }) {
  const Icon = o.icon;
  return (
    <button type="button" role="radio" onClick={onClick} aria-checked={selected} className="tap hover:bg-mist/50 focus-visible:bg-mist flex w-full items-center gap-4 px-4 py-3.5 text-left outline-none">
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-full", selected ? cn(o.fill, !o.lightFill && "text-white") : "bg-mist")}>
        <Icon className="size-5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{o.label}</span>
        {o.hint && <span className="text-stone block text-sm">{o.hint}</span>}
      </span>
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors", selected ? "border-ink bg-ink text-white" : "border-line")}>
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ name: "", niche: "", platform: "", confidence: "", level: "", goal: "", time: "" });
  const [firstPrompt, setFirstPrompt] = useState<Prompt | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProfile().then((p) => !p && router.replace("/login"));
  }, [router]);

  const done = step >= STEPS.length;
  const current = STEPS[step];
  const set = (k: Key, v: string) => setA((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    const niche = labelFor(NICHES, a.niche)?.label;
    if (done && a.level && a.goal) api.getPrompts(a.level, a.goal).then((t) => setFirstPrompt(pickPrompt(t.map((p) => personalize(p, niche)), 1)));
  }, [done, a.level, a.goal, a.niche]);

  async function finish() {
    setSaving(true);
    try {
      await api.saveOnboarding(
        {
          display_name: a.name.trim(),
          niche: a.niche,
          platform: a.platform,
          confidence: Number(a.confidence),
          level: a.level as Level,
          goal: a.goal as Goal,
          yap_time: a.time,
        },
        localDate(),
      );
      // Straight into the first yap: the fastest route to a first win.
      router.push(firstPrompt ? `/record?prompt=${firstPrompt.id}&first=1` : "/home");
    } catch (e) {
      toast.error((e as Error).message);
      setSaving(false);
    }
  }

  const summary = [
    { step: 1, label: "Niche", o: labelFor(NICHES, a.niche) },
    { step: 2, label: "Platform", o: labelFor(PLATFORMS, a.platform) },
    { step: 4, label: "Level", o: labelFor(LEVEL_OPTIONS, a.level) },
    { step: 5, label: "Goal", o: labelFor(GOAL_OPTIONS, a.goal) },
    { step: 6, label: "Yap time", o: labelFor(YAP_TIMES, a.time) },
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pt-4">
      <div className="flex items-center gap-4">
        <button onClick={() => (step === 0 ? router.push("/") : setStep(step - 1))} className="surface tap grid size-11 shrink-0 place-items-center rounded-full" aria-label="Back">
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${Math.min(step + 1, STEPS.length)} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s.key} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i < step || done ? "bg-ink" : i === step ? "bg-ink/40" : "bg-line")} />
          ))}
        </div>
      </div>

      {!done ? (
        <div key={step} className="animate-rise flex flex-1 flex-col">
          <h1 className="mt-8 text-[34px] leading-[1.08] font-extrabold">{current.title}</h1>
          <p className="text-stone mt-2">{current.sub}</p>

          <div className="mt-8">
            {current.key === "name" && (
              <form onSubmit={(e) => { e.preventDefault(); if (a.name.trim()) setStep(step + 1); }}>
                <input
                  autoFocus
                  aria-label="Your name"
                  maxLength={30}
                  placeholder="e.g. Sam"
                  value={a.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="surface focus:border-ink h-16 w-full rounded-full px-6 text-lg font-semibold outline-none"
                />
              </form>
            )}
            {current.key === "niche" && (
              <div role="radiogroup" aria-label="Niche" className="grid grid-cols-3 gap-2.5">
                {NICHES.map((o) => <Tile key={o.value} o={o} selected={a.niche === o.value} onClick={() => set("niche", o.value)} />)}
              </div>
            )}
            {current.key === "platform" && (
              <div role="radiogroup" aria-label="Platform" className="grid grid-cols-3 gap-2.5">
                {PLATFORMS.map((o) => <Tile key={o.value} o={o} selected={a.platform === o.value} onClick={() => set("platform", o.value)} />)}
              </div>
            )}
            {current.key === "confidence" && (
              <div role="radiogroup" aria-label="Confidence" className="grid grid-cols-5 gap-2">
                {CONFIDENCE.map((c) => {
                  const sel = a.confidence === c.value;
                  return (
                    <button
                      key={c.value}
                      role="radio"
                      onClick={() => set("confidence", c.value)}
                      aria-checked={sel}
                      className={cn("tap flex flex-col items-center gap-2 rounded-3xl py-4 text-xs font-semibold", sel ? "bg-ink text-white" : "surface")}
                    >
                      <Yapper shape="square" color={c.color} mood={c.mood} className={cn("size-12 transition-transform", sel && "scale-110")} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}
            {(current.key === "level" || current.key === "goal" || current.key === "time") && (
              <div role="radiogroup" aria-label={current.title} className="surface divide-line divide-y overflow-hidden rounded-[28px]">
                {(current.key === "level" ? LEVEL_OPTIONS : current.key === "goal" ? GOAL_OPTIONS : YAP_TIMES).map((o) => (
                  <Row key={o.value} o={o} selected={a[current.key] === o.value} onClick={() => set(current.key, o.value)} />
                ))}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-20 -mx-5 mt-auto bg-gradient-to-t from-paper from-70% to-paper/0 px-5 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <YapButton size="xl" block arrow disabled={!a[current.key].trim()} onClick={() => setStep(step + 1)}>
              Continue
            </YapButton>
          </div>
        </div>
      ) : (
        <div className="animate-rise flex flex-1 flex-col">
          <h1 className="mt-8 text-center text-[34px] leading-[1.08] font-extrabold">{a.name.trim() ? `${a.name.trim()}, your` : "Your"} 30-day track is ready</h1>
          <p className="text-stone mt-2 text-center">Day 1: “{firstPrompt?.title ?? "…"}” · {a.level ? TARGET_SECONDS[a.level] : 60} seconds</p>
          <div className="surface mt-6 rounded-[28px] py-6">
            <YapperCluster mood="cheer" />
          </div>
          <div className="border-line my-5 border-t border-dashed" />
          <div className="surface divide-line divide-y overflow-hidden rounded-[28px]">
            {summary.map(({ step: s, label, o }) => {
              const Icon = o?.icon;
              return (
                <div key={label} className="flex items-center gap-4 px-4 py-3">
                  <span className={cn("grid size-11 place-items-center rounded-full", o?.fill, !o?.lightFill && "text-white")}>
                    {Icon && <Icon className="size-5" strokeWidth={2.2} />}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold">{o?.label}</p>
                    <p className="text-stone text-sm">{label}</p>
                  </div>
                  <YapButton variant="mist" size="sm" className="h-9" onClick={() => setStep(s)}>Edit</YapButton>
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-0 z-20 -mx-5 mt-auto bg-gradient-to-t from-paper from-70% to-paper/0 px-5 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <YapButton size="xl" block arrow onClick={finish} disabled={saving}>{saving ? "Setting up…" : "Do my first yap"}</YapButton>
          </div>
        </div>
      )}
    </div>
  );
}
