"use client";

import { AudioLines, Camera, ChevronLeft, Minus, MessageCircle, Plus, ScrollText, Eye, Lightbulb, Lock, Mic, RefreshCw, RotateCcw, Share2, SlidersHorizontal, Star, SwitchCamera, Target, Timer, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Mascot, MascotSays, Yapper } from "@/components/brand/mascot";
import { Slider } from "@/components/ui/slider";
import { YapButton } from "@/components/yap/yap-button";
import { api, DailyLimitError } from "@/lib/data";
import { xpForYap } from "@/lib/game";
import { cn } from "@/lib/utils";
import { TARGET_SECONDS, visiblePoints, weekFor } from "@/lib/curriculum";
import { localDate, MAX_SECONDS, type Level, type Prompt } from "@/lib/yap";
import { buildScript, estimateSeconds, followPosition, speechRecognitionCtor, wordDuration } from "@/lib/prompter";
import { ScriptPreview, Teleprompter } from "./teleprompter";
import { AudioMeter } from "@/lib/analysis/audio";
import { FaceMeter, loadFaceModel } from "@/lib/analysis/face";
import { analyse, type Analysis } from "@/lib/analysis/score";

type Mode = "video" | "audio";
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

export function Recorder({ prompt, firstToday, level, first, script }: { prompt: Prompt; firstToday: boolean; level: Level | null; first?: boolean; script?: string[] | null }) {
  // Intro yaps can be read from a ready-made script; beginners get it by default.
  const [useScript, setUseScript] = useState(Boolean(script) && level !== "pro" && level !== "intermediate");
  const reading = Boolean(script && useScript);
  const points = reading ? script! : visiblePoints(prompt.talking_points, level);
  const model = useMemo(() => (reading && script ? buildScript(script) : null), [reading, script]);
  // Length is a goal, not a rule: "free" means stop whenever you like (60 s is the cap).
  const [length, setLength] = useState<"free" | number>(() => (script && level !== "pro" && level !== "intermediate" ? "free" : TARGET_SECONDS[level ?? "beginner"]));
  const target = length === "free" ? null : length;
  const [wpm, setWpm] = useState(150);
  const [pace, setPace] = useState<"auto" | "voice">("auto");
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
  const [showSettings, setShowSettings] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [clip, setClip] = useState<{ blob: Blob; url: string; seconds: number; analysis: Analysis | null } | null>(null);
  // On-device analysis: voice meter always, face meter for video. Nothing is uploaded.
  const audioMeterRef = useRef<AudioMeter | null>(null);
  const faceMeterRef = useRef<FaceMeter | null>(null);
  const cursorRef = useRef(0);
  const usedVoiceRef = useRef(false);

  // Open the camera (or just the mic) once allowed, and again when mode or facing changes.
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    (async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === "video" ? { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } } : false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
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
  }, [cursor]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioMeterRef.current?.stop();
      faceMeterRef.current?.stop();
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceOk(Boolean(speechRecognitionCtor()));
  }, []);

  const total = model ? model.words.length : points.length;
  const rolling = phase === "recording" || previewing;
  const following = phase === "recording" && pace === "voice" && Boolean(model);

  // Auto pace: move the highlight word by word at the chosen speed (points: one per few seconds).
  useEffect(() => {
    if (!rolling || following || cursor >= total) return;
    const secs = model ? wordDuration(model.words[cursor], wpm) : Math.max(4, (target ?? 45) / Math.max(1, points.length)) * (150 / wpm);
    const t = setTimeout(() => setCursor((c) => c + 1), secs * 1000);
    return () => clearTimeout(t);
  }, [rolling, following, cursor, total, model, wpm, target, points.length]);

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
    setCount(3);
    setPhase("countdown");
  }

  function beginRecording() {
    const stream = streamRef.current;
    if (!stream) return setPhase("setup");
    const mimeType = pickMimeType(mode);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
      const seconds = Math.min(MAX_SECONDS, (performance.now() - startedAtRef.current) / 1000);
      let analysis: Analysis | null = null;
      try {
        analysis = analyse({
          audio: audioMeterRef.current?.stop() ?? null,
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
    startedAtRef.current = performance.now();
    setElapsed(0);
    recorder.start(1000);
    usedVoiceRef.current = pace === "voice" && Boolean(model) && voiceOk;
    audioMeterRef.current = new AudioMeter();
    audioMeterRef.current.start(stream);
    if (mode === "video") {
      faceMeterRef.current = new FaceMeter();
      void faceMeterRef.current.start(previewRef.current);
    }
    buzz(30);
    setPhase("recording");
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

  // Share sheet: Instagram, TikTok, "Save Video" to Photos on iOS. Falls back to a download.
  async function share() {
    if (!clip) return;
    const file = new File([clip.blob], `yap-day-${prompt.day_index}.${extFor(clip.blob.type)}`, { type: clip.blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: prompt.title });
      } catch {
        /* closed the sheet */
      }
      return;
    }
    const a = document.createElement("a");
    a.href = clip.url;
    a.download = file.name;
    a.click();
    toast.success("Saved to your downloads");
  }

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
  const lengthLabel = target ? `${target}s goal` : estimate ? `about ${estimate}s` : "no time limit";
  const cycleLength = () => setLength((l) => (l === "free" ? 30 : l === 30 ? 45 : l === 45 ? 60 : "free"));
  const RING = 2 * Math.PI * 44;

  if (phase === "prep") {
    const week = weekFor(prompt.day_index);
    return (
      <div className="bg-grid flex min-h-dvh justify-center">
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

          <h1 className="mt-6 text-[32px] leading-[1.08] font-extrabold">{prompt.title}</h1>
          {prompt.milestone && <p className="bg-sun mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold"><Star className="size-4 fill-current" /> Milestone yap: worth posting</p>}

          <section className="bg-grape mt-5 rounded-[28px] p-5">
            <p className="flex items-center gap-2 text-sm font-semibold"><Lightbulb className="size-4" /> Today&apos;s skill</p>
            <p className="font-display mt-1 text-2xl font-bold">{prompt.skill}</p>
            <p className="mt-1 leading-relaxed">{prompt.skill_tip}</p>
          </section>

          {script && (
            <div role="radiogroup" aria-label="How do you want to do it?" className="bg-mist mt-3 grid grid-cols-2 gap-1 rounded-full p-1">
              {([[false, "My own words", MessageCircle], [true, "Read a script", ScrollText]] as const).map(([v, label, Icon]) => (
                <button
                  key={label}
                  role="radio"
                  aria-checked={useScript === v}
                  onClick={() => setUseScript(v)}
                  className={cn("tap flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors", useScript === v ? "bg-white shadow-sm" : "text-stone hover:text-ink")}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          )}

          <section className="surface mt-3 rounded-[28px] p-5">
            {reading ? (
              <>
                <p className="text-stone text-sm font-semibold">Your script · made from your answers</p>
                {model && <ScriptPreview script={model} />}
                <p className="text-stone mt-3 text-sm">Change any words you like as you go. The teleprompter highlights each word as you say it.</p>
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

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm font-semibold">
            <button onClick={cycleLength} className="surface tap flex flex-col items-center gap-1 rounded-[20px] py-3" aria-label={`Length: ${target ? `${target} second goal` : "no time limit"}. Tap to change.`}>
              <Timer className="size-4" />{target ? `${target}s goal` : "No limit"}
            </button>
            <span className="surface flex flex-col items-center gap-1 rounded-[20px] py-3"><Star className="size-4" />+{xpForYap(target ?? estimate ?? 0, firstToday)} XP</span>
            <button
              onClick={() => setMode(mode === "video" ? "audio" : "video")}
              className="surface tap flex flex-col items-center gap-1 rounded-[20px] py-3"
              aria-label={`Recording ${mode}. Tap to switch.`}
            >
              {mode === "video" ? <Video className="size-4" /> : <Mic className="size-4" />}
              {mode === "video" ? "Video" : "Audio only"}
            </button>
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
      </div>
    );
  }

  return (
    <div className="bg-ink flex min-h-dvh items-center justify-center">
      <div className="relative h-dvh w-full overflow-hidden bg-black text-white md:aspect-[9/16] md:h-[min(94dvh,880px)] md:w-auto md:rounded-[36px] md:border-[6px] md:border-white/10">
        {/* ---------- Stage ---------- */}
        {live &&
          (mode === "video" ? (
            <video
              ref={previewRef}
              autoPlay
              muted
              playsInline
              className={cn("absolute inset-0 h-full w-full object-cover", facing === "user" && "-scale-x-100")}
            />
          ) : (
            <div className="bg-sky absolute inset-0 flex items-end justify-center">
              <Yapper shape="blob" color="#ffffff" mood={phase === "recording" ? "talk" : "happy"} className={cn("mb-44 size-48", phase === "recording" && "animate-wiggle")} />
            </div>
          ))}
        {clip && !live &&
          (mode === "video" ? (
            <video src={clip.url} controls playsInline autoPlay className="absolute inset-0 h-full w-full bg-black object-cover" />
          ) : (
            <div className="bg-sky absolute inset-0 flex flex-col items-center justify-center gap-6 px-8 pb-48">
              <Yapper shape="blob" color="#ffffff" mood="cheer" className="size-40" />
              <audio src={clip.url} controls className="w-full" />
            </div>
          ))}

        {/* Soft top scrim so glass reads on bright scenes */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/45 to-transparent" />

        {/* ---------- Top: close + timer ---------- */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <Link href="/home" className="glass grid size-10 place-items-center rounded-full" aria-label="Close">
            <X className="size-5" />
          </Link>
          <span
            className={cn(
              "glass flex h-10 items-center gap-2 rounded-full px-4 font-mono text-sm font-bold tabular-nums",
              phase === "recording" && (hitTarget ? "bg-mint/90" : "bg-[#ff3b30]/80"),
            )}
          >
            {phase === "recording" && <span className="size-2 animate-pulse rounded-full bg-white" />}
            {phase === "review" || phase === "saving" ? fmt(clip?.seconds ?? 0) : target ? `${fmt(elapsed)} / ${fmt(target)}` : fmt(elapsed)}
          </span>
        </div>

        {/* ---------- Teleprompter ---------- */}
        {live && (
          <div className="glass-dark absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] rounded-3xl px-5 pt-4">
            <Teleprompter
              title={`Day ${prompt.day_index} · ${prompt.title}`}
              script={model}
              points={points}
              index={cursor}
              onJump={setCursor}
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
                {following ? (
                  <span className="flex items-center gap-1.5 text-white/80">
                    <AudioLines className={cn("size-4", listening && "animate-pulse")} /> {listening ? "Following your voice" : "Starting…"}
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
          <div className="absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+19rem)] sm:top-[calc(max(1rem,env(safe-area-inset-top))+21rem)]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode(mode === "video" ? "audio" : "video")}
                className="glass flex h-11 flex-1 items-center gap-2 rounded-full px-4 text-sm font-bold"
              >
                {mode === "video" ? <Video className="size-4" /> : <Mic className="size-4" />}
                {mode === "video" ? "Video" : "Audio"} · {lengthLabel}
                <RefreshCw className="ml-auto size-4 opacity-70" />
              </button>
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
                    <div className="grid grid-cols-2 gap-1 rounded-full bg-white/10 p-1">
                      {([["auto", "Auto scroll"], ["voice", "Follow my voice"]] as const).map(([v, label]) => (
                        <button
                          key={v}
                          onClick={() => setPace(v)}
                          disabled={v === "voice" && !voiceOk}
                          className={cn("h-9 rounded-full text-[13px] disabled:opacity-40", pace === v ? "bg-white text-ink" : "text-white/80")}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs font-medium text-white/60">
                      {!voiceOk
                        ? "Follow my voice needs Chrome, Edge or Safari."
                        : pace === "voice"
                          ? "Moves to the next word as you say it. Uses your browser's speech recognition, which may send audio to Google or Apple."
                          : "Highlights word by word at your speed."}
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
            {mode === "video" && (
              <YapButton size="sm" variant="soft" className="mt-4" onClick={() => setMode("audio")}>
                <Mic /> Switch to audio only
              </YapButton>
            )}
          </div>
        )}

        {/* ---------- Countdown ---------- */}
        {phase === "countdown" && (
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <span key={count} className="font-display animate-pop text-[140px] leading-none font-extrabold drop-shadow-lg">{count}</span>
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
                  <circle cx="50" cy="50" r="44" fill="none" stroke={hitTarget || (model && cursor >= total) ? "#1fa463" : target ? "#ffd23f" : "rgb(255 255 255 / 0.5)"} strokeWidth="6" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
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
                <p className="font-display text-2xl font-bold">Nice yap!</p>
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
              <YapButton variant="soft" size="icon" className="size-14" onClick={share} disabled={phase === "saving"} aria-label="Share or save">
                <Share2 />
              </YapButton>
              <YapButton size="lg" className="h-14" arrow onClick={save} disabled={phase === "saving"}>
                {phase === "saving" ? "Saving…" : "Get feedback"}
              </YapButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
