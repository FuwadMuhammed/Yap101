// Admin dashboard data: plain rows in, one report out. Pure functions, so the API route and
// the sample data (local demo mode) share the same maths.

export type AdminUserRow = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null };
export type AdminProfileRow = {
  id: string;
  display_name: string | null;
  niche: string | null;
  platform: string | null;
  level: string | null;
  goal: string | null;
  yap_time: string | null;
  onboarded_at: string | null;
  track_start_date: string | null;
};
export type AdminYapRow = {
  id: string;
  user_id: string;
  title: string;
  media: string;
  duration_seconds: number | null;
  local_date: string;
  created_at: string;
  deleted_at: string | null;
  score: number | null;
};
export type AdminWaitlistRow = { email: string; source: string | null; created_at: string };

export type Day = { date: string; count: number };
export type Breakdown = { label: string; count: number }[];

export type AdminReport = {
  sample: boolean;
  generatedAt: string;
  totals: {
    users: number;
    onboarded: number;
    waitlist: number;
    yaps: number;
    yapsToday: number;
    active7: number;
    avgScore: number | null;
    avgSeconds: number | null;
    /** Share of onboarded users who came back and yapped on a later day. */
    returned: number | null;
  };
  signups: Day[];
  yapsByDay: Day[];
  niches: Breakdown;
  goals: Breakdown;
  platforms: Breakdown;
  users: {
    id: string;
    email: string | null;
    name: string | null;
    niche: string | null;
    level: string | null;
    goal: string | null;
    joined: string;
    lastSignIn: string | null;
    yaps: number;
    lastYap: string | null;
    avgScore: number | null;
  }[];
  recentYaps: { id: string; title: string; email: string | null; date: string; seconds: number | null; media: string; score: number | null; deleted: boolean }[];
  waitlist: AdminWaitlistRow[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

function lastDays(n: number, today = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return iso(d);
  });
}

