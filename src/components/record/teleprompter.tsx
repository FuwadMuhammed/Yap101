"use client";

import { useEffect, useRef } from "react";
import type { Script } from "@/lib/prompter";
import { cn } from "@/lib/utils";

/**
 * Script mode: every word is a span. Said words stay bright, the current word is highlighted,
 * emphasis words are underlined and pauses are marked. Points mode: one line lit at a time.
 * The view keeps the current line near the top third, so the reader's eyes stay near the lens.
 */
export function Teleprompter({
  title,
  script,
  points,
  index,
  onJump,
  sizeClass,
  footer,
}: {
  title: string;
  script: Script | null;
  points: string[];
  index: number;
  onJump: (i: number) => void;
  sizeClass: string;
  footer?: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const currentLine = script ? script.lines.findIndex((l) => l.words.some((w) => w.i === index)) : index;
  const line = script ? script.lines[currentLine === -1 ? script.lines.length - 1 : currentLine] : null;

  // Keep the current word's row about a third of the way down. Only scrolls when the
  // highlight moves to a new row, so the text doesn't jitter on every word.
  const lastTop = useRef(-1);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const last = script ? script.words.length - 1 : points.length - 1;
    const at = Math.min(index, last);
    const el = box.querySelector<HTMLElement>(script ? `[data-w="${at}"]` : `[data-line="${at}"]`);
    if (!el) return;
    if (at === 0) {
      lastTop.current = -1;
      box.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (el.offsetTop === lastTop.current) return;
    lastTop.current = el.offsetTop;
    box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight * 0.3), behavior: "smooth" });
  }, [index, script, points.length]);

  return (
    <div>
      {line && (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold" aria-live="polite">
          <span aria-hidden>{line.cue.emoji}</span> {line.cue.label}
        </p>
      )}
      <div ref={boxRef} className="prompter-mask relative h-44 overflow-hidden sm:h-52">
        <p className="mb-3 text-sm font-semibold text-white/60">{title}</p>
        <div className={cn("font-display space-y-4 pb-40 leading-snug font-bold", sizeClass)}>
          {script
            ? script.lines.map((l, li) => (
                <p key={li} data-line={li} className="transition-opacity duration-300">
                  {l.words.map((w) => (
                    <span key={w.i}>
                      <button
                        type="button"
                        data-w={w.i}
                        onClick={() => onJump(w.i)}
                        className={cn(
                          "rounded-md px-0.5 transition-colors duration-150",
                          w.i < index && "text-white",
                          w.i === index && "bg-yap text-white",
                          w.i > index && "text-white/40",
                          w.emphasis && "decoration-yap underline decoration-[3px] underline-offset-[6px]",
                          w.emphasis && w.i === index && "decoration-white",
                        )}
                      >
                        {w.text}
                      </button>
                      {w.pause !== "none" && <span className="text-yap/80 px-0.5 font-normal" aria-hidden>{w.pause === "long" ? " ‖" : " /"}</span>}{" "}
                    </span>
                  ))}
                </p>
              ))
            : points.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  data-line={i}
                  onClick={() => onJump(i)}
                  className={cn("block text-left transition-colors duration-300", i === index ? "text-white" : i < index ? "text-white/35" : "text-white/50")}
                >
                  {t}
                </button>
              ))}
          {footer}
        </div>
      </div>
    </div>
  );
}

/** The script on the prep card: same emphasis and pause marks, plus each line's cue. */
export function ScriptPreview({ script }: { script: Script }) {
  return (
    <div className="mt-3 space-y-3">
      {script.lines.map((l, li) => (
        <div key={li}>
          <p className="text-stone text-xs font-bold">
            <span aria-hidden>{l.cue.emoji}</span> {l.cue.label}
          </p>
          <p className="mt-0.5 text-lg leading-snug font-medium">
            {l.words.map((w) => (
              <span key={w.i}>
                <span className={cn(w.emphasis && "decoration-yap font-bold underline decoration-2 underline-offset-4")}>{w.text}</span>
                {w.pause !== "none" && <span className="text-yap px-0.5" aria-hidden>{w.pause === "long" ? " ‖" : " /"}</span>}{" "}
              </span>
            ))}
          </p>
        </div>
      ))}
      <p className="text-stone flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span><span className="decoration-yap font-bold underline decoration-2 underline-offset-2">Underlined</span> = push on it</span>
        <span><span className="text-yap">/</span> = short pause</span>
        <span><span className="text-yap">‖</span> = breathe</span>
      </p>
    </div>
  );
}
