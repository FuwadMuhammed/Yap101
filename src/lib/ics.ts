// A daily reminder as a calendar file (.ics). No backend or push needed: the user's
// calendar app does the reminding. Repeats for the length of the 30-day track.

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

export function dailyReminderIcs({ at, days, url }: { at: [number, number]; days: number; url: string }) {
  const start = new Date();
  start.setDate(start.getDate() + 1); // from tomorrow
  start.setHours(at[0], at[1], 0, 0);
  const end = new Date(start.getTime() + 5 * 60_000);
  const now = new Date();
  // Floating local times (no TZID): the event fires at the same clock time wherever the user is.
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yap101//Daily yap//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:yap101-daily-${now.getTime()}@yap101`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `RRULE:FREQ=DAILY;COUNT=${Math.max(1, days)}`,
    "SUMMARY:Time to yap 🎤",
    `DESCRIPTION:Your 60-second yap is ready. Keep your streak going: ${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Time to yap",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(ics: string, filename = "yap101-daily-reminder.ics") {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
