"use client";

import { AudioLines, Camera, PencilLine, ChevronLeft, Minus, MessageCircle, Plus, ScrollText, Eye, Lightbulb, Lock, Mic, RotateCcw, Share2, SlidersHorizontal, Star, SwitchCamera, Target, Timer, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Mascot, MascotSays, Yapper, YAPPY_BLUE } from "@/components/brand/mascot";
import { Slider } from "@/components/ui/slider";
import { YapButton } from "@/components/yap/yap-button";
import { api, DailyLimitError } from "@/lib/data";
import { xpForYap } from "@/lib/game";
import { cn } from "@/lib/utils";
import { TARGET_SECONDS, visiblePoints, weekFor } from "@/lib/curriculum";
import { localDate, MAX_SECONDS, type Level, type Prompt } from "@/lib/yap";
import { buildScript, estimateSeconds, followPosition, speechRecognitionCtor, snapToBreak, syllableOffsets, wordAtSyllable, wordDuration } from "@/lib/prompter";
import { checkDelivery } from "@/lib/analysis/delivery";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { loadScript, saveScript } from "@/lib/script";
import { ShareSheet, prefersNativeShare, shareCaption, shareNatively } from "@/components/yap/share-sheet";
import { ScriptEditor } from "./script-editor";
import { ScriptPreview, Teleprompter } from "./teleprompter";
import { AudioMeter } from "@/lib/analysis/audio";
import { FaceMeter, loadFaceModel } from "@/lib/analysis/face";
import { analyse, type Analysis } from "@/lib/analysis/score";

type Mode = "video" | "audio";
type Pace = "auto" | "beats" | "voice";
type Facing = "user" | "environment";
type Phase = "prep" | "setup" | "countdown" | "recording" | "review" | "saving";
const TEXT_SIZES = { S: "text-xl", M: "text-[26px]", L: "text-[32px]" } as const;
type TextSize = keyof typeof TEXT_SIZES;

// iOS Safari records mp4; Chrome/Edge usually webm. mp4 first so clips share cleanly to IG/TikTok.
function pickMimeType(mode: Mode) {
  const candidates =
    mode === "video"
      ? ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]
      : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}
// beginRecording runs from the countdown, never during render; the compiler can't tell.
const clock = () => performance.now();
const extFor = (mime: string) => (mime.includes("mp4") ? (mime.startsWith("audio") ? "m4a" : "mp4") : "webm");
const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
};

/** Browser-specific steps for unblocking the camera. */
function unblockHelp(mode: Mode) {
  const what = mode === "video" ? "camera and microphone" : "microphone";
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return `On iPhone: open Settings › Safari › ${mode === "video" ? "Camera" : "Microphone"} › Allow, then reload this page.`;
  if (/Android/.test(ua)) return `Tap the lock icon next to the address, turn on ${what}, then reload.`;
  return `Click the camera icon in the address bar, allow ${what}, then reload.`;
}

