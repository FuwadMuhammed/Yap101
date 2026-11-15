// Daily yap reminders in the user's own calendar. No backend push needed: the calendar app
// does the reminding. Repeats for the rest of the 30-day track, from tomorrow.
//  - Google Calendar: a pre-filled "add event" link (repeat included), nothing to download.
//  - Apple Calendar / Outlook: a calendar link served by /api/reminder; iPhone and Mac open
//    it straight in Calendar with an "Add" button.

const pad = (n: number) => String(n).padStart(2, "0");
/** Floating local time, e.g. 20261116T190000 (no time zone: same clock time wherever you are). */
export const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

export const REMINDER_TITLE = "Time to yap 🎤";
export const reminderDetails = (url: string) => `Your 60-second yap is ready. Keep your streak going: ${url}`;

/** Tomorrow at the user's yap time, as start and end stamps (a 5-minute event). */
export function reminderTimes(at: [number, number]) {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(at[0], at[1], 0, 0);
  const end = new Date(start.getTime() + 5 * 60_000);
  return { start: stamp(start), end: stamp(end) };
}

export function dailyReminderIcs({ start, end, days, url }: { start: string; end: string; days: number; url: string }) {
  const now = new Date();
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yap101//Daily yap//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:yap101-daily-${start}@yap101`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `RRULE:FREQ=DAILY;COUNT=${Math.max(1, days)}`,
    `SUMMARY:${REMINDER_TITLE}`,
    `DESCRIPTION:${reminderDetails(url)}`,
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

/** Google Calendar "add event" page, pre-filled with the daily repeat. */
export function googleCalendarUrl({ at, days, url }: { at: [number, number]; days: number; url: string }) {
  const { start, end } = reminderTimes(at);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: REMINDER_TITLE,
    dates: `${start}/${end}`,
    details: reminderDetails(url),
    recur: `RRULE:FREQ=DAILY;COUNT=${Math.max(1, days)}`,
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Our calendar link (served as text/calendar) for Apple Calendar, Outlook and others. */
export function icsLink({ at, days }: { at: [number, number]; days: number }) {
  const { start, end } = reminderTimes(at);
  return `/api/reminder?${new URLSearchParams({ start, end, days: String(Math.max(1, days)) })}`;
}
