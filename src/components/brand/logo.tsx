import Link from "next/link";
import { cn } from "@/lib/utils";
import { Yapper } from "./mascot";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("font-display flex items-center gap-1.5 text-[22px] font-extrabold tracking-tight", className)}>
      <Yapper shape="bubble" className="size-8" />
      yap101
    </Link>
  );
}
