"use client";

import { useCallback, useRef, useState } from "react";
import type { AsrProgress } from "@/lib/analysis/asr";
import { analyse, type AnalyseInput, type Analysis } from "@/lib/analysis/score";
import { fillerStats, withHiddenFillers } from "@/lib/analysis/transcript";

export type FillerStatus = AsrProgress | { stage: "done"; fillers: number } | { stage: "failed" } | null;
type Frames = { rms: number[]; times: number[] };

/**
 * The filler-word check for one take: free on-device Whisper (Hugging Face Transformers.js,
 * loaded on first use) transcribes the clip in the background, then the take is re-scored with
 * the words (fillers, clear close, hedging). Never blocks: `settle()` lets saving wait for it,
 * and the user can skip.
 */
export function useFillerCheck(onRescored: (analysis: Analysis) => void) {
  const [status, setStatus] = useState<FillerStatus>(null);
  const [waiting, setWaiting] = useState(false);
  const takeRef = useRef(0); // bumps on every new take, so a late transcript for an old one is ignored
  const doneRef = useRef<Promise<void> | null>(null);
  const skipRef = useRef<(() => void) | null>(null);
  const runningRef = useRef(false);

  const start = useCallback(
    (blob: Blob, input: AnalyseInput, frames: Frames) => {
      const take = ++takeRef.current;
      const current = () => take === takeRef.current;
      runningRef.current = true;
      setStatus({ stage: "download", pct: 0 });
      doneRef.current = (async () => {
        try {
          const { transcribe } = await import("@/lib/analysis/asr");
          const words = withHiddenFillers(await transcribe(blob, (p) => current() && setStatus(p)), frames);
          if (!current()) return;
          onRescored(analyse({ ...input, v2: { ...input.v2!, words } }));
          setStatus({ stage: "done", fillers: fillerStats(words).count });
        } catch (e) {
          console.warn("Filler check skipped:", e);
          if (current()) setStatus({ stage: "failed" });
        } finally {
          if (current()) runningRef.current = false;
        }
      })();
    },
    [onRescored],
  );

  /** A new take: forget the old one's result, even if it's still on its way. */
  const cancel = useCallback(() => {
    takeRef.current++;
    runningRef.current = false;
    doneRef.current = null;
    setStatus(null);
  }, []);

  /** Wait for a check still running (resolves at once if none, or when the user skips). */
  const settle = useCallback(async () => {
    if (!runningRef.current || !doneRef.current) return;
    setWaiting(true);
    await Promise.race([doneRef.current, new Promise<void>((r) => (skipRef.current = r))]);
    skipRef.current = null;
    setWaiting(false);
  }, []);

  const skip = useCallback(() => skipRef.current?.(), []);

  return { status, waiting, start, cancel, settle, skip };
}
