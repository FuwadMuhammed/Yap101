// On-device face measurements while recording (video yaps only), using MediaPipe Face
// Landmarker. The model (~4 MB) downloads once from Google's CDN and runs in the browser;
// no video frames leave the phone. Checks five times a second:
//  - is a face in frame, are the eyes on the lens (eye direction + head turn), are they smiling

import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export type FaceStats = {
  /** Share of checks with a face in frame (0-1). */
  inFrame: number;
  /** Share of in-frame checks looking at the lens (0-1). */
  eyeContact: number;
  /** Share of in-frame checks smiling (0-1). */
  smiling: number;
  /** Smiled within the first 3 seconds. */
  smiledAtStart: boolean;
  samples: number;
  /** Seconds from the start of recording until a face was first seen (null: never). */
  firstFaceAt: number | null;
  /** Smiled within the last 5 seconds. */
  smileClose: boolean;
  /** Face height as a share of the frame height (median), 0-1. */
  faceHeight: number | null;
  /** Eye line as a share of the frame height from the top (median), 0-1. */
  eyeLine: number | null;
  /** Head movement: mean of the yaw and pitch spread, in degrees. */
  headMovement: number | null;
  /** Face brightness, 0-255 (median of once-a-second checks). */
  faceLuma: number | null;
  /** Face brightness ÷ whole-frame brightness; well under 1 means backlit. */
  backlight: number | null;
  /** Gaze was judged against their own look at the lens during the countdown. */
  calibrated?: boolean;
};

/** Eye direction (blendshape scores, 0-1) and head turn (degrees) for one check. */
export type Gaze = { side: number; down: number; up: number; yaw: number };

/**
 * Looking at the lens? Without a calibration, fixed limits (reading the teleprompter just under
 * the camera looks a little down, so down gets the most room). With one (their own look at the
 * lens during the 3-2-1), limits are measured from their baseline: eye shape, glasses and where
 * the phone sits all shift the raw scores, so the same rule fits everyone better.
 */
export function isLooking(g: Gaze, base?: Gaze | null) {
  if (!base) return g.side < 0.5 && g.down < 0.7 && g.up < 0.6 && Math.abs(g.yaw) < 22;
  return g.side - base.side < 0.4 && g.down - base.down < 0.45 && g.up - base.up < 0.45 && Math.abs(g.yaw - base.yaw) < 18;
}

/** Median gaze over the calibration checks; null if fewer than 4 had a face or they weren't steady. */
export function gazeBaseline(samples: Gaze[]): Gaze | null {
  if (samples.length < 4) return null;
  const med = (f: (g: Gaze) => number) => [...samples.map(f)].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  const base = { side: med((g) => g.side), down: med((g) => g.down), up: med((g) => g.up), yaw: med((g) => g.yaw) };
  // Clearly not at the lens (looking away during the countdown): don't learn that as "the lens".
  return isLooking(base) ? base : null;
}

const VERSION = "1.1.1"; // keep in step with package.json
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let loading: Promise<FaceLandmarker | null> | null = null;

/** Loads once per page; resolves null if the device or network can't run it. */
export function loadFaceModel() {
  loading ??= (async () => {
    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      return await make("GPU").catch(() => make("CPU"));
    } catch {
      return null;
    }
  })();
  return loading;
}

type Sample = { t: number; face: boolean; gaze?: Gaze; smile: boolean; h?: number; eye?: number; yaw?: number; pitch?: number; luma?: number; frameLuma?: number };

