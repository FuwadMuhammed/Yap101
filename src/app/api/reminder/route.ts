import type { NextRequest } from "next/server";
import { dailyReminderIcs } from "@/lib/ics";

// Serves the daily reminder as a calendar link. Opened from Safari, iPhone and Mac show it in
// Calendar with an "Add" button; Outlook and other apps open it too. No personal data: only
// the start time and how many days are in the link.
const STAMP = /^\d{8}T\d{6}$/;

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const start = q.get("start") ?? "";
  const end = q.get("end") ?? "";
  const days = Math.min(30, Math.max(1, Number(q.get("days")) || 30));
  if (!STAMP.test(start) || !STAMP.test(end)) return new Response("Bad reminder link", { status: 400 });
  const ics = dailyReminderIcs({ start, end, days, url: `${request.nextUrl.origin}/home` });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="yap101-daily-reminder.ics"',
      "Cache-Control": "no-store",
    },
  });
}
