// Speech recognition in a Web Worker, so the screen never freezes. Free and on-device:
// Hugging Face Transformers.js running OpenAI's Whisper (MIT) from the Hugging Face Hub.
// The model (~77 MB with WebAssembly, ~95 MB with WebGPU) downloads once and is cached by the
// browser; the audio never leaves the phone.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

/** whisper-base keeps "um"/"uh" and gives word timestamps (tested in qa-report/scripts/asr-node.mjs). */
const MODEL = "onnx-community/whisper-base_timestamped";

env.allowLocalModels = false;

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

async function load(progress: (pct: number) => void) {
  loading ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    const webgpu = Boolean(gpu && (await gpu.requestAdapter().catch(() => null)));
    // Byte progress across all model files, as one percentage.
    const files = new Map<string, { loaded: number; total: number }>();
    const onProgress = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status !== "progress" || !e.file || !e.total) return;
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
      let l = 0, t = 0;
      for (const f of files.values()) {
        l += f.loaded;
        t += f.total;
      }
      progress(Math.round((l / t) * 100));
    };
    const make = (device: "webgpu" | "wasm") =>
      pipeline("automatic-speech-recognition", MODEL, {
        device,
        // fp16 needs WebGPU; WebAssembly gets the 8-bit encoder (smaller, still keeps fillers).
        dtype: { encoder_model: device === "webgpu" ? "fp16" : "q8", decoder_model_merged: "q8" },
        progress_callback: onProgress,
      }) as Promise<AutomaticSpeechRecognitionPipeline>;
    return webgpu ? make("webgpu").catch(() => make("wasm")) : make("wasm");
  })();
  try {
    return await loading;
  } catch (e) {
    loading = null; // let a later take try again (e.g. after the connection comes back)
    throw e;
  }
}

type Chunk = { text: string; timestamp: [number | null, number | null] };

self.onmessage = async (e: MessageEvent<{ id: number; audio: Float32Array }>) => {
  const { id, audio } = e.data;
  const post = (m: object) => (self as unknown as Worker).postMessage({ id, ...m });
  try {
    const asr = await load((pct) => post({ type: "download", pct }));
    post({ type: "transcribing" });
    const out = (await asr(audio, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5, language: "english", task: "transcribe" })) as { text: string; chunks?: Chunk[] };
    const words = (out.chunks ?? [])
      .filter((c) => c.timestamp[0] !== null)
      .map((c) => ({ text: c.text.trim(), start: c.timestamp[0] as number, end: (c.timestamp[1] ?? c.timestamp[0]) as number }))
      .filter((w) => w.text);
    post({ type: "done", words });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
