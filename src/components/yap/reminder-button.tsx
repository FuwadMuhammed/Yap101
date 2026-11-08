"use client";

import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { YapButton } from "@/components/yap/yap-button";
import { dailyReminderIcs, downloadIcs } from "@/lib/ics";
import { YAP_TIMES, labelFor } from "@/lib/options";
import { cn } from "@/lib/utils";

/** Downloads a repeating calendar event at the user's chosen yap time. */
export function ReminderButton({ yapTime, daysLeft = 30, className, variant = "soft" }: { yapTime: string | null; daysLeft?: number; className?: string; variant?: "soft" | "primary" }) {
  const t = labelFor(YAP_TIMES, yapTime) ?? YAP_TIMES[0];
  return (
    <YapButton
      variant={variant}
      size="lg"
      className={cn(className)}
      onClick={() => {
        downloadIcs(dailyReminderIcs({ at: t.at, days: daysLeft, url: `${window.location.origin}/home` }));
        toast.success(`Open the file to add a daily ${t.label.toLowerCase()} reminder to your calendar`);
      }}
    >
      <BellRing /> Remind me daily
    </YapButton>
  );
}
