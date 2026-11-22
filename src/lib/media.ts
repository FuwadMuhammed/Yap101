// Recording helpers that don't depend on React: the clip format, the voice filter, the camera
// zoom and small browser utilities. Used by the recorder.
import { audioContextClass } from "@/lib/analysis/audio";

export type MediaMode = "video" | "audio";

// iOS Safari records mp4; Chrome/Edge usually webm. mp4 first so clips share cleanly to IG/TikTok.
export function pickMimeType(mode: MediaMode) {
  const candidates =
    mode === "video"
      ? ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}
export const extFor = (mime: string) => (mime.includes("mp4") ? (mime.startsWith("audio") ? "m4a" : "mp4") : "webm");
export const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
export const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
};

/** Browser-specific steps for unblocking the camera. */
export function unblockHelp(mode: MediaMode) {
  const what = mode === "video" ? "camera and microphone" : "microphone";
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return `On iPhone: open Settings › Safari › ${mode === "video" ? "Camera" : "Microphone"} › Allow, then reload this page.`;
  if (/Android/.test(ua)) return `Tap the lock icon next to the address, turn on ${what}, then reload.`;
  return `Click the camera icon in the address bar, allow ${what}, then reload.`;
}

/** Front cameras on some phones start slightly zoomed; ask for the widest view they allow. */
export async function widestZoom(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  try {
    const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number } }) | undefined;
    if (caps?.zoom) await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] });
  } catch {
    /* not supported: keep the default */
  }
}

/**
 * A light voice chain for the recording: cut low rumble (traffic, AC, desk bumps), lift
 * speech presence a touch, and gently even out loud and quiet words. Falls back to the raw
 * mic if the browser can't do it. Video tracks pass straight through.
 */
export function voiceChain(stream: MediaStream): { stream: MediaStream; close: () => void } | null {
  const mic = stream.getAudioTracks()[0];
  if (!mic) return null;
  try {
    const Ctx = audioContextClass();
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(new MediaStream([mic]));
    const highpass = Object.assign(ctx.createBiquadFilter(), { type: "highpass" });
    highpass.frequency.value = 85;
    const mud = Object.assign(ctx.createBiquadFilter(), { type: "peaking" });
    mud.frequency.value = 300;
    mud.gain.value = -2;
    mud.Q.value = 1;
    const presence = Object.assign(ctx.createBiquadFilter(), { type: "peaking" });
    presence.frequency.value = 3200;
    presence.gain.value = 2.5;
    presence.Q.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -26;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.2;
    const out = ctx.createMediaStreamDestination();
    src.connect(highpass).connect(mud).connect(presence).connect(comp).connect(out);
    void ctx.resume();
    const track = out.stream.getAudioTracks()[0];
    if (!track) throw new Error("no processed track");
    return {
      stream: new MediaStream([...stream.getVideoTracks(), track]),
      close: () => void ctx.close().catch(() => {}),
    };
  } catch {
    return null;
  }
}
