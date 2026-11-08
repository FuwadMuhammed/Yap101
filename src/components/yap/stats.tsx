import { cn } from "@/lib/utils";

/** Pill chip for streak / XP / badges in the top bar. */
export function Chip({ children, className, label, tone = "white" }: { children: React.ReactNode; className?: string; label?: string; tone?: "white" | "sun" }) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-bold",
        tone === "sun" ? "bg-sun border-ink border-2" : "surface",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Bar({ value, className, color = "bg-yap", track = "bg-mist" }: { value: number; className?: string; color?: string; track?: string }) {
  return (
    <div className={cn("h-2.5 overflow-hidden rounded-full", track, className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${Math.max(3, value * 100)}%` }} />
    </div>
  );
}

/** Small ring that fills up, e.g. "2 of 3 yaps today". */
export function Ring({ value, label, className, color = "#ff6b2c" }: { value: number; label: React.ReactNode; className?: string; color?: string }) {
  const c = 2 * Math.PI * 16;
  return (
    <span className={cn("relative grid size-9 place-items-center", className)}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90">
        <circle cx="20" cy="20" r="16" fill="none" stroke="#e7e4de" strokeWidth="5" />
        <circle cx="20" cy="20" r="16" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="text-xs font-bold">{label}</span>
    </span>
  );
}

/** Flame icon (flat, two-tone). */
export function Flame({ className, lit = true }: { className?: string; lit?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      <path d="M12 2c1 3.5 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.2 2.5-5.4.2 1.6.9 2.6 1.9 3.1C10.6 7.8 11 4.7 12 2Z" fill={lit ? "#ff6b2c" : "#d6d2cb"} />
      <path d="M12 12.5c.7 1.4 2.5 2.3 2.5 4.4a2.5 2.5 0 0 1-5 0c0-1.3.7-2.2 1.4-2.8.1.6.4 1 .8 1.2-.1-1.1 0-2 .3-2.8Z" fill={lit ? "#ffd23f" : "#ebe8e3"} />
    </svg>
  );
}
