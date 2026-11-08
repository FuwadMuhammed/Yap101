import { cn } from "@/lib/utils";

export function Skel({ className }: { className?: string }) {
  return <div className={cn("bg-line/70 animate-pulse rounded-[20px]", className)} aria-hidden />;
}

/** Generic page skeleton: title + a few blocks. */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <Skel className="h-9 w-40" />
      <Skel className="h-28" />
      {Array.from({ length: rows }, (_, i) => (
        <Skel key={i} className="h-16" />
      ))}
    </div>
  );
}
