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

type Sample = { t: number; face: boolean; looking: boolean; smile: boolean };

export class FaceMeter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private samples: Sample[] = [];
  private startedAt = 0;

  async start(video: HTMLVideoElement | null) {
    if (!video) return;
    const model = await loadFaceModel();
    if (!model) return;
    this.startedAt = performance.now();
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
        this.samples.push({ t: now - this.startedAt, face: true, looking, smile });
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
    return {
      inFrame: faces.length / all.length,
      eyeContact: share(faces, (x) => x.looking),
      smiling: share(faces, (x) => x.smile),
      smiledAtStart: faces.some((x) => x.t <= 3000 && x.smile),
      samples: all.length,
    };
  }
}

/** Left/right head turn in degrees from the 4x4 face transform (column-major). */
function headYaw(m?: number[]) {
  if (!m || m.length < 16) return 0;
  return (Math.atan2(-m[2], Math.hypot(m[0], m[1])) * 180) / Math.PI;
}
