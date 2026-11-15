"use client";

import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Script } from "@/lib/prompter";
import { cn } from "@/lib/utils";

/**
 * Script mode: every word is a span. Said words stay bright, the current word is highlighted,
 * emphasis words are underlined and pauses are marked. Points mode: one line lit at a time.
 * The view keeps the current line near the top third, so the reader's eyes stay near the lens.
 * Drag or scroll to look back or ahead; it stops following until you tap "Back to current"
 * (or after a few seconds of not touching it).
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

  const lastTop = useRef(-1); // offsetTop of the row we last scrolled to (-2 = force)
  // While the reader scrolls by hand, don't yank the view back to the current word.
  const [browsing, setBrowsing] = useState(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrolled = useCallback(() => {
    setBrowsing(true);
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      lastTop.current = -2;
      setBrowsing(false);
    }, 5000);
  }, []);
  // Which way the current word is from where the reader has scrolled, for the button's arrow.
  const [currentIs, setCurrentIs] = useState<"above" | "below">("below");
  const updateDirection = () => {
    const box = boxRef.current;
    if (!box) return;
    const last = script ? script.words.length - 1 : points.length - 1;
    const el = box.querySelector<HTMLElement>(script ? `[data-w="${Math.min(index, last)}"]` : `[data-line="${Math.min(index, last)}"]`);
    if (el) setCurrentIs(el.offsetTop < box.scrollTop + box.clientHeight * 0.3 ? "above" : "below");
  };
  const backToCurrent = () => {
    if (idleRef.current) clearTimeout(idleRef.current);
    lastTop.current = -2; // force a scroll on the next pass
    setBrowsing(false);
  };
  useEffect(() => () => void (idleRef.current && clearTimeout(idleRef.current)), []);

  // Keep the current word's row about a third of the way down. Only scrolls when the
  // highlight moves to a new row, so the text doesn't jitter on every word.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || browsing) return;
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
  }, [index, script, points.length, browsing]);

  return (
    <div>
      {line && (
        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold" aria-live="polite">
          <span aria-hidden>{line.cue.emoji}</span> {line.cue.label}
        </p>
      )}
      <div
        ref={boxRef}
        onWheel={userScrolled}
        onScroll={() => browsing && updateDirection()}
        onTouchMove={userScrolled}
        onPointerDown={(e) => e.pointerType === "mouse" && e.buttons === 1 && e.target === e.currentTarget && userScrolled()}
        className="prompter-mask relative h-44 touch-pan-y overflow-y-auto overscroll-contain [scrollbar-width:none] sm:h-52 [&::-webkit-scrollbar]:hidden"
        aria-label="Script. Scroll to read back or ahead."
      >
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
                          w.i === index && "bg-yap text-ink",
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
      {browsing && (
        <button
          type="button"
          onClick={backToCurrent}
          className="glass -mt-10 relative z-10 mx-auto mb-2 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold"
        >
          {currentIs === "above" ? <ArrowUpToLine className="size-4" /> : <ArrowDownToLine className="size-4" />} Back to current
        </button>
      )}
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
