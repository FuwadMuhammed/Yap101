"use client";

import { Download, LogIn, RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { YapButton, YapLink } from "@/components/yap/yap-button";
import type { AdminReport, Breakdown, Day } from "@/lib/admin";
import { GOAL_OPTIONS, NICHES, PLATFORMS, labelFor } from "@/lib/options";
import { cn } from "@/lib/utils";

type Load = { kind: "loading" } | { kind: "ok"; data: AdminReport } | { kind: "setup"; missing: string[] } | { kind: "signin" } | { kind: "forbidden"; email?: string } | { kind: "error"; message: string };
type Tab = "overview" | "users" | "yaps" | "waitlist";

const nf = new Intl.NumberFormat("en");
const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("en", { day: "numeric", month: "short" }) : "–");
const dateTime = (s: string | null) => (s ? new Date(s).toLocaleString("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–");
const niceLabel = (list: { value: string; label: string }[], v: string) => labelFor(list, v)?.label ?? v;

function csv(rows: Record<string, unknown>[], name: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Admin() {
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("overview");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) return setState({ kind: "ok", data: body });
      if (body.error === "setup") return setState({ kind: "setup", missing: body.missing });
      if (body.error === "signin") return setState({ kind: "signin" });
      if (body.error === "forbidden") return setState({ kind: "forbidden", email: body.email });
      setState({ kind: "error", message: body.message ?? `Error ${res.status}` });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo href="/" />
          <span className="bg-ink rounded-full px-2.5 py-1 text-xs font-bold text-white">Admin</span>
        </div>
        {state.kind === "ok" && (
          <YapButton variant="soft" size="sm" onClick={() => void load()}>
            <RefreshCw /> Refresh
          </YapButton>
        )}
      </header>

      {state.kind === "loading" && <p className="text-stone mt-16 text-center">Loading the numbers…</p>}
      {state.kind === "signin" && (
        <Gate icon={<LogIn className="size-6" />} title="Sign in to see the dashboard">
          <p>Use the email that&apos;s on the admin list.</p>
          <YapLink href="/login?next=/admin" className="mt-4" arrow>Sign in</YapLink>
        </Gate>
      )}
      {state.kind === "forbidden" && (
        <Gate icon={<ShieldAlert className="size-6" />} title="Not an admin account">
          <p>You&apos;re signed in as <strong>{state.email ?? "this account"}</strong>, which isn&apos;t on the admin list.</p>
          <p className="mt-2">Add it to <code className="bg-mist rounded px-1.5 py-0.5">ADMIN_EMAILS</code> in Vercel, then redeploy.</p>
        </Gate>
      )}
      {state.kind === "setup" && (
        <Gate icon={<ShieldAlert className="size-6" />} title="Two settings needed in Vercel">
          <p>Add these in Vercel → Project → Settings → Environment Variables, then redeploy:</p>
          <ul className="mt-3 space-y-2 text-left">
            {state.missing.includes("SUPABASE_SERVICE_ROLE_KEY") && (
              <li><code className="bg-mist rounded px-1.5 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code>: Supabase → Project Settings → API Keys → service_role (secret). Server-only.</li>
            )}
            {state.missing.includes("ADMIN_EMAILS") && (
              <li><code className="bg-mist rounded px-1.5 py-0.5">ADMIN_EMAILS</code>: who can open this page, comma-separated.</li>
            )}
          </ul>
        </Gate>
      )}
      {state.kind === "error" && (
        <Gate icon={<ShieldAlert className="size-6" />} title="Couldn't load the dashboard">
          <p>{state.message}</p>
          <YapButton variant="soft" size="sm" className="mt-4" onClick={() => void load()}><RefreshCw /> Try again</YapButton>
        </Gate>
      )}

      {state.kind === "ok" && (
        <>
          {state.data.sample && (
            <p className="bg-sun-soft mt-5 rounded-[16px] px-4 py-2.5 text-sm"><strong>Sample data.</strong> This local build has no database, so these numbers are made up.</p>
          )}
          <nav className="bg-mist mt-5 inline-flex rounded-full p-1" aria-label="Sections">
            {(["overview", "users", "yaps", "waitlist"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? "page" : undefined}
                className={cn("tap h-9 rounded-full px-4 text-sm font-semibold capitalize", tab === t ? "bg-white shadow-sm" : "text-stone hover:text-ink")}
              >
                {t}
                {t === "users" && ` · ${state.data.totals.users}`}
                {t === "waitlist" && ` · ${state.data.totals.waitlist}`}
              </button>
            ))}
          </nav>
          {tab === "overview" && <Overview d={state.data} />}
          {tab === "users" && <Users d={state.data} />}
          {tab === "yaps" && <Yaps d={state.data} />}
          {tab === "waitlist" && <Waitlist d={state.data} />}
          <p className="text-stone mt-8 text-xs">
            Updated {dateTime(state.data.generatedAt)}. Signed-in accounts only: guest-mode yaps stay in each visitor&apos;s browser and aren&apos;t counted. Recordings are never shown here.
          </p>
        </>
      )}
    </div>
  );
}

