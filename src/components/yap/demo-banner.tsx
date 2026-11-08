import { isDemo } from "@/lib/data/mode";

export function DemoBanner() {
  if (!isDemo) return null;
  return <div className="bg-ink py-1 text-center text-[11px] font-medium tracking-wide text-white/75">Demo mode · data stays in this browser</div>;
}
