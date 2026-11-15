"use client";

import { useEffect } from "react";

/**
 * Stops the page behind a full-screen layer (camera, celebration, editor) from scrolling.
 * Locks both <html> and <body>: iOS Safari ignores a lock on <body> alone.
 */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => el.style.overflow);
    els.forEach((el) => (el.style.overflow = "hidden"));
    return () => els.forEach((el, i) => (el.style.overflow = prev[i]));
  }, [active]);
}