function Gate({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="surface mx-auto mt-16 max-w-md rounded-[28px] p-8 text-center">
      <span className="bg-mist mx-auto grid size-12 place-items-center rounded-full">{icon}</span>
      <h1 className="mt-4 text-[26px]">{title}</h1>
      <div className="text-stone mt-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

// ---------- Overview ----------

function Overview({ d }: { d: AdminReport }) {
  const t = d.totals;
  const tiles = [
    { label: "Accounts", value: nf.format(t.users), sub: `${nf.format(t.onboarded)} finished onboarding` },
    { label: "Active, last 7 days", value: nf.format(t.active7), sub: "yapped at least once" },
    { label: "Yaps", value: nf.format(t.yaps), sub: `${nf.format(t.yapsToday)} today` },
    { label: "Came back", value: t.returned == null ? "–" : `${Math.round(t.returned * 100)}%`, sub: "yapped on 2+ days" },
    { label: "Avg Yap score", value: t.avgScore == null ? "–" : String(Math.round(t.avgScore)), sub: t.avgSeconds == null ? "" : `avg ${Math.round(t.avgSeconds)}s per yap` },
    { label: "Waitlist", value: nf.format(t.waitlist), sub: "emails" },
  ];
  return (
    <div className="mt-5 flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((x) => (
          <div key={x.label} className="surface rounded-[20px] p-4">
            <p className="text-stone text-xs font-semibold">{x.label}</p>
            <p className="font-display mt-1 text-[30px] leading-none">{x.value}</p>
            {x.sub && <p className="text-stone mt-1.5 text-xs">{x.sub}</p>}
          </div>
        ))}
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DayChart title="New accounts" days={d.signups} />
        <DayChart title="Yaps recorded" days={d.yapsByDay} />
      </section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Bars title="Niches" rows={d.niches.map((r) => ({ ...r, label: niceLabel(NICHES, r.label) }))} />
        <Bars title="Goals" rows={d.goals.map((r) => ({ ...r, label: niceLabel(GOAL_OPTIONS, r.label) }))} />
        <Bars title="Platforms" rows={d.platforms.map((r) => ({ ...r, label: niceLabel(PLATFORMS, r.label) }))} />
      </section>
    </div>
  );
}

