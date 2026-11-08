"use client";

import { Mic, Trash2, Video } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { MascotSays, YapperAvatar } from "@/components/brand/mascot";
import { TopBar } from "@/components/yap/app-shell";
import { PageSkeleton } from "@/components/yap/skeleton";
import { YapLink } from "@/components/yap/yap-button";
import { api } from "@/lib/data";
import { FULL_YAP_SECONDS } from "@/lib/game";
import { useGame } from "@/lib/use-game";

const niceDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" });

export default function MyYaps() {
  const { yaps, refresh, loading } = useGame();

  async function remove(id: string) {
    if (!confirm("Delete this yap? This can't be undone.")) return;
    try {
      await api.deleteYap(id);
      await refresh();
      toast.success("Yap deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <PageSkeleton rows={5} />;

  return (
    <div className="mx-auto max-w-2xl">
      <TopBar title="My yaps" sub={`${yaps.length} recording${yaps.length === 1 ? "" : "s"} · private to you`} />

      {yaps.length === 0 ? (
        <div className="surface flex flex-col items-center gap-6 rounded-[32px] px-6 py-12 text-center">
          <MascotSays mood="sleepy">It&apos;s quiet in here. Your first yap will show up here.</MascotSays>
          <YapLink href="/home" size="lg" arrow>Do today&apos;s yap</YapLink>
        </div>
      ) : (
        <ul className="surface divide-line divide-y overflow-hidden rounded-[28px]">
          {yaps.map((y, i) => (
            <li key={y.id} className="animate-rise flex items-center gap-3 px-3 py-3 sm:px-4" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              <Link href={`/feedback/${y.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <YapperAvatar index={i} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{y.title}</span>
                  <span className="text-stone flex items-center gap-1.5 text-sm">
                    {y.media === "video" ? <Video className="size-3.5" /> : <Mic className="size-3.5" />}
                    {niceDate(y.local_date)} · {Math.round(y.duration_seconds)}s
                  </span>
                </span>
                {y.duration_seconds >= FULL_YAP_SECONDS && <span className="bg-sun-soft hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline">Full minute</span>}
              </Link>
              <button onClick={() => remove(y.id)} className="tap text-stone hover:text-cherry hover:bg-mist grid size-10 shrink-0 place-items-center rounded-full" aria-label={`Delete ${y.title}`}>
                <Trash2 className="size-[18px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
