"use client";

import { FileUp, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { YapButton } from "@/components/yap/yap-button";
import { buildScript, estimateSeconds } from "@/lib/prompter";
import { linesToText, textToLines } from "@/lib/script";
import { MAX_SECONDS } from "@/lib/yap";

/**
 * Full-screen sheet for writing, pasting or importing a teleprompter script.
 * Each line (or sentence) becomes one teleprompter line.
 */
export function ScriptEditor({
  initial,
  suggested,
  points,
  onSave,
  onClose,
}: {
  initial: string[] | null;
  /** The script we made from their onboarding answers, if this day has one. */
  suggested: string[] | null;
  points: string[];
  onSave: (lines: string[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(linesToText(initial));
  const fileRef = useRef<HTMLInputElement>(null);
  const lines = textToLines(text);
  const words = lines.join(" ").split(/\s+/).filter(Boolean).length;
  const seconds = lines.length ? estimateSeconds(buildScript(lines), 150) : 0;
  const tooLong = seconds > MAX_SECONDS;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
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

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit your script" className="bg-paper fixed inset-0 z-50 flex justify-center overflow-y-auto">
      <div className="flex min-h-full w-full max-w-lg flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="surface tap grid size-11 place-items-center rounded-full" aria-label="Close without saving">
            <X className="size-5" />
          </button>
          <p className="font-display text-lg font-bold">Your script</p>
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

        <div className="mt-4 flex flex-wrap gap-2">
          <YapButton variant="soft" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp /> Import .txt
          </YapButton>
          <input ref={fileRef} type="file" accept=".txt,text/plain" className="hidden" onChange={(e) => void importFile(e.target.files?.[0])} />
          {suggested && (
            <YapButton variant="soft" size="sm" onClick={() => setText(linesToText(suggested))}>
              <RotateCcw /> Use our suggestion
            </YapButton>
          )}
          <span className="bg-mist text-stone inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold" title="Coming soon">
            <Sparkles className="size-4" /> Write it for me
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink">Soon</span>
          </span>
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
