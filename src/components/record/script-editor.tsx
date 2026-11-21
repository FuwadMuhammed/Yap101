"use client";

import { FileUp, LoaderCircle, RefreshCw, Sparkles, Undo2, WandSparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { YapButton } from "@/components/yap/yap-button";
import { api } from "@/lib/data";
import type { Profile } from "@/lib/data/types";
import { GOAL_OPTIONS, LEVEL_OPTIONS, labelFor, nicheList, PLATFORMS } from "@/lib/options";
import { buildScript, estimateSeconds } from "@/lib/prompter";
import { linesToText, loadSuggestion, otherScripts, saveSuggestion, textToLines } from "@/lib/script";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { MAX_SECONDS, type Prompt } from "@/lib/yap";
import { MIN_POLISH_WORDS, templateSuggestion, tidyDraft, wordCount, type WriteMode, type WriteRequest, type WriteResult } from "@/lib/write-script";

const WRITE_ERRORS: Record<string, string> = {
  guest_limit: "That's today's free AI scripts for guests. Sign in for more, or come back tomorrow.",
  setup: "Our script writer isn't switched on yet.",
  busy: "Our script writer is busy right now.",
  refused: "We couldn't write that one. Try changing your draft.",
};

/** Where the text in the box came from. Only unedited AI text counts as "suggestion"/"polished". */
type Source = "suggestion" | "polished";

/**
 * Full-screen sheet for the day's teleprompter script. Two ways in:
 *  - "Use our suggestion": a script built from today's topic, its talking points and the
 *    user's profile. Tap again for another take.
 *  - "Polish it for me": the user types their own words and we tidy them, keeping their
 *    meaning and voice.
 * Every AI change can be undone until they edit. Each line becomes one teleprompter line.
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
  /** Today's prompt: the topic every suggestion is written for. */
  prompt: Prompt;
  /** How long the written script should run, in seconds. */
  seconds: number;
  onSave: (lines: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(linesToText(initial));
  const [busy, setBusy] = useState<WriteMode | null>(null);
  const [ask, setAsk] = useState("");
  /** The writer's clarifying question or redirect, shown under the "anything to add" box. */
  const [coach, setCoach] = useState<string | null>(null);
  // The last text we put in the box, what kind it was, and what was there before (for undo).
  // A script they saved without changing our suggestion still counts as our suggestion.
  const [ai, setAi] = useState<{ text: string; source: Source; before: string } | null>(() => {
    const t = linesToText(initial);
    const ours = [suggested, loadSuggestion(prompt.id)].some((s) => s && linesToText(s) === t);
    return t && ours ? { text: t, source: "suggestion", before: "" } : null;
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const profileRef = useRef<Promise<Profile | null> | null>(null);

  const lines = textToLines(text);
  const words = wordCount(text);
  const seconds = lines.length ? estimateSeconds(buildScript(lines), 150) : 0;
  const tooLong = seconds > MAX_SECONDS;
  /** The box still holds exactly what we put there. */
  const untouched = ai && ai.text === text ? ai : null;
  const showingSuggestion = untouched?.source === "suggestion";
  const canPolish = !busy && !untouched && words >= MIN_POLISH_WORDS;

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

  /** Put AI (or template) lines in the box, remembering the user's own text for undo. */
  function apply(next: string[], source: Source) {
    const t = linesToText(next);
    // Swapping one suggestion for another keeps their original draft as the undo target.
    setAi({ text: t, source, before: untouched ? untouched.before : text });
    setText(t);
    setCoach(null);
  }

  function undo() {
    if (!untouched) return;
    setText(untouched.before);
    setAi(null);
    textRef.current?.focus();
  }

  /** Everything we know about today and the user (from their profile in the backend). */
  async function context(mode: WriteMode): Promise<WriteRequest> {
    profileRef.current ??= api.getProfile().catch(() => null);
    const profile = await profileRef.current;
    return {
      mode,
      request: mode === "suggest" ? ask : "",
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
      draft: mode === "polish" ? text : "",
      previous: otherScripts(prompt.id),
      avoid: mode === "suggest" && showingSuggestion ? text : "",
    };
  }

  /** One AI call. Returns lines, or null after telling the user why (question, redirect or error). */
  async function callWriter(body: WriteRequest): Promise<string[] | { error: string } | null> {
    try {
      const res = await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Partial<WriteResult> & { error?: string };
      if (res.ok && (data.kind === "question" || data.kind === "redirect") && data.message) {
        setCoach(data.message);
        return null;
      }
      if (!res.ok || !data.lines?.length) return { error: data.error ?? "upstream" };
      return data.lines;
    } catch {
      return { error: "offline" };
    }
  }

  const reason = (error: string) => WRITE_ERRORS[error] ?? (error === "offline" ? "We couldn't reach our script writer." : "Our script writer had a hiccup.");

  async function suggest() {
    if (busy) return;
    const another = showingSuggestion;
    // First tap: the suggestion we already have for today is instant (and free).
    const ready = !another && !ask.trim() ? (loadSuggestion(prompt.id) ?? suggested) : null;
    if (ready?.length && linesToText(ready) !== text) {
      apply(ready, "suggestion");
      return;
    }
    setBusy("suggest");
    setCoach(null);
    try {
      const body = await context("suggest");
      const out = await callWriter(body);
      if (!out) return;
      if (Array.isArray(out)) {
        saveSuggestion(prompt.id, out);
        apply(out, "suggestion");
        return;
      }
      if (out.error === "refused") return void toast.error(reason(out.error));
      // Still give them something to work with: a starter built from the talking points.
      if (another) return void toast.error(`${reason(out.error)} Try another one in a little while.`);
      apply(templateSuggestion(body), "suggestion");
      toast(`${reason(out.error)} Here's a starter from today's talking points: fill in the [blanks].`);
    } finally {
      setBusy(null);
    }
  }

  async function polish() {
    if (!canPolish) return;
    setBusy("polish");
    setCoach(null);
    try {
      const body = await context("polish");
      const out = await callWriter(body);
      if (!out) return;
      if (Array.isArray(out)) {
        apply(out, "polished");
        return;
      }
      if (out.error === "refused") return void toast.error(reason(out.error));
      // The full polish is out of reach: a quick tidy (filler out, one sentence per line) still helps.
      const tidy = tidyDraft(text);
      if (tidy.length && linesToText(tidy) !== text) {
        apply(tidy, "polished");
        toast(`${reason(out.error)} We gave it a quick tidy instead.`);
      } else toast.error(`${reason(out.error)} Try again in a little while.`);
    } finally {
      setBusy(null);
    }
  }

  const hint = busy
    ? busy === "suggest"
      ? "Writing a script from today's topic and your profile…"
      : "Polishing your words. Your meaning stays the same…"
    : !text.trim()
      ? "Start from our suggestion, or type your own and we'll polish it."
      : showingSuggestion
        ? "Make it yours: change any line, fill in any [blanks], then save."
        : untouched?.source === "polished"
          ? "Polished. Read it out loud once, then save."
          : words < MIN_POLISH_WORDS
            ? "Type a few more words and we'll polish them."
            : "Happy with it? Save. Or polish it: we keep your words and meaning.";

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

        <section className="bg-mist mt-5 rounded-[24px] p-4">
          <p className="text-stone text-sm font-semibold">Day {prompt.day_index} · today&apos;s topic</p>
          <p className="font-display mt-0.5 text-[19px] leading-tight">{prompt.title}</p>
          <p className="text-stone mt-3 text-sm font-semibold">Make sure you cover</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {points.map((p) => (
              <li key={p} className="rounded-full bg-white px-3 py-1.5 text-sm font-medium">{p}</li>
            ))}
          </ul>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <YapButton variant={text.trim() ? "soft" : "primary"} onClick={() => void suggest()} disabled={Boolean(busy)} aria-busy={busy === "suggest"}>
            {busy === "suggest" ? <LoaderCircle className="animate-spin" /> : showingSuggestion ? <RefreshCw /> : <Sparkles />}
            {busy === "suggest" ? "Writing…" : showingSuggestion ? "Try another" : "Use our suggestion"}
          </YapButton>
          <YapButton
            variant={canPolish ? "primary" : "soft"}
            onClick={() => void polish()}
            disabled={!canPolish}
            aria-busy={busy === "polish"}
            title={canPolish ? undefined : `Type at least ${MIN_POLISH_WORDS} words of your own first`}
          >
            {busy === "polish" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
            {busy === "polish" ? "Polishing…" : "Polish it for me"}
          </YapButton>
        </div>
        <p role="status" aria-live="polite" className="text-stone mt-2 px-1 text-sm leading-snug">{hint}</p>

        {untouched && untouched.before.trim() && (
          <div className="bg-sun/40 mt-3 flex items-center justify-between gap-3 rounded-[20px] px-4 py-2.5 text-sm">
            <span className="font-semibold">{untouched.source === "polished" ? "Polished version" : "Our suggestion"}</span>
            <button onClick={undo} className="flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
              <Undo2 className="size-4" /> Back to your version
            </button>
          </div>
        )}

        <label htmlFor="script-text" className="sr-only">Script</label>
        <textarea
          ref={textRef}
          id="script-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={Boolean(busy)}
          aria-busy={Boolean(busy)}
          rows={10}
          placeholder={"Or write it your way, how you'd say it.\nOne sentence per line works best.\n\nRough is fine: “Polish it for me” tidies it up."}
          className={`surface mt-3 min-h-[40dvh] w-full resize-none rounded-[24px] p-5 text-lg leading-relaxed outline-none transition-opacity focus-visible:outline-2 focus-visible:outline-ink ${busy ? "opacity-60" : ""}`}
        />

        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-sm">
          <span className={tooLong ? "font-semibold text-[#c2410c]" : "text-stone"}>
            {words} words · about {seconds}s{tooLong && ` · over the ${MAX_SECONDS}s max, try cutting a line`}
          </span>
          {text && !busy && (
            <button onClick={() => { setText(""); setAi(null); }} className="text-stone hover:text-ink font-semibold underline-offset-4 hover:underline">Clear</button>
          )}
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void suggest();
          }}
        >
          <label htmlFor="script-ask" className="text-stone px-1 text-sm font-semibold">Anything our suggestion should include? <span className="font-normal">(optional)</span></label>
          <input
            id="script-ask"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            maxLength={500}
            enterKeyHint="go"
            placeholder="e.g. “I'm a nurse who films on my lunch break”"
            className="surface mt-2 h-12 w-full rounded-full px-5 outline-none focus-visible:outline-2 focus-visible:outline-ink"
          />
          {coach && (
            <p role="status" className="bg-mist mt-2 flex gap-2 rounded-[20px] px-4 py-3 text-sm leading-snug">
              <Sparkles className="mt-0.5 size-4 shrink-0" /> {coach}
            </p>
          )}
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <YapButton variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
            <FileUp /> Import .txt
          </YapButton>
          <input ref={fileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => {
              void importFile(e.target.files?.[0]);
              // So picking the same file again still imports it.
              e.target.value = "";
            }} />
        </div>

        <div className="sticky bottom-0 z-10 -mx-5 mt-auto bg-gradient-to-t from-paper from-[calc(100%-2rem)] to-paper/0 px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <YapButton
            size="xl"
            block
            disabled={!lines.length || Boolean(busy)}
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
