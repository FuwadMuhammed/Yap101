import Link from "next/link";
import { cn } from "@/lib/utils";
import { Yapper, YAPPY_BLUE } from "./mascot";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-1.5 font-sans text-[21px] font-bold tracking-tight", className)}>
      <Yapper shape="puff" color={YAPPY_BLUE} mood="calm" className="size-9" />
      yap101
    </Link>
  );
}
