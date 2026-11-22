"use client";

import { FileUp, LoaderCircle, RefreshCw, Sparkles, Trash2, Undo2, WandSparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { YapButton } from "@/components/yap/yap-button";
import { api } from "@/lib/data";
import type { Profile } from "@/lib/data/types";
import { GOAL_OPTIONS, LEVEL_OPTIONS, labelFor, nicheList, PLATFORMS } from "@/lib/options";
import { buildScript, estimateSeconds } from "@/lib/prompter";
import { isCachedSuggestion, linesToText, loadDraft, loadSuggestion, otherScripts, profileSig, saveDraft, saveSuggestion, textToLines } from "@/lib/script";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { MAX_SECONDS, type Prompt } from "@/lib/yap";
import { MAX_DRAFT_CHARS, MIN_POLISH_WORDS, templateSuggestion, tidyDraft, wordCount, type WriteMode, type WriteRequest, type WriteResult } from "@/lib/write-script";

const WRITE_ERRORS: Record<string, string> = {
  guest_limit: "That's today's free AI scripts for guests. Sign in for more, or come back tomorrow.",
  setup: "Our script writer isn't switched on yet.",
  busy: "Our script writer is busy right now.",
  refused: "We couldn't write that one. Try changing your draft.",
  too_long: "That's too long to polish. Cut it down a little and try again.",
  unauthorized: "Your session ended. Sign in again to use the script writer.",
};

/**
 * Browser Back (and Android's back gesture) should close this sheet, not leave the page and
 * lose the draft. Opening pushes one history entry; Back pops it and closes the sheet; closing
 * any other way removes the entry again. The instance id keeps React's dev-mode double mount
 * from pushing twice or popping the new entry.
 */
let sheetInstance = 0;
let activeSheet = 0;
function useBackCloses(onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const id = ++sheetInstance;
    activeSheet = id;
    let byBack = false;
    if (!(window.history.state as { yapSheet?: boolean } | null)?.yapSheet) window.history.pushState({ ...(window.history.state ?? {}), yapSheet: true }, "");
    const onPop = () => {
      byBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Deferred: a dev-mode remount replaces `activeSheet` first, and then we leave history alone.
      setTimeout(() => {
        if (activeSheet !== id || byBack) return;
        activeSheet = 0;
        if ((window.history.state as { yapSheet?: boolean } | null)?.yapSheet) window.history.back();
      }, 0);
    };
  }, []);
}

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
  /** Save the script; an empty list removes the day's script (back to talking points). */
  onSave: (lines: string[]) => void;
  onClose: () => void;
}) {
  // Unsaved text from last time (a reload, a closed tab) comes back; saving clears it.
  const [restored] = useState(() => {
    const d = loadDraft(prompt.id);
    return d !== null && d !== linesToText(initial) ? d : null;
  });
  const [text, setText] = useState(restored ?? linesToText(initial));
  const [busy, setBusy] = useState<WriteMode | null>(null);
  const [ask, setAsk] = useState("");
  /** The writer's clarifying question or redirect, shown under the "anything to add" box. */
  const [coach, setCoach] = useState<string | null>(null);
  // The last text we put in the box, what kind it was, and what was there before (for undo).
  // A script they saved without changing our suggestion still counts as our suggestion.
  const [ai, setAi] = useState<{ text: string; source: Source; before: string } | null>(() => {
    if (restored !== null) return null;
    const t = linesToText(initial);
    const ours = Boolean(suggested && linesToText(suggested) === t) || isCachedSuggestion(prompt.id, initial);
    return t && ours ? { text: t, source: "suggestion", before: "" } : null;
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const profileRef = useRef<Promise<Profile | null | "failed"> | null>(null);
  const profileWarned = useRef(false);
  /** The request in flight, so Cancel (or closing the sheet) can stop it. */
  const abortRef = useRef<AbortController | null>(null);

  const lines = textToLines(text);
  const words = wordCount(text);
  const seconds = lines.length ? estimateSeconds(buildScript(lines), 150) : 0;
  const tooLong = seconds > MAX_SECONDS;
  /** The box still holds exactly what we put there. */
  const untouched = ai && ai.text === text ? ai : null;
  const showingSuggestion = untouched?.source === "suggestion";
  const draftTooLong = text.trim().length > MAX_DRAFT_CHARS;
  const canPolish = !busy && !untouched && words >= MIN_POLISH_WORDS && !draftTooLong;

  useScrollLock();
  useBackCloses(onClose);
  // Load the profile early so the first tap doesn't wait for it; stop any request on close.
  useEffect(() => {
    profileRef.current ??= api.getProfile().catch(() => "failed" as const);
    return () => abortRef.current?.abort();
  }, []);
  // Keep unsaved text for this day (only what differs from the saved script).
  useEffect(() => {
    const t = setTimeout(() => saveDraft(prompt.id, text === linesToText(initial) ? null : text), 400);
    return () => clearTimeout(t);
  }, [text, prompt.id, initial]);
  const save = (next: string[]) => {
    saveDraft(prompt.id, null);
    onSave(next);
  };
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
    profileRef.current ??= api.getProfile().catch(() => "failed" as const);
    // Don't hang on a slow or failing database: after 3 s, write without the profile.
    let profile = await Promise.race([profileRef.current, new Promise<"failed">((r) => setTimeout(() => r("failed"), 3000))]);
    if (profile === "failed") {
      // Write without the profile and say so; the next tap tries to load it again.
      profileRef.current = null;
      if (!profileWarned.current && mode === "suggest") toast("We couldn't load your profile, so this one won't be tailored to you.");
      profileWarned.current = true;
      profile = null;
    }
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
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/script", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      const data = (await res.json().catch(() => ({}))) as Partial<WriteResult> & { error?: string };
      if (res.ok && (data.kind === "question" || data.kind === "redirect") && data.message) {
        setCoach(data.message);
        return null;
      }
      // The server already cleans lines; still accept only real, non-empty strings.
      const lines = Array.isArray(data.lines) ? data.lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0).map((l) => l.trim()) : [];
      if (!res.ok || !lines.length) return { error: typeof data.error === "string" ? data.error : res.status === 401 ? "unauthorized" : "upstream" };
      return lines;
    } catch {
      return { error: ctrl.signal.aborted ? "aborted" : "offline" };
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }

  /** Stops the request in flight. Nothing in the box changes. */
  function cancel() {
    abortRef.current?.abort();
  }

  const reason = (error: string) => WRITE_ERRORS[error] ?? (error === "offline" ? "We couldn't reach our script writer." : "Our script writer had a hiccup.");

  async function suggest() {
    if (busy) return;
    const another = showingSuggestion;
    setBusy("suggest");
    setCoach(null);
    try {
      const body = await context("suggest");
      // Cached for this day and this profile (or the onboarding script): instant and free.
      const sig = profileSig(body);
      const ready = !another && !ask.trim() ? (loadSuggestion(prompt.id, sig) ?? suggested) : null;
      if (ready?.length && linesToText(ready) !== text) {
        apply(ready, "suggestion");
        return;
      }
      const out = await callWriter(body);
      if (!out) return;
      if (Array.isArray(out)) {
        saveSuggestion(prompt.id, out, sig);
        apply(out, "suggestion");
        return;
      }
      if (out.error === "aborted") return;
      if (out.error === "refused" || out.error === "unauthorized") return void toast.error(reason(out.error));
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
      if (out.error === "aborted") return;
      if (out.error === "refused" || out.error === "unauthorized" || out.error === "too_long") return void toast.error(reason(out.error));
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
            : draftTooLong
              ? `Too long to polish (over ${MAX_DRAFT_CHARS.toLocaleString("en")} characters). Cut it down first.`
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

        {restored !== null && text === restored && (
          <p className="bg-mist mt-3 rounded-[20px] px-4 py-2.5 text-sm">We kept the text you hadn&apos;t saved yet.</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <YapButton variant={text.trim() ? "soft" : "primary"} className="h-auto min-h-12 py-2 whitespace-normal text-center leading-tight" onClick={() => void suggest()} disabled={Boolean(busy)} aria-busy={busy === "suggest"}>
            {busy === "suggest" ? <LoaderCircle className="animate-spin" /> : showingSuggestion ? <RefreshCw /> : <Sparkles />}
            {busy === "suggest" ? "Writing…" : showingSuggestion ? "Try another" : "Use our suggestion"}
          </YapButton>
          <YapButton
            variant={canPolish ? "primary" : "soft"}
            className="h-auto min-h-12 py-2 whitespace-normal text-center leading-tight"
            onClick={() => void polish()}
            disabled={!canPolish}
            aria-busy={busy === "polish"}
            title={canPolish ? undefined : `Type at least ${MIN_POLISH_WORDS} words of your own first`}
          >
            {busy === "polish" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
            {busy === "polish" ? "Polishing…" : "Polish it for me"}
          </YapButton>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3 px-1">
          <p role="status" aria-live="polite" className="text-stone text-sm leading-snug">{hint}</p>
          {busy && (
            <button onClick={cancel} className="text-stone hover:text-ink shrink-0 text-sm font-semibold underline-offset-4 hover:underline">
              Cancel
            </button>
          )}
        </div>

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
            <button onClick={() => { setText(""); setAi(null); }} className="text-stone hover:text-ink -my-2 inline-flex min-h-11 min-w-11 items-center justify-center px-2 font-semibold underline-offset-4 hover:underline">Clear</button>
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
          {Boolean(initial?.length) && (
            <YapButton variant="ghost" size="sm" onClick={() => save([])} disabled={Boolean(busy)}>
              <Trash2 /> Remove script
            </YapButton>
          )}
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
            onClick={() => save(lines)}
          >
            Save script
          </YapButton>
          <p className="text-stone mt-2 text-center text-xs">Saved on this device for this day&apos;s yap.</p>
        </div>
      </div>
    </div>
  );
}
