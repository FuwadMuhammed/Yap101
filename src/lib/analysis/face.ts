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
};

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

type Sample = { t: number; face: boolean; looking: boolean; smile: boolean; h?: number; eye?: number; yaw?: number; pitch?: number; luma?: number; frameLuma?: number };

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

  async start(video: HTMLVideoElement | null) {
    if (!video) return;
    // Times are from the start of recording (the hook window), not from when the model loaded.
    this.startedAt = performance.now();
    const model = await loadFaceModel();
    if (!model) return;
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
        if (!shapes) return this.samples.push({ t: now - this.startedAt, face: false, looking: false, smile: false });
        const s = (name: string) => shapes.find((c) => c.categoryName === name)?.score ?? 0;
        const side = Math.max(s("eyeLookOutLeft"), s("eyeLookOutRight"), s("eyeLookInLeft"), s("eyeLookInRight"));
        // Reading the teleprompter (just under the camera) looks a little down; allow for it.
        const down = Math.max(s("eyeLookDownLeft"), s("eyeLookDownRight"));
        const up = Math.max(s("eyeLookUpLeft"), s("eyeLookUpRight"));
        const yaw = headYaw(r.facialTransformationMatrixes[0]?.data);
        const looking = side < 0.5 && down < 0.7 && up < 0.6 && Math.abs(yaw) < 22;
        const smile = (s("mouthSmileLeft") + s("mouthSmileRight")) / 2 > 0.35;
        const sample: Sample = { t: now - this.startedAt, face: true, looking, smile, yaw, pitch: headPitch(r.facialTransformationMatrixes[0]?.data) };
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
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const all = this.samples;
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
      eyeContact: share(faces, (x) => x.looking),
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
