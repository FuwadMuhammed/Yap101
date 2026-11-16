"use client";

import { Check, Copy, Download, Link2, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { cn } from "@/lib/utils";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yap101.vercel.app";

/** The post text: the day, the prompt, and a "Made with Yap101" line with our link. */
/** Phones (touch screens) that can share files get the system share menu directly. */
export function prefersNativeShare(file: File | null) {
  if (!file || typeof navigator === "undefined" || !navigator.canShare?.({ files: [file] })) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Opens the phone's own share menu with the clip. Call straight from the tap (no awaits
 * before it), or iOS refuses. The caption goes on the clipboard so it can be pasted in the
 * post; it isn't attached, because Instagram and TikTok hide from the menu when text is.
 */
export function shareNatively(file: File, caption: string, title: string) {
  navigator.clipboard?.writeText(caption).then(
    () => toast("Caption copied. Paste it in your post."),
    () => {},
  );
  navigator.share({ files: [file], title }).catch(() => {
    /* closed the menu */
  });
}

export function shareCaption(day: number, title: string) {
  return `Day ${day} of my 30-day speaking challenge 🎤\n"${title}"\n\nMade with Yap101 → ${SITE}\n#yap101 #publicspeaking #creator`;
}

type App = "instagram" | "tiktok" | "whatsapp" | "x" | "facebook";

// Small flat brand marks, drawn simply (no third-party logo files).
function AppIcon({ app }: { app: App }) {
  const common = "grid size-14 place-items-center rounded-[18px] text-white";
  if (app === "instagram")
    return (
      <span className={common} style={{ background: "linear-gradient(135deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 85%,#4f5bd5)" }}>
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  if (app === "tiktok")
    return (
      <span className={cn(common, "bg-[#111]")}>
        <svg viewBox="0 0 24 24" className="size-7" fill="currentColor">
          <path d="M14.5 3h3c.2 1.7 1.5 3.2 3.5 3.4v3c-1.4 0-2.7-.4-3.6-1v6.3a5.7 5.7 0 1 1-5.7-5.7h.6v3.1a2.6 2.6 0 1 0 2.2 2.6V3Z" />
        </svg>
      </span>
    );
  if (app === "whatsapp")
    return (
      <span className={cn(common, "bg-[#25d366]")}>
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M4.5 19.5l1.1-3.6A8 8 0 1 1 8.4 18.6l-3.9.9Z" />
          <path d="M9.2 8.6c.3-.6.7-.6 1-.6l.5.1.8 1.8-.6.9c.5 1 1.3 1.8 2.3 2.3l.9-.6 1.8.8.1.5c0 .3 0 .7-.6 1-1.6.9-6.6-3.6-6.2-6.2Z" fill="currentColor" stroke="none" />
        </svg>
      </span>
    );
  if (app === "x")
    return (
      <span className={cn(common, "bg-[#111]")}>
        <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
          <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
        </svg>
      </span>
    );
  return (
    <span className={cn(common, "bg-[#1877f2]")}>
      <svg viewBox="0 0 24 24" className="size-7" fill="currentColor">
        <path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21h3.1Z" />
      </svg>
    </span>
  );
}

// videoOnly: Instagram and TikTok often hide themselves from the phone's share menu when text
// is attached to the video, so they get the clip alone (the caption is on the clipboard).
const APPS: { app: App; label: string; web: (caption: string) => string; videoOnly?: boolean }[] = [
  { app: "instagram", label: "Instagram", web: () => "https://www.instagram.com/", videoOnly: true },
  { app: "tiktok", label: "TikTok", web: () => "https://www.tiktok.com/upload", videoOnly: true },
  { app: "whatsapp", label: "WhatsApp", web: (c) => `https://wa.me/?text=${encodeURIComponent(c)}` },
  { app: "x", label: "X", web: (c) => `https://x.com/intent/post?text=${encodeURIComponent(c)}` },
  { app: "facebook", label: "Facebook", web: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE)}` },
];

/**
 * Share a yap. On phones, every app button opens the system share menu with the video
 * attached (that's the only way a website can hand a video to Instagram, TikTok or WhatsApp),
 * with the caption copied so it can be pasted. Where files can't be shared (most desktops),
 * the video downloads, the caption is copied, and the app opens in a new tab to upload it.
 */
export function ShareSheet({
  getFile,
  day,
  title,
  media,
  onClose,
}: {
  getFile: () => Promise<File | null>;
  day: number;
  title: string;
  media: "video" | "audio";
  onClose: () => void;
}) {
  useScrollLock();
  const caption = shareCaption(day, title);
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState<"caption" | "link" | null>(null);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    let alive = true;
    getFile().then((f) => alive && setFile(f));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => {
      alive = false;
      window.removeEventListener("keydown", esc);
    };
  }, [getFile]);

  const canShareFile = Boolean(file && typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] }));

  async function copy(text: string, what: "caption" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
      return true;
    } catch {
      return false;
    }
  }

  function download() {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function nativeShare(withText = true) {
    if (!file) return;
    await copy(caption, "caption");
    try {
      await navigator.share({ files: [file], ...(withText ? { text: caption } : {}), title });
    } catch {
      /* closed the menu */
    }
  }

  // Backup for phones: save the clip to the gallery, then open the app itself to post it.
  async function saveAndOpen(a: (typeof APPS)[number]) {
    download();
    await copy(caption, "caption");
    toast.success(`Clip saved and caption copied. In ${a.label}, tap + and pick the clip from your gallery.`);
    // Instagram and TikTok web links open the installed app on iPhone and Android.
    setTimeout(() => window.open(a.app === "tiktok" ? "https://www.tiktok.com/" : a.web(caption), "_blank", "noopener"), 600);
  }

  async function shareTo(a: (typeof APPS)[number]) {
    if (canShareFile) {
      toast(`Caption copied. Pick ${a.label}${a.app === "instagram" ? " (Reels, Feed or Stories)" : ""} in the menu, then paste the caption.`);
      return nativeShare(!a.videoOnly);
    }
    // No file sharing here (most desktops): save the clip, copy the caption, open the app.
    download();
    await copy(caption, "caption");
    window.open(a.web(caption), "_blank", "noopener");
    toast.success(`Clip saved and caption copied. Upload the clip in ${a.label}.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your yap"
        onClick={(e) => e.stopPropagation()}
        className="animate-rise max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[32px] bg-white px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink sm:rounded-[32px]"
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-[26px]">Share your yap</p>
          <button onClick={onClose} className="bg-mist tap grid size-10 place-items-center rounded-full" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        {canShareFile && (
          <button onClick={() => nativeShare()} className="bg-ink tap mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full font-semibold text-white">
            <Share2 className="size-5" /> Share {media === "video" ? "video" : "clip"}
          </button>
        )}

        <div className="mt-5 grid grid-cols-5 gap-2">
          {APPS.map((a) => (
            <button key={a.app} onClick={() => void shareTo(a)} disabled={!file} className="tap flex flex-col items-center gap-1.5 disabled:opacity-40">
              <AppIcon app={a.app} />
              <span className="text-xs font-semibold">{a.label}</span>
            </button>
          ))}
        </div>
        <p className="text-stone mt-3 text-center text-xs">
          {canShareFile
            ? "Opens your phone's share menu with the clip. Pick the app there; the caption is copied for you."
            : "Your clip downloads and the caption is copied, then the app opens so you can upload it."}
        </p>
        {canShareFile && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
            <span className="text-stone">App not in the menu?</span>
            {APPS.filter((a) => a.videoOnly).map((a) => (
              <button key={a.app} onClick={() => void saveAndOpen(a)} disabled={!file} className="font-semibold underline underline-offset-2 disabled:opacity-40">
                Save &amp; open {a.label}
              </button>
            ))}
          </div>
        )}

        <div className="bg-mist mt-5 rounded-[20px] p-4">
          <div className="flex items-center justify-between">
            <p className="text-stone text-xs font-bold tracking-wide uppercase">Caption</p>
            <button onClick={() => void copy(caption, "caption")} className="flex items-center gap-1 text-sm font-semibold">
              {copied === "caption" ? <Check className="size-4" /> : <Copy className="size-4" />} {copied === "caption" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{caption}</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={download} disabled={!file} className="surface tap flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:opacity-40">
            <Download className="size-4" /> Save clip
          </button>
          <button onClick={() => void copy(`Practising on camera with Yap101 → ${SITE}`, "link")} className="surface tap flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold">
            {copied === "link" ? <Check className="size-4" /> : <Link2 className="size-4" />} {copied === "link" ? "Link copied" : "Copy Yap101 link"}
          </button>
        </div>
        {media === "video" && file?.name.endsWith(".webm") && (
          <p className="text-stone mt-3 text-center text-xs">This browser saved a .webm clip. If an app won&apos;t take it, record on your phone for an .mp4.</p>
        )}
      </div>
    </div>
  );
}
