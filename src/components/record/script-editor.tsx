"use client";

import { FileUp, LoaderCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { YapButton } from "@/components/yap/yap-button";
import { api } from "@/lib/data";
import { GOAL_OPTIONS, LEVEL_OPTIONS, labelFor, nicheList, PLATFORMS } from "@/lib/options";
import { buildScript, estimateSeconds } from "@/lib/prompter";
import { linesToText, otherScripts, textToLines } from "@/lib/script";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { MAX_SECONDS, type Prompt } from "@/lib/yap";
import type { WriteRequest, WriteResult } from "@/lib/write-script";

const WRITE_ERRORS: Record<string, string> = {
  signin: "Sign in to have us write your script.",
  setup: "Script writing isn't switched on yet.",
  busy: "Script writing is busy right now. Try again in a little while.",
  refused: "We couldn't write that one. Try changing your draft.",
};

/**
 * Full-screen sheet for writing, pasting or importing a teleprompter script.
 * Each line (or sentence) becomes one teleprompter line.
 */
export function ScriptEditor({
  initial,
  suggested,
  points,
  prompt,
  seconds: targetSeconds,
  onSave,
  onClose,
}: {
  initial: string[] | null;
  /** The script we made from their onboarding answers, if this day has one. */
  suggested: string[] | null;
  points: string[];
  /** Today's prompt, for "Write it for me". */
  prompt: Prompt;
  /** How long the written script should run, in seconds. */
  seconds: number;
  onSave: (lines: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(linesToText(initial));
  const [writing, setWriting] = useState(false);
  const [ask, setAsk] = useState("");
  /** The writer's clarifying question or redirect, shown under the topic box. */
  const [coach, setCoach] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lines = textToLines(text);
  const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const seconds = lines.length ? estimateSeconds(buildScript(lines), 150) : 0;
  const tooLong = seconds > MAX_SECONDS;

  useScrollLock();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 50_000) return toast.error("That file is too big for a 60-second script.");
    const raw = await file.text();
    if (!raw.trim()) return toast.error("That file looks empty.");
    setText(linesToText(textToLines(raw)));
    toast.success("Script imported. Check it over, then save.");
  }

  async function writeForMe() {
    if (writing) return;
    setWriting(true);
    setCoach(null);
    const before = text;
    try {
      const profile = await api.getProfile().catch(() => null);
      const body: WriteRequest = {
        request: ask,
        title: prompt.title,
        points,
        skill: prompt.skill,
        skillTip: prompt.skill_tip,
        focus: prompt.focus,
        challengeDay: prompt.day_index,
        seconds: Math.min(targetSeconds, MAX_SECONDS),
        name: profile?.display_name && profile.display_name !== "Guest" ? profile.display_name : null,
        niche: nicheList(profile?.niche) || null,
        platform: labelFor(PLATFORMS, profile?.platform)?.label ?? null,
        goal: labelFor(GOAL_OPTIONS, profile?.goal)?.hint ?? null,
        level: labelFor(LEVEL_OPTIONS, profile?.level)?.label ?? null,
        draft: before,
        previous: otherScripts(prompt.id),
      };
      const res = await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Partial<WriteResult> & { error?: string };
      if (res.ok && (data.kind === "question" || data.kind === "redirect") && data.message) {
        setCoach(data.message);
        return;
      }
      if (!res.ok || !data.lines?.length) {
        toast.error(WRITE_ERRORS[data.error ?? ""] ?? "Couldn't write a script just now. Try again.");
        return;
      }
      setText(linesToText(data.lines));
      toast.success(before.trim() ? "Polished your draft. Make it yours, then save." : "Here's a first draft. Make it yours, then save.", {
        action: { label: "Undo", onClick: () => setText(before) },
      });
    } catch {
      toast.error("Couldn't reach us. Check your connection and try again.");
    } finally {
      setWriting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit your script" className="bg-paper fixed inset-0 z-50 flex justify-center overflow-y-auto overscroll-contain">
      <div className="flex min-h-full w-full max-w-lg flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="surface tap grid size-11 place-items-center rounded-full" aria-label="Close without saving">
            <X className="size-5" />
          </button>
          <p className="font-display text-[19px]">Your script</p>
          <span className="size-11" />
        </div>

        <p className="text-stone mt-5 text-sm font-semibold">Make sure you cover</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {points.map((p) => (
            <li key={p} className="bg-mist rounded-full px-3 py-1.5 text-sm font-medium">{p}</li>
          ))}
        </ul>

        <label htmlFor="script-text" className="sr-only">Script</label>
        <textarea
          id="script-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={writing}
          autoFocus={!initial}
          rows={10}
          placeholder={"Write it how you'd say it.\nOne sentence per line works best.\n\nTip: start with your most interesting line."}
          className="surface mt-4 min-h-[45dvh] w-full resize-none rounded-[24px] p-5 text-lg leading-relaxed outline-none focus-visible:outline-2 focus-visible:outline-ink"
        />

        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-sm">
          <span className={tooLong ? "font-semibold text-[#c2410c]" : "text-stone"}>
            {words} words · about {seconds}s{tooLong && ` · over the ${MAX_SECONDS}s max, try cutting a line`}
          </span>
          {text && (
            <button onClick={() => setText("")} className="text-stone hover:text-ink font-semibold underline-offset-4 hover:underline">Clear</button>
          )}
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void writeForMe();
          }}
        >
          <label htmlFor="script-ask" className="text-stone px-1 text-sm font-semibold">What do you want to talk about? <span className="font-normal">(optional)</span></label>
          <input
            id="script-ask"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={500}
            enterKeyHint="go"
            placeholder="A topic, a rough idea, or “suggest something”"
            className="surface mt-2 h-12 w-full rounded-full px-5 outline-none focus-visible:outline-2 focus-visible:outline-ink"
          />
          {coach && (
            <p role="status" className="bg-mist mt-2 flex gap-2 rounded-[20px] px-4 py-3 text-sm leading-snug">
              <Sparkles className="mt-0.5 size-4 shrink-0" /> {coach}
            </p>
          )}
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <YapButton variant="soft" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> Import .txt
          </YapButton>
          <input ref={fileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
          {suggested && (
            <YapButton variant="soft" size="sm" onClick={() => setText(linesToText(suggested))}>
              <RotateCcw /> Use our suggestion
            </YapButton>
          )}
          <YapButton variant="soft" size="sm" onClick={() => void writeForMe()} disabled={writing} aria-busy={writing}>
            {writing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {writing ? "Writing…" : text.trim() ? "Polish it for me" : "Write it for me"}
          </YapButton>
        </div>

        <div className="sticky bottom-0 z-10 -mx-5 mt-auto bg-gradient-to-t from-paper from-70% to-paper/0 px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <YapButton
            size="xl"
            block
            disabled={!lines.length}
            onClick={() => onSave(lines)}
          >
            Save script
          </YapButton>
          <p className="text-stone mt-2 text-center text-xs">Saved on this device for this day&apos;s yap.</p>
        </div>
      </div>
    </div>
  );
}
