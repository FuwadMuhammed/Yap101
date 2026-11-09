"use client";

import { useEffect, useState } from "react";
import { isDemo } from "@/lib/data/mode";

// Client-only so it can see the guest cookie; shown after mount to avoid a hydration mismatch.
export function DemoBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(isDemo);
  }, []);
  if (!show) return null;
  return <div className="bg-ink py-1 text-center text-[11px] font-medium tracking-wide text-white/75">Demo mode · data stays in this browser</div>;
}
