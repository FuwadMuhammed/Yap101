"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Section links for phones, where the header has no room for them. */
export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="tap hover:bg-mist grid size-10 place-items-center rounded-full"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <ul id="mobile-menu" className="surface absolute top-12 right-0 w-52 overflow-hidden rounded-[24px] p-1.5 shadow-[0_12px_40px_-12px_rgb(22_21_20/0.25)]">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setOpen(false)} className="hover:bg-mist flex h-11 items-center rounded-full px-4 font-semibold">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