function countBy(values: (string | null | undefined)[]): Breakdown {
  const m = new Map<string, number>();
  for (const v of values) for (const part of (v ?? "").split(",").map((x) => x.trim()).filter(Boolean)) m.set(part, (m.get(part) ?? 0) + 1);
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function buildReport(
  { users, profiles, yaps, waitlist }: { users: AdminUserRow[]; profiles: AdminProfileRow[]; yaps: AdminYapRow[]; waitlist: AdminWaitlistRow[] },
  sample = false,
): AdminReport {
  const now = new Date();
  const today = iso(now);
  const days14 = lastDays(14, now);
  const week = new Set(lastDays(7, now));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const byUser = new Map<string, AdminYapRow[]>();
  for (const y of yaps) byUser.set(y.user_id, [...(byUser.get(y.user_id) ?? []), y]);

  const onboarded = profiles.filter((p) => p.onboarded_at);
  const returned = onboarded.length
    ? onboarded.filter((p) => new Set((byUser.get(p.id) ?? []).map((y) => y.local_date)).size >= 2).length / onboarded.length
    : null;

  const scores = yaps.flatMap((y) => (y.score == null ? [] : [y.score]));
  const seconds = yaps.flatMap((y) => (y.duration_seconds == null ? [] : [Number(y.duration_seconds)]));

  return {
    sample,
    generatedAt: now.toISOString(),
    totals: {
      users: users.length,
      onboarded: onboarded.length,
      waitlist: waitlist.length,
      yaps: yaps.length,
      yapsToday: yaps.filter((y) => y.local_date === today).length,
      active7: new Set(yaps.filter((y) => week.has(y.local_date)).map((y) => y.user_id)).size,
      avgScore: avg(scores),
      avgSeconds: avg(seconds),
      returned: returned === null ? null : Math.round(returned * 100) / 100,
    },
    signups: days14.map((date) => ({ date, count: users.filter((u) => u.created_at.slice(0, 10) === date).length })),
    yapsByDay: days14.map((date) => ({ date, count: yaps.filter((y) => y.local_date === date).length })),
    niches: countBy(profiles.map((p) => p.niche)),
    goals: countBy(profiles.map((p) => p.goal)),
    platforms: countBy(profiles.map((p) => p.platform)),
    users: users
      .map((u) => {
        const p = profileById.get(u.id);
        const ys = (byUser.get(u.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
        return {
          id: u.id,
          email: u.email,
          name: p?.display_name ?? null,
          niche: p?.niche ?? null,
          level: p?.level ?? null,
          goal: p?.goal ?? null,
          joined: u.created_at,
          lastSignIn: u.last_sign_in_at,
          yaps: ys.length,
          lastYap: ys[0]?.created_at ?? null,
          avgScore: avg(ys.flatMap((y) => (y.score == null ? [] : [y.score]))),
        };
      })
      .sort((a, b) => b.joined.localeCompare(a.joined)),
    recentYaps: [...yaps]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 100)
      .map((y) => ({
        id: y.id,
        title: y.title,
        email: emailById.get(y.user_id) ?? null,
        date: y.created_at,
        seconds: y.duration_seconds == null ? null : Number(y.duration_seconds),
        media: y.media,
        score: y.score,
        deleted: Boolean(y.deleted_at),
      })),
    waitlist: [...waitlist].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

/** Made-up data so the dashboard can be designed and checked locally (demo mode only). */
export function sampleReport(): AdminReport {
  const niches = ["fitness", "tech", "food", "finance", "beauty", "travel", "fitness,tech", "business"];
  const goals = ["confidence", "storytelling", "clarity", "on_camera", "hooks"];
  const platforms = ["tiktok", "instagram", "youtube", "linkedin"];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const now = Date.now();
  const users: AdminUserRow[] = [];
  const profiles: AdminProfileRow[] = [];
  const yaps: AdminYapRow[] = [];
  for (let i = 0; i < 46; i++) {
    const id = `u${i}`;
    const joined = new Date(now - Math.floor(rnd() * 14) * 86_400_000 - rnd() * 80_000_000);
    users.push({ id, email: `sample${i + 1}@example.com`, created_at: joined.toISOString(), last_sign_in_at: new Date(now - rnd() * 4 * 86_400_000).toISOString() });
    const done = rnd() > 0.2;
    profiles.push({
      id,
      display_name: `Sample ${i + 1}`,
      niche: niches[Math.floor(rnd() * niches.length)],
      platform: platforms[Math.floor(rnd() * platforms.length)],
      level: ["beginner", "intermediate", "pro"][Math.floor(rnd() * 3)],
      goal: goals[Math.floor(rnd() * goals.length)],
      yap_time: "evening",
      onboarded_at: done ? joined.toISOString() : null,
      track_start_date: done ? iso(joined) : null,
    });
    if (!done) continue;
    const n = Math.floor(rnd() * 9);
    for (let k = 0; k < n; k++) {
      const at = new Date(Math.min(now, joined.getTime() + Math.floor(rnd() * 10) * 86_400_000));
      yaps.push({ id: `${id}-y${k}`, user_id: id, title: ["Introduce yourself", "Why you got into fitness", "A small win from this week"][k % 3], media: rnd() > 0.3 ? "video" : "audio", duration_seconds: Math.round(20 + rnd() * 40), local_date: iso(at), created_at: at.toISOString(), deleted_at: rnd() > 0.95 ? at.toISOString() : null, score: Math.round(45 + rnd() * 50) });
    }
  }
  const waitlist: AdminWaitlistRow[] = Array.from({ length: 23 }, (_, i) => ({ email: `waitlist${i + 1}@example.com`, source: i % 3 ? "landing-cta" : "landing-hero", created_at: new Date(now - rnd() * 14 * 86_400_000).toISOString() }));
  return buildReport({ users, profiles, yaps, waitlist }, true);
}

/** Comma-separated admin emails from the server env (ADMIN_EMAILS). */
export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
