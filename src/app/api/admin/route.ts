import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { adminEmails, buildReport, sampleReport, type AdminProfileRow, type AdminUserRow, type AdminWaitlistRow, type AdminYapRow } from "@/lib/admin";
import { envDemo } from "@/lib/data/mode";
import { createClient } from "@/lib/supabase/server";

// The admin dashboard's data. Only for signed-in users whose email is in ADMIN_EMAILS.
// Reads every table with the service-role key, which stays on the server (never NEXT_PUBLIC).
// Recordings are never exposed here: only metadata and scores.
export async function GET() {
  // Local demo build (no Supabase): sample numbers so the dashboard can be checked.
  if (envDemo) return NextResponse.json(sampleReport());

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admins = adminEmails();
  const missing = [!serviceKey && "SUPABASE_SERVICE_ROLE_KEY", !admins.length && "ADMIN_EMAILS"].filter(Boolean);
  if (missing.length) return NextResponse.json({ error: "setup", missing }, { status: 503 });

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  if (!user.email || !admins.includes(user.email.toLowerCase())) return NextResponse.json({ error: "forbidden", email: user.email }, { status: 403 });

  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const [authUsers, profiles, yaps, feedback, waitlist] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("profiles").select("id, display_name, niche, platform, level, goal, yap_time, onboarded_at, track_start_date"),
    db.from("yaps").select("id, user_id, title, media, duration_seconds, local_date, created_at, deleted_at").order("created_at", { ascending: false }).limit(5000),
    db.from("feedback").select("yap_id, score").limit(5000),
    db.from("waitlist").select("email, source, created_at").order("created_at", { ascending: false }).limit(5000),
  ]);
  const failed = [authUsers.error, profiles.error, yaps.error, feedback.error, waitlist.error].find(Boolean);
  if (failed) return NextResponse.json({ error: "query", message: failed.message }, { status: 500 });

  const scoreByYap = new Map((feedback.data ?? []).map((f) => [f.yap_id as string, (f.score as number | null) ?? null]));
  const users: AdminUserRow[] = authUsers.data.users.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null }));
  const yapRows: AdminYapRow[] = (yaps.data ?? []).map((y) => ({ ...(y as Omit<AdminYapRow, "score">), score: scoreByYap.get(y.id as string) ?? null }));

  return NextResponse.json(
    buildReport({ users, profiles: (profiles.data ?? []) as AdminProfileRow[], yaps: yapRows, waitlist: (waitlist.data ?? []) as AdminWaitlistRow[] }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