/** Front cameras on some phones start slightly zoomed; ask for the widest view they allow. */
async function widestZoom(stream: MediaStream) {
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
function voiceChain(stream: MediaStream): { stream: MediaStream; close: () => void } | null {
  const mic = stream.getAudioTracks()[0];
  if (!mic) return null;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

/** Video or audio only, as one clear switch. */
function ModeToggle({ mode, onChange, glass, className }: { mode: Mode; onChange: (m: Mode) => void; glass?: boolean; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Record as" className={cn("grid grid-cols-2 gap-1 rounded-full p-1", glass ? "glass" : "bg-mist", className)}>
      {([["video", "Video", Video], ["audio", "Audio only", Mic]] as const).map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={mode === v}
          onClick={() => onChange(v)}
          className={cn(
            "tap flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors",
            glass ? "h-9" : "h-11",
            mode === v ? (glass ? "bg-white text-ink" : "bg-white shadow-sm") : glass ? "text-white/80" : "text-stone hover:text-ink",
          )}
        >
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  );
}

export function Recorder({ prompt, firstToday, level, first, script }: { prompt: Prompt; firstToday: boolean; level: Level | null; first?: boolean; script?: string[] | null }) {
  // Any day can be read from a script: the one they wrote (saved on this device), or the one
  // we made from their onboarding answers (intro days). Beginners start in script mode when one exists.
  const [saved] = useState(() => loadScript(prompt.id));
  const [lines, setLines] = useState<string[] | null>(saved ?? script ?? null);
  const [useScript, setUseScript] = useState(Boolean(saved) || (Boolean(script) && level !== "pro" && level !== "intermediate"));
  const [editing, setEditing] = useState(false);
  const reading = Boolean(lines?.length && useScript);
  const talkingPoints = visiblePoints(prompt.talking_points, level);
  const points = reading ? lines! : talkingPoints;
  const model = useMemo(() => (reading && lines ? buildScript(lines) : null), [reading, lines]);
  const custom = Boolean(lines && lines !== script);
  // Length is a goal, not a rule: "free" means stop whenever you like (60 s is the cap).
  const [length, setLength] = useState<"free" | number>(() => (lines && useScript ? "free" : TARGET_SECONDS[level ?? "beginner"]));
  const target = length === "free" ? null : length;
  const [wpm, setWpm] = useState(150);
  // auto: timed word by word. beats: moves with the syllable beats in your voice (on-device).
  // voice: browser speech recognition matches the actual words.
  const [pace, setPace] = useState<Pace>("auto");
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [cursor, setCursor] = useState(0); // word index (script) or line index (points)
  const router = useRouter();
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  const [mode, setMode] = useState<Mode>("video");
  const [facing, setFacing] = useState<Facing>("user");
  const [phase, setPhase] = useState<Phase>("prep");
  // The camera is only requested after the user taps "Turn on camera" on the prep card.
  const [cameraOn, setCameraOn] = useState(false);
  const [count, setCount] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [textSize, setTextSize] = useState<TextSize>("M");
  // Some people want a clean frame: the teleprompter can be hidden and brought back any time.
  const [prompterOn, setPrompterOn] = useState(true);
  const [landscape, setLandscape] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [clip, setClip] = useState<{ blob: Blob; url: string; seconds: number; analysis: Analysis | null } | null>(null);
  // On-device analysis: voice meter always, face meter for video. Nothing is uploaded.
  const audioMeterRef = useRef<AudioMeter | null>(null);
  const voiceRef = useRef<{ stream: MediaStream; close: () => void } | null>(null);
  const faceMeterRef = useRef<FaceMeter | null>(null);
  const cursorRef = useRef(0);
  const usedVoiceRef = useRef(false);
  const usedPacedRef = useRef(false);
  // Voice pacing state, read from the mic callback (refs, so it never re-subscribes).
  const paceRef = useRef<Pace>("auto");
  const sylRef = useRef(0); // syllable beats heard so far (voice-paced)
  const beatsSinceRef = useRef(0); // beats since speech recognition last moved (follow backup)
  const lastRecogRef = useRef(0);
  const wordTimesRef = useRef<number[]>([]); // when each word became the current one
  const jumpedRef = useRef(false); // a tap-jump: don't re-sync until they speak again
  const offsets = useMemo(() => (model ? syllableOffsets(model.words) : [0]), [model]);
  // The camera screen is a full-screen layer; keep the page behind it still.
  useScrollLock(phase !== "prep");

  // Open the camera (or just the mic) once allowed, and again when mode or facing changes.
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    (async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Ask for clean speech: the browser's own noise suppression and echo cancellation.
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 },
          // The camera's natural frame. Asking for a tall 9:16 picture made phones crop the
          // sensor, which looked zoomed in; 4:3 is the full sensor on most phone cameras.
          video: mode === "video" ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 }, frameRate: { ideal: 30 } } : false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        await widestZoom(stream);
        streamRef.current = stream;
        if (previewRef.current) previewRef.current.srcObject = stream;
        setError(null);
      } catch {
        setError(unblockHelp(mode));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, facing, cameraOn]);

  useEffect(() => {
    cursorRef.current = cursor;
    // Note when each word comes up, so the delivery check can find its moment in the audio.
    if (phase === "recording" && paceRef.current !== "auto") {
      const now = performance.now() / 1000;
      for (let k = 1; k <= cursor; k++) wordTimesRef.current[k] ??= now;
    }
  }, [cursor, phase]);
  useEffect(() => {
    paceRef.current = pace;
  }, [pace]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioMeterRef.current?.stop();
      faceMeterRef.current?.stop();
      voiceRef.current?.close();
    },
    [],
  );

  // Start downloading the face model while they set up, so it's ready when they record.
  useEffect(() => {
    if (cameraOn && mode === "video") void loadFaceModel();
  }, [cameraOn, mode]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      buzz([20, 40, 20]);
    }
  }, []);

  // Timer + auto-stop at the 60 s cap.
  useEffect(() => {
    if (phase !== "recording") return;
    let frame = 0;
    const tick = (now: number) => {
      const secs = (now - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_SECONDS) return stop();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, stop]);

  // Voice follow needs the browser's speech recognition (Chrome, Edge, Safari).
  useEffect(() => {
    const ok = Boolean(speechRecognitionCtor());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceOk(ok);
    // No speech recognition (e.g. Firefox): voice-paced still works, all on the phone.
    if (!ok) setPace("beats");
  }, []);

  const total = model ? model.words.length : points.length;
  const rolling = phase === "recording" || previewing;
  const following = phase === "recording" && pace === "voice" && Boolean(model);
  const beatPaced = phase === "recording" && pace === "beats" && Boolean(model);

  // Auto pace: move the highlight word by word at the chosen speed (points: one per few seconds).
  useEffect(() => {
    if (!rolling || following || beatPaced || cursor >= total) return;
    const secs = model ? wordDuration(model.words[cursor], wpm) : Math.max(4, (target ?? 45) / Math.max(1, points.length)) * (150 / wpm);
    const t = setTimeout(() => setCursor((c) => c + 1), secs * 1000);
    return () => clearTimeout(t);
  }, [rolling, following, beatPaced, cursor, total, model, wpm, target, points.length]);

  // Voice follow: listen while recording and jump the highlight to the next unsaid word.
  useEffect(() => {
    if (!following || !model) return;
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    let active = true;
    let rec = new Ctor();
    const startRec = () => {
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      rec.onresult = (e) => {
        const heard: string[] = [];
        for (let r = 0; r < e.results.length; r++) heard.push(...e.results[r][0].transcript.split(/\s+/));
        const pos = followPosition(model.words, [...heardBefore, ...heard]);
        latest = heard;
        if (pos > cursorRef.current) {
          lastRecogRef.current = performance.now();
          beatsSinceRef.current = 0;
        }
        setCursor((c) => Math.max(c, pos));
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          active = false;
          usedVoiceRef.current = false;
          setPace("auto");
          toast("Voice follow isn't available here, so we switched to auto scroll.");
        }
      };
      // Browsers end a session after a silence; keep listening until the take ends.
      rec.onend = () => {
        if (!active) return setListening(false);
        heardBefore.push(...latest);
        latest = [];
        rec = new Ctor();
        startRec();
      };
      try {
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    };
    const heardBefore: string[] = [];
    let latest: string[] = [];
    startRec();
    return () => {
      active = false;
      setListening(false);
      try {
        rec.abort();
      } catch {}
    };
  }, [following, model]);

  // Browsers stop recording in background tabs, so end cleanly if the user leaves.
  useEffect(() => {
    const onHide = () => document.hidden && stop();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stop]);

  function startCountdown() {
    if (!streamRef.current) return;
    setShowSettings(false);
    setPreviewing(false);
    setCursor(0);
    sylRef.current = 0;
    beatsSinceRef.current = 0;
    wordTimesRef.current = [];
    setCount(3);
    setPhase("countdown");
  }

  function beginRecording() {
    const stream = streamRef.current;
    if (!stream) return setPhase("setup");
    const mimeType = pickMimeType(mode);
    // Record through a light voice filter, at a bitrate high enough for clear speech.
    const voice = voiceChain(stream);
    voiceRef.current = voice;
    const recorder = new MediaRecorder(voice?.stream ?? stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 128_000,
      ...(mode === "video" ? { videoBitsPerSecond: 2_500_000 } : {}),
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      voiceRef.current?.close();
      voiceRef.current = null;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
      const seconds = Math.min(MAX_SECONDS, (performance.now() - startedAtRef.current) / 1000);
      let analysis: Analysis | null = null;
      try {
        const meter = audioMeterRef.current;
        const audio = meter?.stop() ?? null;
        const paced = usedPacedRef.current && model && meter ? checkDelivery(model.words, wordTimesRef.current, meter.frames()) : null;
        analysis = analyse({
          audio,
          delivery: paced,
          face: faceMeterRef.current?.stop() ?? null,
          scriptDone: usedVoiceRef.current && model ? Math.min(1, cursorRef.current / model.words.length) : null,
          skill: prompt.skill,
        });
      } catch {
        /* analysis is a bonus; never block saving the clip */
      }
      audioMeterRef.current = faceMeterRef.current = null;
      setClip({ blob, url: URL.createObjectURL(blob), seconds, analysis });
      setPhase("review");
    };
    recorderRef.current = recorder;
    startedAtRef.current = clock();
    setElapsed(0);
    recorder.start(1000);
    usedVoiceRef.current = pace === "voice" && Boolean(model) && voiceOk;
    usedPacedRef.current = pace !== "auto" && Boolean(model);
    lastRecogRef.current = clock();
    const meter = new AudioMeter();
    meter.onBeat = () => onBeat();
    meter.onPause = () => onPause();
    audioMeterRef.current = meter;
    meter.start(stream);
    if (mode === "video") {
      faceMeterRef.current = new FaceMeter();
      void faceMeterRef.current.start(previewRef.current);
    }
    buzz(30);
    setPhase("recording");
  }

  // One syllable beat heard in the voice.
  function onBeat() {
    const m = model;
    if (!m) return;
    jumpedRef.current = false;
    if (paceRef.current === "beats") {
      sylRef.current++;
      const i = Math.min(m.words.length, wordAtSyllable(offsets, sylRef.current));
      setCursor((c) => Math.max(c, i));
    } else if (paceRef.current === "voice") {
      // Backup for speech recognition: if it goes quiet while they're clearly still talking,
      // nudge forward one word so the prompter never stalls.
      beatsSinceRef.current++;
      const c = cursorRef.current;
      const w = m.words[c];
      if (w && beatsSinceRef.current >= w.syl + 2 && performance.now() - lastRecogRef.current > 1200) {
        beatsSinceRef.current = 0;
        lastRecogRef.current = performance.now();
        setCursor((x) => Math.min(m.words.length, Math.max(x, c + 1)));
      }
    }
  }

  // A pause in the voice means they're at a comma or full stop: re-sync to the nearest one,
  // so small syllable-count errors never build up.
  function onPause() {
    if (paceRef.current !== "beats" || !model || jumpedRef.current) return;
    const j = snapToBreak(model.words, cursorRef.current);
    if (j === null || j === cursorRef.current) return;
    sylRef.current = offsets[j];
    setCursor(j);
  }

  // Tapping a word moves the voice-paced count there too.
  function jump(i: number) {
    setCursor(i);
    sylRef.current = offsets[i] ?? 0;
    beatsSinceRef.current = 0;
    jumpedRef.current = true;
  }

  function retake() {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setElapsed(0);
    setPhase("setup");
    requestAnimationFrame(() => {
      if (previewRef.current && streamRef.current) previewRef.current.srcObject = streamRef.current;
    });
    setCursor(0);
  }

  // 3-2-1 countdown, then record.
  useEffect(() => {
    if (phase !== "countdown") return;
    const t = setTimeout(() => (count <= 1 ? beginRecording() : setCount(count - 1)), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count]);

  // Leave the camera and go back to the prep card (script, mode, length). The camera turns off.
  function backToPrep() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setShowSettings(false);
    setPreviewing(false);
    setCursor(0);
    setCameraOn(false);
    setPhase("prep");
  }

  const [sharing, setSharing] = useState(false);
  const shareFile = useCallback(
    async () => (clip ? new File([clip.blob], `yap101-day-${prompt.day_index}.${extFor(clip.blob.type)}`, { type: clip.blob.type.split(";")[0] }) : null), // plain type: share targets reject codec params
    [clip, prompt.day_index],
  );

  async function save() {
    if (!clip) return;
    setPhase("saving");
    try {
      const { id } = await api.saveYap({ prompt, media: mode, blob: clip.blob, seconds: clip.seconds, localDate: localDate(), analysis: clip.analysis });
      router.push(`/feedback/${id}?celebrate=1`);
    } catch (e) {
      toast.error(e instanceof DailyLimitError ? e.message : (e as Error).message || "Couldn't save your yap.");
      setPhase("review");
    }
  }

  const live = phase === "setup" || phase === "countdown" || phase === "recording";
  const progress = Math.min(1, elapsed / (target ?? MAX_SECONDS));
  const hitTarget = target !== null && elapsed >= target;
  const estimate = model ? estimateSeconds(model, wpm) : null;
  const cycleLength = () => setLength((l) => (l === "free" ? 30 : l === 30 ? 45 : l === 45 ? 60 : "free"));
  const RING = 2 * Math.PI * 44;

  if (phase === "prep") {
    const week = weekFor(prompt.day_index);
    return (
      <div className="bg-grid flex min-h-[calc(100dvh-var(--banner-h,0px))] justify-center">
        <div className="flex w-full max-w-lg flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <Link href="/home" className="surface tap grid size-11 place-items-center rounded-full" aria-label="Back to today">
              <ChevronLeft className="size-5" />
            </Link>
            <span className="surface flex h-9 items-center rounded-full px-3.5 text-sm font-semibold">
              Day {prompt.day_index} · Week {week.n}: {week.theme}
            </span>
          </div>

          {first && <MascotSays mood="cheer" className="mt-6">Your first yap! Don&apos;t aim for perfect. Just talk.</MascotSays>}

          <h1 className="mt-6 text-[34px] leading-[1.08]">{prompt.title}</h1>
          {prompt.milestone && <p className="bg-sun mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold"><Star className="size-4 fill-current" /> Milestone yap: worth posting</p>}

          {/* Today's skill: a quiet tip, not a headline (the prompt above is the headline). */}
          <section className="bg-grape-soft mt-4 flex items-start gap-3 rounded-[20px] px-4 py-3">
            <span className="bg-grape mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"><Lightbulb className="size-3.5" /></span>
            <div className="min-w-0">
              <p className="text-sm"><span className="text-stone">Today&apos;s skill · </span><span className="font-semibold">{prompt.skill}</span></p>
              <p className="text-stone mt-0.5 text-sm leading-snug">{prompt.skill_tip}</p>
            </div>
          </section>

          <div role="radiogroup" aria-label="How do you want to do it?" className="bg-mist mt-3 grid grid-cols-2 gap-1 rounded-full p-1">
              {([[false, "My own words", MessageCircle], [true, "Read a script", ScrollText]] as const).map(([v, label, Icon]) => (
                <button
                  key={label}
                  role="radio"
                  aria-checked={useScript === v}
                  onClick={() => {
                    setUseScript(v);
                    if (v) setLength("free");
                    if (v && !lines?.length) setEditing(true);
                  }}
                  className={cn("tap flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors", useScript === v ? "bg-white shadow-sm" : "text-stone hover:text-ink")}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

          <section className="surface mt-3 rounded-[28px] p-5">
            {reading ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-stone text-sm font-semibold">{custom ? "Your script" : "Your script · made from your answers"}</p>
                  <button onClick={() => setEditing(true)} className="bg-mist tap flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold">
                    <PencilLine className="size-4" /> Edit
                  </button>
                </div>
                {model && <ScriptPreview script={model} />}
                <p className="text-stone mt-3 text-sm">The teleprompter highlights each word as you say it.</p>
              </>
            ) : (
              <>
                <p className="text-stone text-sm font-semibold">{level === "pro" ? "Your opener (improvise the rest)" : "Talking points"}</p>
                <ol className="mt-2 space-y-2">
                  {points.map((t, i) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="bg-mist grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">{i + 1}</span>
                      <span className="font-medium">{t}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <p className="text-stone mt-3 flex items-center gap-1.5 text-sm"><Target className="size-4" /> {prompt.focus}</p>
          </section>

          <ModeToggle mode={mode} onChange={setMode} className="mt-3" />

          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm font-semibold">
            <button onClick={cycleLength} className="surface tap flex flex-col items-center gap-1 rounded-[20px] py-3" aria-label={`Length: ${target ? `${target} second goal` : "no time limit"}. Tap to change.`}>
              <Timer className="size-4" />{target ? `${target}s goal` : "No limit"}
            </button>
            <span className="surface flex flex-col items-center gap-1 rounded-[20px] py-3"><Star className="size-4" />+{xpForYap(target ?? estimate ?? 0, firstToday)} XP</span>
          </div>

          <div className="sticky bottom-0 z-20 -mx-5 mt-auto bg-gradient-to-t from-paper from-70% to-paper/0 px-5 pt-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <p className="text-stone mb-3 flex items-center justify-center gap-1.5 text-center text-sm">
              <Lock className="size-3.5" /> Next, your browser asks for {mode === "video" ? "camera and mic" : "mic"} access. Your yap stays private.
            </p>
            <YapButton
              size="xl"
              block
              arrow
              onClick={() => {
                setCameraOn(true);
                setPhase("setup");
              }}
            >
              {mode === "video" ? <><Camera className="size-5" /> Turn on camera</> : <><Mic className="size-5" /> Turn on mic</>}
            </YapButton>
          </div>
        </div>
        {editing && (
          <ScriptEditor
            initial={lines}
            suggested={script ?? null}
            points={prompt.talking_points}
            onSave={(next) => {
              setLines(next);
              setUseScript(true);
              setCursor(0);
              saveScript(prompt.id, next);
              setEditing(false);
            }}
            onClose={() => {
              setEditing(false);
              if (!lines?.length) setUseScript(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="bg-ink fixed inset-0 z-40 flex items-center justify-center overscroll-none">
      <div
        className={cn(
          "relative h-full w-full overflow-hidden bg-black text-white md:rounded-[36px] md:border-[6px] md:border-white/10",
          // On a laptop the webcam is landscape, so the stage is too; phones stay portrait.
          mode === "video" && landscape ? "md:aspect-[4/3] md:h-[min(90dvh,760px)] md:w-auto" : "md:aspect-[9/16] md:h-[min(94dvh,880px)] md:w-auto",
        )}
      >
        {/* ---------- Stage ---------- */}
        {live &&
          (mode === "video" ? (
            <video
              ref={previewRef}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={(e) => setLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight)}
              // Show the whole frame (what gets recorded), never a cropped, zoomed-in slice.
              className={cn("absolute inset-0 h-full w-full object-contain", facing === "user" && "-scale-x-100")}
            />
          ) : (
            <div className="bg-[#1f2229] absolute inset-0 flex items-end justify-center">
              <Yapper shape="puff" color={YAPPY_BLUE} mood={phase === "recording" ? "talk" : "happy"} className={cn("mb-44 size-48 transition-opacity", phase === "recording" && "animate-wiggle", showSettings && phase === "setup" && "opacity-0")} />
            </div>
          ))}
        {clip && !live &&
          (mode === "video" ? (
            <video src={clip.url} controls playsInline autoPlay className="absolute inset-0 h-full w-full bg-black object-contain" />
          ) : (
            <div className="bg-[#1f2229] absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 pb-48">
              <Yapper shape="puff" color={YAPPY_BLUE} mood="cheer" className="size-40" />
              <audio src={clip.url} controls className="w-full" />
            </div>
          ))}

        {/* Soft top scrim so glass reads on bright scenes */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/45 to-transparent" />

        {/* ---------- Top: close + timer ---------- */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          {phase === "setup" ? (
            // Back to the prep card: change the script, mode or length before recording.
            <button onClick={backToPrep} className="glass flex h-10 items-center gap-1 rounded-full pr-4 pl-2.5 text-sm font-bold" aria-label="Back to your script">
              <ChevronLeft className="size-5" /> Script
            </button>
          ) : (
            <Link href="/home" className="glass grid size-10 place-items-center rounded-full" aria-label="Close">
              <X className="size-5" />
            </Link>
          )}
          <span
            className={cn(
              "glass flex h-10 items-center gap-2 rounded-full px-4 font-mono text-sm font-bold tabular-nums",
              phase === "recording" && (hitTarget ? "bg-mint text-ink" : "bg-[#ff3b30]/80"),
            )}
          >
            {phase === "recording" && <span className="size-2 animate-pulse rounded-full bg-white" />}
            {phase === "review" || phase === "saving" ? fmt(clip?.seconds ?? 0) : target ? `${fmt(elapsed)} / ${fmt(target)}` : fmt(elapsed)}
          </span>
        </div>

        {/* ---------- Teleprompter ---------- */}
        {live && !prompterOn && (
          <button
            onClick={() => setPrompterOn(true)}
            className="glass absolute top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] left-4 flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold"
          >
            <Eye className="size-4" /> Show teleprompter
          </button>
        )}
        {live && prompterOn && (
          <div className="glass-dark absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] rounded-3xl px-5 pt-4">
            <Teleprompter
              title={`Day ${prompt.day_index} · ${prompt.title}`}
              script={model}
              points={points}
              index={cursor}
              onJump={jump}
              sizeClass={TEXT_SIZES[textSize]}
              footer={
                !model && (
                  <>
                    {level === "pro" && <p className="text-white/50">Improvise the rest</p>}
                    <p className="text-white/50">{prompt.skill}: {prompt.focus}</p>
                  </>
                )
              }
            />
            {phase === "recording" && (
              <div className="-mx-1 flex items-center justify-between gap-2 pb-3 text-xs font-bold">
                {following || beatPaced ? (
                  <span className="flex items-center gap-1.5 text-white/80">
                    <AudioLines className={cn("size-4", (listening || beatPaced) && "animate-pulse")} /> {beatPaced ? "Pacing to your voice" : listening ? "Following your voice" : "Starting…"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <button onClick={() => setWpm((v) => Math.max(90, v - 15))} className="grid size-8 place-items-center rounded-full bg-white/15" aria-label="Slower"><Minus className="size-4" /></button>
                    <span className="w-16 text-center tabular-nums">{wpm} wpm</span>
                    <button onClick={() => setWpm((v) => Math.min(210, v + 15))} className="grid size-8 place-items-center rounded-full bg-white/15" aria-label="Faster"><Plus className="size-4" /></button>
                  </span>
                )}
                <span className="text-white/50">Tap a word to jump</span>
              </div>
            )}
          </div>
        )}

        {/* ---------- Pill controls ---------- */}
        {phase === "setup" && (
          <div className="absolute inset-x-4 z-10 top-[calc(max(1rem,env(safe-area-inset-top))+19rem)] sm:top-[calc(max(1rem,env(safe-area-inset-top))+21rem)]">
            <div className="flex items-center gap-2">
              <ModeToggle mode={mode} onChange={setMode} glass className="flex-1" />
              {mode === "video" && (
                <button onClick={() => setFacing(facing === "user" ? "environment" : "user")} className="glass grid size-11 place-items-center rounded-full" aria-label="Flip camera">
                  <SwitchCamera className="size-5" />
                </button>
              )}
              <button
                onClick={() => setShowSettings((s) => !s)}
                className={cn("glass grid size-11 place-items-center rounded-full", showSettings && "bg-white text-ink")}
                aria-label="Teleprompter settings"
                aria-expanded={showSettings}
              >
                <SlidersHorizontal className="size-5" />
              </button>
            </div>
            {showSettings && (
              <div className="glass-dark animate-rise mt-2 flex flex-col gap-3.5 rounded-3xl p-4">
                {model && (
                  <div className="flex flex-col gap-2 text-sm font-bold">
                    Teleprompter
                    <div className="grid grid-cols-3 gap-1 rounded-full bg-white/10 p-1">
                      {([["auto", "Auto scroll"], ["beats", "Voice-paced"], ["voice", "Follow voice"]] as const).map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setPace(v)}
                          disabled={v === "voice" && !voiceOk}
                          aria-pressed={pace === v}
                          className={cn("h-9 rounded-full text-[12px] disabled:opacity-40", pace === v ? "bg-white text-ink" : "text-white/80")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-white/60">
                      {pace === "beats"
                        ? "Moves as you talk and waits when you pause. It counts the beats in your voice on this phone, so nothing is sent anywhere. Best in a quiet room."
                        : pace === "voice"
                          ? "Moves to the next word as you say it. Uses your browser's speech recognition, which may send audio to Google or Apple."
                          : "Highlights word by word at your speed."}
                      {!voiceOk && " Follow voice needs Chrome, Edge or Safari."}
                    </p>
                  </div>
                )}
                {pace === "auto" || !model ? (
                  <label className="flex flex-col gap-3 text-sm font-bold">
                    <span className="flex justify-between">Speed <span className="text-white/60 tabular-nums">{wpm} words/min{wpm < 130 ? " · relaxed" : wpm > 170 ? " · fast" : " · natural"}</span></span>
                    <Slider min={90} max={210} step={5} value={[wpm]} onValueChange={(v) => setWpm(Array.isArray(v) ? v[0] : v)} />
                  </label>
                ) : null}
                <div className="flex items-center justify-between text-sm font-bold">
                  Length
                  <div className="flex gap-1">
                    {(["free", 30, 45, 60] as const).map((l) => (
                      <button key={l} onClick={() => setLength(l)} className={cn("h-9 rounded-full px-3", length === l ? "bg-white text-ink" : "bg-white/15")}>
                        {l === "free" ? "No limit" : `${l}s`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm font-bold">
                  Show teleprompter
                  <div className="flex gap-1">
                    {([[true, "On"], [false, "Off"]] as const).map(([v, label]) => (
                      <button key={label} onClick={() => setPrompterOn(v)} aria-pressed={prompterOn === v} className={cn("h-9 rounded-full px-3", prompterOn === v ? "bg-white text-ink" : "bg-white/15")}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm font-bold">
                  Text size
                  <div className="flex gap-1">
                    {(Object.keys(TEXT_SIZES) as TextSize[]).map((s) => (
                      <button key={s} onClick={() => setTextSize(s)} className={cn("size-9 rounded-full", textSize === s ? "bg-white text-ink" : "bg-white/15")}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {error && live && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-[28px] bg-white p-5 text-center text-ink">
            <Mascot mood="think" className="mx-auto size-16" />
            <p className="mt-2 font-bold">{mode === "video" ? "Camera is blocked" : "Microphone is blocked"}</p>
            <p className="text-stone mt-1 text-sm">{error}</p>
            {mode === "video" ? (
              <YapButton size="sm" variant="soft" className="mt-4" onClick={() => setMode("audio")}>
                <Mic /> Switch to audio only
              </YapButton>
            ) : (
              <YapButton size="sm" variant="soft" className="mt-4" onClick={() => setMode("video")}>
                <Video /> Back to video
              </YapButton>
            )}
          </div>
        )}

        {/* ---------- Countdown ---------- */}
        {phase === "countdown" && (
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <span key={count} className="font-display animate-pop text-[140px] leading-none drop-shadow-lg">{count}</span>
          </div>
        )}

        {/* ---------- Bottom: record controls ---------- */}
        {live && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
            {phase === "setup" && !error && !showSettings && (
              <button onClick={() => { setCursor(0); setPreviewing((p) => !p); }} className="glass flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold">
                <Eye className="size-4" /> {previewing ? "Stop practice" : "Practice scroll"}
              </button>
            )}
            {phase === "recording" && (
              <p className="text-sm font-bold text-white/90 drop-shadow">{hitTarget ? `Goal hit! Wrap up whenever (max ${MAX_SECONDS}s)` : model && cursor >= total ? "Done! Tap to finish" : "Tap to finish any time"}</p>
            )}
            <button
              onClick={phase === "recording" ? stop : startCountdown}
              disabled={!!error || phase === "countdown"}
              className="relative grid size-24 place-items-center disabled:opacity-50"
              aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / 0.9)" strokeWidth="6" />
                {phase === "recording" && (
                  <circle cx="50" cy="50" r="44" fill="none" stroke={hitTarget || (model && cursor >= total) ? "#74c08d" : target ? "#f7c04a" : "rgb(255 255 255 / 0.5)"} strokeWidth="6" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
                )}
              </svg>
              <span className={cn("bg-[#ff3b30] transition-all duration-200", phase === "recording" ? "size-9 rounded-xl" : "size-[70px] rounded-full")} />
            </button>
          </div>
        )}

        {/* ---------- Review sheet ---------- */}
        {(phase === "review" || phase === "saving") && clip && (
          <div className="animate-rise absolute inset-x-0 bottom-0 rounded-t-[36px] bg-white px-5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-[26px]">Nice yap!</p>
                <p className="text-stone text-sm font-semibold">{Math.round(clip.seconds)} seconds · {prompt.title}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="bg-sun rounded-full px-3 py-1.5 text-sm font-bold">+{xpForYap(clip.seconds, firstToday)} XP</span>
                {clip.analysis && clip.analysis.parts.length > 0 && <span className="text-stone text-xs font-bold">Yap score {clip.analysis.overall}</span>}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-[auto_auto_1fr] gap-2">
              <YapButton variant="soft" size="icon" className="size-14" onClick={retake} disabled={phase === "saving"} aria-label="Retake">
                <RotateCcw />
              </YapButton>
              <YapButton variant="soft" size="icon" className="size-14" onClick={() => {
                  const f = clip ? new File([clip.blob], `yap101-day-${prompt.day_index}.${extFor(clip.blob.type)}`, { type: clip.blob.type.split(";")[0] }) : null;
                  if (f && prefersNativeShare(f)) shareNatively(f, shareCaption(prompt.day_index, prompt.title), prompt.title);
                  else setSharing(true);
                }} disabled={phase === "saving"} aria-label="Share or save">
                <Share2 />
              </YapButton>
              <YapButton size="lg" className="h-14" arrow onClick={save} disabled={phase === "saving"}>
                {phase === "saving" ? "Saving…" : "Get feedback"}
              </YapButton>
            </div>
          </div>
        )}
      </div>
      {sharing && <ShareSheet getFile={shareFile} day={prompt.day_index} title={prompt.title} media={mode} onClose={() => setSharing(false)} />}
    </div>
  );
}
