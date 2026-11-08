"use client";

import { useMemo } from "react";

const COLORS = ["#ff5a1f", "#ffb224", "#ff4d8d", "#12b76a", "#3d7bff", "#17120e"];

/** A one-shot burst of confetti. Re-mount (change `key`) to fire again. */
export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        color: COLORS[i % COLORS.length],
        x: `${((i * 53) % 40) - 20}vw`,
        r: `${(i * 97) % 720}deg`,
        d: `${(i % 12) * 60}ms`,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{ left: p.left, background: p.color, "--x": p.x, "--r": p.r, "--d": p.d } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
