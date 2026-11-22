"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** A 0-10 self-rating (radio group), e.g. "How nervous are you?". Tapping the chosen value clears it. */
export function Scale({ label, value, onChange, low = "Calm", high = "Terrified", className }: { label: string; value: number | null; onChange: (v: number | null) => void; low?: string; high?: string; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <p id={id} className="text-sm font-semibold">{label}</p>
      <div role="radiogroup" aria-labelledby={id} className="mt-2 grid grid-cols-11 gap-0.5">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 10`}
            onClick={() => onChange(value === n ? null : n)}
            className={cn("tap h-9 min-w-0 rounded-full text-sm font-bold tabular-nums transition-colors", value === n ? "bg-ink text-white" : "bg-mist text-ink hover:bg-[#e2e6eb]")}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="text-stone mt-1 flex justify-between text-xs">
        <span>0 · {low}</span>
        <span>{high} · 10</span>
      </div>
    </div>
  );
}
