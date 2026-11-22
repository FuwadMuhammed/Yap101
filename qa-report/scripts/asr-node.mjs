// Runs the same free on-device speech model as the app (src/lib/analysis/asr.worker.ts) in Node,
// to check it keeps filler words and gives word timestamps.
//   espeak-ng -w /tmp/s.wav "Um, so today, uh, I want to talk about sleep. Follow for more."
//   ffmpeg -y -i /tmp/s.wav -ar 16000 -ac 1 -f f32le /tmp/s.f32
//   NODE_USE_ENV_PROXY=1 node qa-report/scripts/asr-node.mjs /tmp/s.f32 [model] ['{"encoder_model":"q8","decoder_model_merged":"q8"}']
import fs from "node:fs";
import { pipeline } from "@huggingface/transformers";

const raw = fs.readFileSync(process.argv[2]); // 16 kHz mono float32
const audio = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
const model = process.argv[3] ?? "onnx-community/whisper-base_timestamped";
const dtype = process.argv[4] ? JSON.parse(process.argv[4]) : { encoder_model: "q8", decoder_model_merged: "q8" };
const t0 = Date.now();
const asr = await pipeline("automatic-speech-recognition", model, { dtype });
const t1 = Date.now();
const r = await asr(audio, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5, language: "english", task: "transcribe" });
console.log(`load ${t1 - t0} ms, transcribe ${Date.now() - t1} ms for ${(audio.length / 16000).toFixed(1)} s`);
console.log(r.text);
console.log(r.chunks.map((c) => `${c.text.trim()}@${c.timestamp[0]?.toFixed(2)}-${c.timestamp[1]?.toFixed(2)}`).join(" "));