/** One series, last 14 days: thin rounded bars on a baseline, value on hover/focus. */
function DayChart({ title, days }: { title: string; days: Day[] }) {
  const max = Math.max(1, ...days.map((x) => x.count));
  const total = days.reduce((a, b) => a + b.count, 0);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover == null ? null : days[hover];
  return (
    <div className="surface rounded-[24px] p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">{title}</p>
        <p className="text-stone text-sm">{shown ? `${date(shown.date)}: ${shown.count}` : `${total} in 14 days`}</p>
      </div>
      <div className="mt-4 flex h-32 items-end gap-1.5 border-b border-line" role="img" aria-label={`${title}, last 14 days: ${days.map((x) => `${date(x.date)} ${x.count}`).join(", ")}`}>
        {days.map((x, i) => (
          <button
            key={x.date}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            className="group flex h-full flex-1 items-end"
            aria-label={`${date(x.date)}: ${x.count}`}
          >
            <span
              className={cn("w-full rounded-t-[4px] transition-colors", hover === i ? "bg-ink" : "bg-[#6fb3ec]")}
              style={{ height: `${x.count ? Math.max(4, (x.count / max) * 100) : 0}%` }}
            />
          </button>
        ))}
      </div>
      <div className="text-stone mt-1.5 flex justify-between text-[11px]">
        <span>{date(days[0]?.date ?? null)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

/** Horizontal bars for a breakdown, labelled directly with counts. */
function Bars({ title, rows }: { title: string; rows: Breakdown }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="surface rounded-[24px] p-5">
      <p className="font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-stone mt-3 text-sm">No data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.slice(0, 8).map((r) => (
            <li key={r.label} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-sm" title={`${r.label}: ${r.count}`}>
              <span className="truncate">{r.label}</span>
              <span className="bg-mist h-2.5 rounded-full">
                <span className="block h-full rounded-full bg-[#6fb3ec]" style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="text-stone text-right tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Tables ----------

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="surface text-stone mt-5 rounded-[20px] p-6 text-center text-sm">{empty}</p>;
  return (
    <div className="surface mt-4 overflow-x-auto rounded-[20px]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-stone border-line border-b text-xs">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-line divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-mist/50">{r.map((c, j) => <td key={j} className="px-4 py-2.5 whitespace-nowrap">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Toolbar({ count, noun, onExport, children }: { count: number; noun: string; onExport: () => void; children?: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-stone text-sm">{nf.format(count)} {noun}</p>
        {children}
      </div>
      <YapButton variant="soft" size="sm" onClick={onExport} disabled={!count}><Download /> Export CSV</YapButton>
    </div>
  );
}

function Users({ d }: { d: AdminReport }) {
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => d.users.filter((u) => `${u.email} ${u.name} ${u.niche}`.toLowerCase().includes(q.toLowerCase())),
    [d.users, q],
  );
  return (
    <>
      <Toolbar count={rows.length} noun="accounts" onExport={() => csv(rows, "yap101-users")}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, niche" aria-label="Search accounts" className="surface h-9 w-56 rounded-full px-4 text-sm outline-none" />
      </Toolbar>
      <Table
        head={["Email", "Name", "Niche", "Level", "Goal", "Joined", "Yaps", "Last yap", "Avg score"]}
        empty="No accounts yet."
        rows={rows.map((u) => [
          u.email ?? "–",
          u.name ?? "–",
          (u.niche ?? "").split(",").filter(Boolean).map((n) => niceLabel(NICHES, n)).join(", ") || "–",
          u.level ?? "–",
          u.goal ? niceLabel(GOAL_OPTIONS, u.goal) : "–",
          date(u.joined),
          u.yaps,
          date(u.lastYap),
          u.avgScore == null ? "–" : Math.round(u.avgScore),
        ])}
      />
    </>
  );
}

function Yaps({ d }: { d: AdminReport }) {
  return (
    <>
      <Toolbar count={d.recentYaps.length} noun="most recent yaps" onExport={() => csv(d.recentYaps, "yap101-yaps")} />
      <Table
        head={["When", "Prompt", "Account", "Media", "Length", "Score", ""]}
        empty="No yaps yet."
        rows={d.recentYaps.map((y) => [
          dateTime(y.date),
          <span key="t" className="block max-w-72 truncate">{y.title}</span>,
          y.email ?? "–",
          y.media,
          y.seconds == null ? "–" : `${Math.round(y.seconds)}s`,
          y.score ?? "–",
          y.deleted ? <span key="d" className="text-stone text-xs">deleted</span> : "",
        ])}
      />
    </>
  );
}

function Waitlist({ d }: { d: AdminReport }) {
  return (
    <>
      <Toolbar count={d.waitlist.length} noun="emails" onExport={() => csv(d.waitlist, "yap101-waitlist")} />
      <Table head={["Email", "Joined", "From"]} empty="Nobody on the waitlist yet." rows={d.waitlist.map((w) => [w.email, dateTime(w.created_at), w.source ?? "–"])} />
      <p className="text-stone mt-3 text-xs">
        To remove a test entry, delete the row in Supabase → Table Editor → waitlist. <Link href="https://supabase.com/dashboard" className="underline" target="_blank">Open Supabase</Link>
      </p>
    </>
  );
}
