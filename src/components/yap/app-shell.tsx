"use client";

import { Clapperboard, House, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Yapper } from "@/components/brand/mascot";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Today", icon: House },
  { href: "/history", label: "Yaps", icon: Clapperboard },
  { href: "/profile", label: "Me", icon: UserRound },
] as const;

/** App frame: content column + a floating pill nav at the bottom (all screen sizes). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-32 sm:px-6 sm:pt-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-label="Main">
        <div className="surface flex items-center gap-1 rounded-full p-1.5 shadow-[0_12px_40px_-12px_rgb(22_21_20/0.25)]">
          <Link href="/home" className="hidden px-2 sm:block" aria-label="Yap101 home">
            <Yapper shape="bubble" className="size-8" />
          </Link>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href) || (href === "/home" && pathname.startsWith("/track"));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap flex h-12 items-center gap-2 rounded-full font-semibold transition-all",
                  active ? "bg-yap px-5 text-white" : "text-ink w-12 justify-center hover:bg-mist",
                )}
              >
                <Icon className="size-5" strokeWidth={2.2} />
                {active && <span>{label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Page header: title on the left, optional chips on the right. */
export function TopBar({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[24px] leading-tight font-extrabold sm:text-4xl">{title}</h1>
        {sub && <p className="text-stone mt-0.5">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </header>
  );
}
