"use client";

// On-device transcription for the Yap score's filler, close and hedging measures (see
// asr.worker.ts). transcribe() decodes the recorded clip to 16 kHz mono and hands it to the
// worker; one worker is shared by every take on the page.
import type { Word } from "./transcript";

export type AsrProgress = { stage: "download"; pct: number } | { stage: "transcribing" };

let worker: Worker | null = null;
let nextId = 1;

function getWorker() {
  worker ??= new Worker(new URL("./asr.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** The clip's audio as 16 kHz mono samples (what Whisper expects). */
export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  } finally {
    void ctx.close().catch(() => {});
  }
}

/** Words with timestamps, or throws (no WebAssembly, offline on first use, undecodable clip). */
export async function transcribe(blob: Blob, onProgress?: (p: AsrProgress) => void): Promise<Word[]> {
  const audio = await decodeTo16k(blob);
  const w = getWorker();
  const id = nextId++;
  return new Promise<Word[]>((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; type: string; pct?: number; words?: Word[]; message?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.type === "download") onProgress?.({ stage: "download", pct: e.data.pct ?? 0 });
      else if (e.data.type === "transcribing") onProgress?.({ stage: "transcribing" });
      else {
        w.removeEventListener("message", onMessage);
        if (e.data.type === "done") resolve(e.data.words ?? []);
        else reject(new Error(e.data.message ?? "transcription failed"));
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, audio }, [audio.buffer]);
  });
}
