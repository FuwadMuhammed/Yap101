"use client";

import { useEffect, useState } from "react";
import { envDemo, isDemo } from "@/lib/data/mode";

// A demo build is known at build time, so the server renders the banner and nothing moves.
// Guest mode depends on a cookie, so that banner still appears after mount (hydration-safe).
// Full-height screens subtract the banner via --banner-h, set in globals.css with :has().
export function DemoBanner() {
  const [show, setShow] = useState(envDemo);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(isDemo);
  }, []);
  if (!show) return null;
  return <div data-demo-banner className="bg-ink h-6 truncate px-3 py-1 text-center text-[11px] leading-4 font-medium tracking-wide text-white/75">{envDemo ? "Demo mode · data stays in this browser" : "Guest mode · your yaps are saved in this browser only"}</div>;
}
