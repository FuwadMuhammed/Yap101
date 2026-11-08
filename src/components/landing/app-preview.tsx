import { Play } from "lucide-react";
import { Yapper, yapperAt } from "@/components/brand/mascot";
import { Flame } from "@/components/yap/stats";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A drawn phone showing the Today screen. Decorative. */
export function AppPreview({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto w-[300px] sm:w-[330px]", className)} aria-hidden>
      <div className="bg-grid overflow-hidden rounded-[44px] border-[8px] border-ink p-5 pt-10 shadow-[0_40px_80px_-30px_rgb(22_21_20/0.35)]">
        <div className="absolute top-3.5 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-ink" />
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg font-bold">Good morning,</p>
            <p className="text-stone text-xs">Ready for today&apos;s yap?</p>
          </div>
          <span className="surface flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-bold"><Flame className="size-4" />7</span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {DAYS.map((d, i) => {
            const done = i < 3;
            const y = yapperAt(i);
            return (
              <div key={d} className={cn("flex flex-col items-center gap-1 rounded-xl py-1", i === 2 && "bg-mist")}>
                <span className="grid size-8 place-items-center rounded-lg" style={{ background: done ? y.color : "#e7e4de" }}>
                  <Yapper shape="square" color="transparent" mood={done ? "happy" : "sleepy"} className="size-7" />
                </span>
                <span className="text-[9px] font-semibold">{d}</span>
              </div>
            );
          })}
        </div>
        <div className="bg-sky mt-4 rounded-3xl p-4 text-white">
          <p className="text-[10px] font-bold tracking-widest text-white/70 uppercase">Day 3 of 30</p>
          <p className="font-display mt-1 text-lg leading-tight font-bold">A small win from today</p>
          <div className="mt-3 flex items-end justify-between">
            <span className="flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-ink"><Play className="size-3.5 fill-current" />Start</span>
            <Yapper shape="blob" color="#ffffff" mood="talk" className="size-14" />
          </div>
        </div>
        <div className="bg-mint mt-3 rounded-3xl p-4 text-white">
          <p className="font-display font-bold">30-day track</p>
          <div className="mt-2 grid grid-cols-10 gap-1">
            {Array.from({ length: 30 }, (_, i) => (
              <span key={i} className={cn("aspect-square rounded-full", i < 3 ? "bg-white" : "bg-white/25")} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
