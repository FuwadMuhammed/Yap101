"use client";

import { BellRing, CalendarPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { YapButton } from "@/components/yap/yap-button";
import { googleCalendarUrl, icsLink } from "@/lib/ics";
import { YAP_TIMES, labelFor } from "@/lib/options";
import { cn } from "@/lib/utils";

/** Adds a repeating daily reminder at the user's yap time to Google, Apple or Outlook calendar. */
export function ReminderButton({ yapTime, daysLeft = 30, className, variant = "soft", compact }: { yapTime: string | null; daysLeft?: number; className?: string; variant?: "soft" | "primary"; compact?: boolean }) {
  const t = labelFor(YAP_TIMES, yapTime) ?? YAP_TIMES[0];
  const days = Math.max(1, daysLeft);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const when = `${t.label.toLowerCase()} (${t.at[0]}:${String(t.at[1]).padStart(2, "0")})`;
  const options = [
    {
      label: "Google Calendar",
      hint: "Opens pre-filled. Tap Save.",
      go: () => window.open(googleCalendarUrl({ at: t.at, days, url: `${window.location.origin}/home` }), "_blank", "noopener"),
    },
    {
      label: "Apple Calendar",
      hint: "iPhone and Mac open it in Calendar.",
      go: () => window.location.assign(icsLink({ at: t.at, days })),
    },
    {
      label: "Outlook or other",
      hint: "Opens in your calendar app.",
      go: () => window.location.assign(icsLink({ at: t.at, days })),
    },
  ];

  return (
    <div className={cn(className)}>
      {compact ? (
        <YapButton variant="mist" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">Set up</YapButton>
      ) : (
        <YapButton variant={variant} size="lg" className="w-full" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <BellRing /> Remind me daily
        </YapButton>
      )}
      {open &&
        // Portal to <body>: a sheet inside an animated card would sit under the bottom nav.
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Add a daily reminder"
              onClick={(e) => e.stopPropagation()}
              className="animate-rise w-full max-w-sm rounded-t-[32px] bg-white px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink sm:rounded-[32px]"
            >
              <div className="flex items-start justify-between gap-3 px-1">
                <div>
                  <p className="font-display text-[24px]">Daily reminder</p>
                  <p className="text-stone text-sm">Every day at {when}, for {days} day{days === 1 ? "" : "s"}</p>
                </div>
                <button onClick={() => setOpen(false)} className="bg-mist tap grid size-10 shrink-0 place-items-center rounded-full" aria-label="Close">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-1">
                {options.map((o) => (
                  <button
                    key={o.label}
                    onClick={() => {
                      setOpen(false);
                      o.go();
                      toast.success(`Adding a daily ${t.label.toLowerCase()} reminder to ${o.label.replace(" or other", "")}`);
                    }}
                    className="hover:bg-mist tap flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left"
                  >
                    <span className="bg-sky-soft grid size-10 shrink-0 place-items-center rounded-full"><CalendarPlus className="size-5" /></span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{o.label}</span>
                      <span className="text-stone block text-sm">{o.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
