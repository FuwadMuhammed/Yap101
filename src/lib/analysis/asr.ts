"use client";

// On-device transcription for the Yap score's filler, close and hedging measures (see
// asr.worker.ts). transcribe() decodes the recorded clip to 16 kHz mono and hands it to the
// worker; one worker is shared by every take on the page.
import { audioContextClass } from "./audio";
import type { Word } from "./transcript";

export type AsrProgress = { stage: "download"; pct: number } | { stage: "transcribing" };

let worker: Worker | null = null;
let nextId = 1;
let pending = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** The loaded model holds 100+ MB; free it when no take has needed it for a minute. */
const IDLE_MS = 60_000;

function getWorker() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  worker ??= new Worker(new URL("./asr.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

function release() {
  if (--pending > 0) return;
  idleTimer = setTimeout(() => {
    worker?.terminate();
    worker = null;
  }, IDLE_MS);
}

/** The clip's audio as 16 kHz mono samples (what Whisper expects). */
export async function decodeTo16k(blob: Blob): Promise<Float32Array> {
  const Ctx = audioContextClass();
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
  pending++;
  return new Promise<Word[]>((resolve, reject) => {
    const finish = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      release();
    };
    const onMessage = (e: MessageEvent<{ id: number; type: string; pct?: number; words?: Word[]; message?: string }>) => {
      if (e.data.id !== id) return;
      if (e.data.type === "download") onProgress?.({ stage: "download", pct: e.data.pct ?? 0 });
      else if (e.data.type === "transcribing") onProgress?.({ stage: "transcribing" });
      else {
        finish();
        if (e.data.type === "done") resolve(e.data.words ?? []);
        else reject(new Error(e.data.message ?? "transcription failed"));
      }
    };
    // The worker script itself failed to load (offline, blocked): don't wait forever.
    const onError = (e: ErrorEvent) => {
      finish();
      worker = null;
      reject(new Error(e.message || "speech worker failed to start"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, audio }, [audio.buffer]);
  });
}
