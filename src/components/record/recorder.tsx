"use client";

import { Camera, ChevronLeft, Eye, Lightbulb, Lock, Mic, RefreshCw, RotateCcw, Share2, SlidersHorizontal, Star, SwitchCamera, Target, Timer, Video, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mascot, MascotSays, Yapper } from "@/components/brand/mascot";
import { Slider } from "@/components/ui/slider";
import { YapButton } from "@/components/yap/yap-button";
import { api, DailyLimitError } from "@/lib/data";
import { xpForYap } from "@/lib/game";
import { cn } from "@/lib/utils";
import { TARGET_SECONDS, visiblePoints, weekFor } from "@/lib/curriculum";
import { localDate, MAX_SECONDS, type Level, type Prompt } from "@/lib/yap";

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

export function Recorder({ prompt, firstToday, level, first }: { prompt: Prompt; firstToday: boolean; level: Level | null; first?: boolean }) {
  const target = TARGET_SECONDS[level ?? "beginner"];
  const points = visiblePoints(prompt.talking_points, level);
  const router = useRouter();
  const previewRef = useRef<HTMLVideoElement>(null);
  const prompterRef = useRef<HTMLDivElement>(null);
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
  const [speed, setSpeed] = useState(28); // teleprompter px per second
  const [textSize, setTextSize] = useState<TextSize>("M");
  const [showSettings, setShowSettings] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [clip, setClip] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);

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

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      buzz([20, 40, 20]);
    }
  }, []);

  // Teleprompter scroll (recording or preview) + timer + auto-stop at 60 s.
  useEffect(() => {
    if (phase !== "recording" && !previewing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (prompterRef.current) prompterRef.current.scrollTop += (speed * (now - last)) / 1000;
      last = now;
      if (phase === "recording") {
        const secs = (now - startedAtRef.current) / 1000;
        setElapsed(secs);
        if (secs >= MAX_SECONDS) return stop();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, previewing, speed, stop]);

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
    if (prompterRef.current) prompterRef.current.scrollTop = 0;
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
      setClip({ blob, url: URL.createObjectURL(blob), seconds });
      setPhase("review");
    };
    recorderRef.current = recorder;
    startedAtRef.current = performance.now();
    setElapsed(0);
    recorder.start(1000);
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
      if (prompterRef.current) prompterRef.current.scrollTop = 0;
    });
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
      const { id } = await api.saveYap({ prompt, media: mode, blob: clip.blob, seconds: clip.seconds, localDate: localDate() });
      router.push(`/feedback/${id}?celebrate=1`);
    } catch (e) {
      toast.error(e instanceof DailyLimitError ? e.message : (e as Error).message || "Couldn't save your yap.");
      setPhase("review");
    }
  }

  const live = phase === "setup" || phase === "countdown" || phase === "recording";
  const progress = Math.min(1, elapsed / target);
  const hitTarget = elapsed >= target;
  const RING = 2 * Math.PI * 44;

  if (phase === "prep") {
    const week = weekFor(prompt.day_index);
    return (
      <div className="bg-grid flex min-h-dvh justify-center">
        <div className="flex w-full max-w-lg flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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

          <section className="surface mt-3 rounded-[28px] p-5">
            <p className="text-stone text-sm font-semibold">{level === "pro" ? "Your opener (improvise the rest)" : "Talking points"}</p>
            <ol className="mt-2 space-y-2">
              {points.map((t, i) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="bg-mist grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">{i + 1}</span>
                  <span className="font-medium">{t}</span>
                </li>
              ))}
            </ol>
            <p className="text-stone mt-3 flex items-center gap-1.5 text-sm"><Target className="size-4" /> {prompt.focus}</p>
          </section>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm font-semibold">
            <span className="surface flex flex-col items-center gap-1 rounded-[20px] py-3"><Timer className="size-4" />{target} sec</span>
            <span className="surface flex flex-col items-center gap-1 rounded-[20px] py-3"><Star className="size-4" />+{xpForYap(target, firstToday)} XP</span>
            <button
              onClick={() => setMode(mode === "video" ? "audio" : "video")}
              className="surface tap flex flex-col items-center gap-1 rounded-[20px] py-3"
              aria-label={`Recording ${mode}. Tap to switch.`}
            >
              {mode === "video" ? <Video className="size-4" /> : <Mic className="size-4" />}
              {mode === "video" ? "Video" : "Audio only"}
            </button>
          </div>

          <div className="mt-auto pt-6">
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
            {phase === "review" || phase === "saving" ? fmt(clip?.seconds ?? 0) : `${fmt(elapsed)} / ${fmt(target)}`}
          </span>
        </div>

        {/* ---------- Teleprompter ---------- */}
        {live && (
          <div className="glass-dark absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] rounded-3xl">
            <div ref={prompterRef} className="prompter-mask h-44 overflow-hidden px-5 pt-4 sm:h-52">
              <p className="mb-3 text-sm font-semibold text-white/60">Day {prompt.day_index} · {prompt.title}</p>
              <ul className={cn("font-display space-y-5 pb-48 leading-tight font-bold", TEXT_SIZES[textSize])}>
                {points.map((t) => (
                  <li key={t}>{t}</li>
                ))}
                {level === "pro" && <li className="text-white/50">Improvise the rest</li>}
                <li className="text-white/50">{prompt.skill}: {prompt.focus}</li>
              </ul>
            </div>
          </div>
        )}

        {/* ---------- Pill controls ---------- */}
        {phase === "setup" && (
          <div className="absolute inset-x-4 top-[calc(max(1rem,env(safe-area-inset-top))+16.5rem)] sm:top-[calc(max(1rem,env(safe-area-inset-top))+18.5rem)]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode(mode === "video" ? "audio" : "video")}
                className="glass flex h-11 flex-1 items-center gap-2 rounded-full px-4 text-sm font-bold"
              >
                {mode === "video" ? <Video className="size-4" /> : <Mic className="size-4" />}
                {mode === "video" ? `${target}-second video` : `${target}-second audio`}
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
              <div className="glass-dark animate-rise mt-2 flex flex-col gap-4 rounded-3xl p-4">
                <label className="flex flex-col gap-3 text-sm font-bold">
                  Scroll speed
                  <Slider min={0} max={80} value={[speed]} onValueChange={(v) => setSpeed(Array.isArray(v) ? v[0] : v)} />
                </label>
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
            {phase === "setup" && !error && (
              <button onClick={() => setPreviewing((p) => !p)} className="glass flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold">
                <Eye className="size-4" /> {previewing ? "Stop preview" : "Preview points"}
              </button>
            )}
            {phase === "recording" && (
              <p className="text-sm font-bold text-white/90 drop-shadow">{hitTarget ? `Target hit! Wrap up (max ${MAX_SECONDS}s)` : "Tap to finish"}</p>
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
                  <circle cx="50" cy="50" r="44" fill="none" stroke={hitTarget ? "#1fa463" : "#ffd23f"} strokeWidth="6" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
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
              <span className="bg-sun rounded-full px-3 py-1.5 text-sm font-bold">+{xpForYap(clip.seconds, firstToday)} XP</span>
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