/** Mean brightness (0-255) of a region of the video, drawn into a tiny canvas. */
function lumaOf(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  ctx.drawImage(video, x, y, w, h, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}

export class FaceMeter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private samples: Sample[] = [];
  private startedAt = 0;
  /** stop() can come before the model has loaded; then start() must not begin checking. */
  private stopped = false;

  /** Start recording time now. Checks before this (the countdown) are the gaze calibration. */
  markStart() {
    this.startedAt = performance.now();
  }

  /**
   * Starts checking. Call at the countdown with `startsIn` (ms until recording) to calibrate
   * gaze while they look at the lens; then markStart() when recording begins.
   */
  async start(video: HTMLVideoElement | null, startsIn = 0) {
    if (!video) return;
    // Times are from the start of recording (the hook window), not from when the model loaded.
    this.startedAt = performance.now() + startsIn;
    const model = await loadFaceModel();
    if (!model || this.stopped) return;
    let canvas: CanvasRenderingContext2D | null = null;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      canvas = c.getContext("2d", { willReadFrequently: true });
    } catch {
      canvas = null;
    }
    let tick = 0;
    this.timer = setInterval(() => {
      if (video.readyState < 2) return;
      const now = performance.now();
      try {
        const r = model.detectForVideo(video, now);
        const shapes = r.faceBlendshapes[0]?.categories;
        if (!shapes) return this.samples.push({ t: now - this.startedAt, face: false, smile: false });
        const s = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0;
        const side = Math.max(s("eyeLookOutLeft"), s("eyeLookOutRight"), s("eyeLookInLeft"), s("eyeLookInRight"));
        const down = Math.max(s("eyeLookDownLeft"), s("eyeLookDownRight"));
        const up = Math.max(s("eyeLookUpLeft"), s("eyeLookUpRight"));
        const yaw = headYaw(r.facialTransformationMatrixes[0]?.data);
        const smile = (s("mouthSmileLeft") + s("mouthSmileRight")) / 2 > 0.35;
        const sample: Sample = { t: now - this.startedAt, face: true, gaze: { side, down, up, yaw }, smile, yaw, pitch: headPitch(r.facialTransformationMatrixes[0]?.data) };
        const lm = r.faceLandmarks[0];
        if (lm?.length > 263) {
          let minX = 1, maxX = 0, minY = 1, maxY = 0;
          for (const p of lm) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          sample.h = maxY - minY;
          sample.eye = (lm[33].y + lm[263].y) / 2;
          // Lighting once a second: the face box vs the whole frame.
          if (canvas && tick++ % 5 === 0 && video.videoWidth) {
            const W = video.videoWidth, H = video.videoHeight;
            const x = Math.max(0, minX * W), y = Math.max(0, minY * H);
            const w = Math.max(8, Math.min(W - x, (maxX - minX) * W)), h = Math.max(8, Math.min(H - y, (maxY - minY) * H));
            sample.luma = lumaOf(canvas, video, x, y, w, h);
            sample.frameLuma = lumaOf(canvas, video, 0, 0, W, H);
          }
        }
        this.samples.push(sample);
      } catch {
        /* a dropped frame is fine */
      }
    }, 200);
  }

  stop(): FaceStats | null {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Countdown checks calibrate gaze; only the recording itself is measured.
    const base = gazeBaseline(this.samples.filter((x) => x.t < 0 && x.gaze).map((x) => x.gaze!));
    const all = this.samples.filter((x) => x.t >= 0);
    if (all.length < 5) return null;
    const faces = all.filter((x) => x.face);
    const share = (xs: Sample[], f: (x: Sample) => boolean) => (xs.length ? xs.filter(f).length / xs.length : 0);
    const nums = (f: (x: Sample) => number | undefined) => faces.map(f).filter((v): v is number => typeof v === "number");
    const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
    const sd = (xs: number[]) => {
      if (xs.length < 5) return null;
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const lastT = all[all.length - 1].t;
    const yawSd = sd(nums((x) => x.yaw)), pitchSd = sd(nums((x) => x.pitch));
    const lit = faces.filter((x) => typeof x.luma === "number" && typeof x.frameLuma === "number");
    const round = (v: number | null, d = 3) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
    return {
      inFrame: faces.length / all.length,
      eyeContact: share(faces, (x) => Boolean(x.gaze && isLooking(x.gaze, base))),
      smiling: share(faces, (x) => x.smile),
      smiledAtStart: faces.some((x) => x.t <= 3000 && x.smile),
      samples: all.length,
      firstFaceAt: faces.length ? round(faces[0].t / 1000, 2) : null,
      smileClose: faces.some((x) => x.t >= lastT - 5000 && x.smile),
      faceHeight: round(med(nums((x) => x.h))),
      eyeLine: round(med(nums((x) => x.eye))),
      headMovement: yawSd === null || pitchSd === null ? null : round((yawSd + pitchSd) / 2, 1),
      faceLuma: round(med(lit.map((x) => x.luma!)), 0),
      backlight: round(med(lit.map((x) => x.luma! / Math.max(1, x.frameLuma!))), 2),
      calibrated: base !== null,
    };
  }
}

/** Up/down head tilt in degrees from the 4x4 face transform (column-major). */
function headPitch(m?: number[]) {
  if (!m || m.length < 16) return 0;
  return (Math.atan2(m[6], m[10]) * 180) / Math.PI;
}

/** Left/right head turn in degrees from the 4x4 face transform (column-major). */
function headYaw(m?: number[]) {
  if (!m || m.length < 16) return 0;
  return (Math.atan2(-m[2], Math.hypot(m[0], m[1])) * 180) / Math.PI;
}
