"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { api, type Profile, type YapSummary } from "@/lib/data";
import { computeGame, trackStatuses, type DayStatus, type GameState } from "@/lib/game";
import { localDate, trackDay } from "@/lib/yap";

type GameCtx = {
  loading: boolean;
  profile: Profile | null;
  yaps: YapSummary[];
  game: GameState;
  /** The user's local date, read on the client after load. */
  today: string;
  day: number;
  track: DayStatus[];
  refresh: () => Promise<void>;
};

const Ctx = createContext<GameCtx | null>(null);

/** Loads the signed-in user's profile and yaps once for the whole app shell. */
export function GameProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [yaps, setYaps] = useState<YapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Read on the client after load: prerendering must not depend on the current date.
  const [today, setToday] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [p, list] = await Promise.all([api.getProfile(), api.listYaps()]);
    if (!p) return router.replace("/login");
    if (!p.onboarded_at || !p.track_start_date) return router.replace("/onboarding");
    setProfile(p);
    setYaps(list);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    let active = true;
    Promise.all([api.getProfile(), api.listYaps()]).then(([p, list]) => {
      if (!active) return;
      if (!p) return router.replace("/login");
      if (!p.onboarded_at || !p.track_start_date) return router.replace("/onboarding");
      setToday(localDate());
      setProfile(p);
      setYaps(list);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  const value = useMemo<GameCtx>(() => {
    const t = today ?? "1970-01-01";
    const start = profile?.track_start_date ?? t;
    const game = computeGame(yaps, t);
    return {
      loading,
      profile,
      yaps,
      game,
      today: t,
      day: trackDay(start, t),
      track: trackStatuses(start, yaps, t, game.frozenDays),
      refresh,
    };
  }, [loading, profile, yaps, refresh, today]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useGame() {
  const v = use(Ctx);
  if (!v) throw new Error("useGame must be used inside GameProvider");
  return v;
}
