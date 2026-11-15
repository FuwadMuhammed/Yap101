import { ChevronDown, Lock, Bike, Briefcase, ChefHat, Coins, Dumbbell, Gamepad2, Laugh, Laptop, Palette, Plane, Sparkle, Sprout } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Yapper, YapperAvatar, YapperCluster } from "@/components/brand/mascot";
import { AppPreview } from "@/components/landing/app-preview";
import { MobileMenu } from "@/components/landing/mobile-menu";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { WEEKS } from "@/lib/curriculum";
import { LEVELS } from "@/lib/game";
import { Flame } from "@/components/yap/stats";
import { YapLink } from "@/components/yap/yap-button";

const STEPS = [
  { title: "Pick your goal", body: "Tell us your niche and level. We build a 30-day yap track just for you.", bg: "bg-sky", y: { shape: "blob" as const, mood: "think" as const } },
  { title: "Yap for 60 seconds", body: "Talking points float over your camera. Hit record and just talk.", bg: "bg-yap", y: { shape: "puff" as const, mood: "talk" as const } },
  { title: "Get better daily", body: "A Yap score for your pace, pauses, energy, eye contact and smile, plus XP, streaks and a clip you can post.", bg: "bg-mint", y: { shape: "bean" as const, mood: "cheer" as const } },
];

const NICHES = [
  { icon: Dumbbell, label: "Fitness" },
  { icon: Laptop, label: "Tech" },
  { icon: ChefHat, label: "Food" },
  { icon: Coins, label: "Money" },
  { icon: Sparkle, label: "Beauty" },
  { icon: Gamepad2, label: "Gaming" },
  { icon: Plane, label: "Travel" },
  { icon: Briefcase, label: "Business" },
  { icon: Laugh, label: "Comedy" },
  { icon: Palette, label: "Art" },
  { icon: Bike, label: "Sports" },
  { icon: Sprout, label: "Lifestyle" },
];
const SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#game", label: "Streaks & XP" },
  { href: "#who", label: "Who it's for" },
  { href: "#faq", label: "FAQ" },
];

const ARC = [
  { bg: "bg-sky text-ink", skill: "Smile, slow down, eyes on the lens" },
  { bg: "bg-yap text-ink", skill: "Hook in 3 seconds, number your points" },
  { bg: "bg-grape text-ink", skill: "Setup, tension, payoff" },
  { bg: "bg-mint text-ink", skill: "Hot takes and post-ready clips" },
];

const WHO = [
  { i: 1, title: "New creators who freeze up", body: "You know what to say until the red dot comes on. Daily reps make the camera feel normal." },
  { i: 2, title: "Creators who ramble", body: "You post, but you say um a lot and take ages to get to the point. Learn hooks and structure." },
  { i: 4, title: "Professionals building a brand", body: "LinkedIn, talks, client calls. Speak clearly and confidently in a minute or less." },
];

const FAQ = [
  { q: "Is it free?", a: "Yes, while we're in beta. You get 3 yaps a day, which is plenty for a daily habit." },
  { q: "How long does it take?", a: "About 2 minutes a day: a quick tip, then 30 to 60 seconds of talking." },
  { q: "Do I have to post my videos?", a: "Never. Your yaps are private. If you love one, you can share or save it in one tap." },
  { q: "Which phones and browsers work?", a: "Chrome, Safari and Edge, on iPhone, Android and laptop. You can also record audio only." },
  { q: "What does the feedback tell me?", a: "A Yap score out of 100, broken down into how fast you started, your pace, pauses, voice energy, eye contact and smile, plus three short tips. It's measured on your phone, so your video isn't uploaded for it. Filler-word counts (um, like) and an AI coach are coming soon." },
  { q: "Do I need to download an app?", a: "No, it runs in your browser. On iPhone you can add it to your Home Screen so it opens like an app." },
];

const TINTS = ["hover:bg-sky", "hover:bg-yap", "hover:bg-sun", "hover:bg-grape", "hover:bg-mint", "hover:bg-berry"];

export default function Landing() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-paper/85 sticky top-0 z-30 px-4 backdrop-blur-md sm:px-6">
        <nav className="border-line mx-auto flex h-16 max-w-5xl items-center justify-between border-b">
          <Logo />
          <div className="text-stone hidden items-center gap-7 text-[15px] font-medium md:flex">
            {SECTIONS.map((l) => (
              <a key={l.href} href={l.href} className="hover:text-ink">{l.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <MobileMenu links={SECTIONS} />
            <YapLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">Sign in</YapLink>
            <YapLink href="/login" size="sm">Get started</YapLink>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-4 pt-14 pb-10 text-center sm:px-6 md:pt-20">
          <div className="animate-rise">
            <span className="surface inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold">
              <Flame className="size-4" /> 60 seconds a day · 30 days
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-[46px] leading-[0.98] sm:text-7xl">Get confident on camera in 30 days.</h1>
            <p className="text-stone mx-auto mt-5 max-w-xl text-lg leading-relaxed">
              One short speaking challenge a day. A prompt picked for your niche, a teleprompter so you never blank, a Yap score on every take, and a streak that keeps you coming back.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <YapLink href="/login" size="xl" arrow className="w-full max-w-xs sm:w-auto">Start your 30 days</YapLink>
              <YapLink href="#how" variant="soft" size="xl" className="w-full max-w-xs sm:w-auto">How it works</YapLink>
            </div>
            <p className="text-stone mt-4 text-sm">
              Free in beta · works in your browser · <a href="#waitlist" className="text-ink inline-block py-1.5 font-semibold underline underline-offset-4">join the waitlist</a>
            </p>
          </div>
          <div className="relative mt-14">
            <YapperCluster className="absolute top-24 -left-2 hidden scale-75 lg:flex" />
            <div className="absolute top-40 -right-2 hidden flex-col gap-3 lg:flex">
              <span className="surface flex h-12 items-center gap-2 rounded-full px-4 font-bold"><Flame />7 day streak</span>
              <span className="bg-sun flex h-12 items-center rounded-full px-4 font-bold">+15 XP</span>
              <span className="surface flex h-12 items-center rounded-full px-4 font-bold">Yap score 82 <span className="text-mint ml-1">↑ 9</span></span>
            </div>
            <AppPreview className="animate-rise [animation-delay:150ms]" />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20 sm:px-6">
          <h2 className="text-[38px] sm:text-5xl">Three steps, every day.</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <article key={s.title} className={`${s.bg} relative flex min-h-[230px] flex-col overflow-hidden rounded-[28px] p-6 text-ink`}>
                <span className="text-sm font-bold">0{i + 1}</span>
                <h3 className="mt-2 text-[28px]">{s.title}</h3>
                <p className="mt-2 max-w-[75%] leading-relaxed">{s.body}</p>
                <Yapper shape={s.y.shape} mood={s.y.mood} color="#ffffff" className="absolute -right-3 -bottom-3 size-28 opacity-95" />
              </article>
            ))}
          </div>
        </section>

        {/* 30-day arc */}
        <section id="arc" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-10 sm:px-6">
          <h2 className="text-[38px] sm:text-5xl">A real 30-day plan.</h2>
          <p className="text-stone mt-3 max-w-xl text-lg">Each week builds one skill, and each day teaches one small thing before you record.</p>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {WEEKS.slice(0, 4).map((w, i) => (
              <li key={w.n} className={`${ARC[i].bg} flex min-h-[180px] flex-col rounded-[28px] p-5`}>
                <span className="text-sm font-semibold">Week {w.n}</span>
                <span className="font-display mt-1 text-[28px]">{w.theme}</span>
                <span className="mt-1">{w.blurb}</span>
                <span className="mt-auto pt-4 text-sm font-semibold">{ARC[i].skill}</span>
              </li>
            ))}
          </ol>
          <p className="text-stone mt-4 text-sm">Day 30: you record the same intro as day 1, and see the difference for yourself.</p>
        </section>

        {/* Who it's for */}
        <section id="who" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20 sm:px-6">
          <h2 className="text-[38px] sm:text-5xl">Made for people who&apos;d rather not be on camera (yet).</h2>
          <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
            {WHO.map((w) => (
              <article key={w.title} className="surface rounded-[28px] p-6">
                <YapperAvatar index={w.i} className="size-14" />
                <h3 className="mt-4 text-[22px]">{w.title}</h3>
                <p className="text-stone mt-2 leading-relaxed">{w.body}</p>
              </article>
            ))}
          </div>
          <div className="bg-mint-soft mt-4 flex flex-col gap-3 rounded-[28px] p-5 sm:flex-row sm:items-center">
            <span className="bg-mint text-ink grid size-11 shrink-0 place-items-center rounded-full"><Lock className="size-5" /></span>
            <p className="font-semibold leading-relaxed">
              Your recordings are private. Posting is always your choice. Delete anything, any time.
            </p>
          </div>
        </section>

        {/* Game */}
        <section id="game" className="mx-auto grid max-w-5xl scroll-mt-24 grid-cols-1 items-center gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-[38px] leading-[1.02] sm:text-5xl">Practice that feels like a game.</h2>
            <p className="text-stone mt-4 text-lg leading-relaxed">
              Every yap earns XP. Show up daily to grow your streak, collect badges, and climb from Mumbler to Yap Legend.
            </p>
          </div>
          <div className="bg-grape rounded-[32px] p-3">
            <ul className="flex flex-col gap-2">
              {[
                // Thresholds come from the game rules, so the landing page can't drift from the app.
                { i: 1, n: 3 },
                { i: 2, n: 2 },
                { i: 4, n: 1 },
              ].map(({ i, n }) => ({ i, top: `Level ${n + 1}`, name: LEVELS[n].title, right: `${LEVELS[n].at} XP` })).map((r) => (
                <li key={r.name} className="flex items-center gap-3 rounded-full bg-white p-1.5 pr-5">
                  <YapperAvatar index={r.i} className="size-11" />
                  <div className="flex-1">
                    <p className="text-stone text-xs">{r.top}</p>
                    <p className="font-semibold">{r.name}</p>
                  </div>
                  <span className="font-bold">{r.right}</span>
                </li>
              ))}
              <li className="bg-yap text-ink flex items-center gap-3 rounded-full p-1.5 pr-5">
                <YapperAvatar index={0} mood="cheer" className="size-11 bg-white!" />
                <div className="flex-1">
                  <p className="text-ink/70 text-xs">You · 7 day streak</p>
                  <p className="font-semibold">Mumbler → Chatter</p>
                </div>
                <span className="font-bold">+15 XP</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Niches */}
        <section id="niches" className="mx-auto max-w-5xl scroll-mt-24 px-4 py-20 sm:px-6">
          <h2 className="text-[38px] sm:text-5xl">Made for every niche.</h2>
          <p className="text-stone mt-3 text-lg">Prompts tuned to what you talk about.</p>
          <div className="mt-10 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {NICHES.map(({ icon: Icon, label }, i) => (
              <div key={label} className={`surface flex aspect-square flex-col items-center justify-center gap-2 rounded-[24px] font-semibold transition-colors ${TINTS[i % TINTS.length]}`}>
                <Icon className="size-6" strokeWidth={2.2} />
                {label}
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 sm:px-6">
          <h2 className="text-[38px] sm:text-5xl">Questions</h2>
          <div className="surface divide-line mt-8 divide-y overflow-hidden rounded-[28px]">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <ChevronDown className="text-stone size-5 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-stone mt-2 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-16 sm:px-6">
          <div className="bg-ink mx-auto max-w-5xl rounded-[40px] px-6 py-16 text-center text-white sm:py-20">
            <YapperCluster mood="cheer" className="mb-8" />
            <h2 className="text-[38px] sm:text-6xl">What are you yapping about today?</h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-white/70">Your first prompt is waiting. Day 1 takes about two minutes.</p>
            <div className="mt-8 flex justify-center">
              <YapLink href="/login" variant="white" size="xl" arrow>Start yapping</YapLink>
            </div>
            <div id="waitlist" className="mx-auto mt-10 max-w-lg scroll-mt-24 border-t border-white/10 pt-8">
              <p className="mb-3 font-semibold">Not ready yet? Get a nudge when we launch.</p>
              <WaitlistForm source="landing-cta" dark />
            </div>
          </div>
        </section>
      </main>

      <footer className="text-stone mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row sm:px-6">
        <Logo className="text-lg text-ink" />
        <div className="flex gap-2">
          <a href="/privacy" className="hover:text-ink inline-flex min-h-11 items-center px-2">Privacy</a>
          <a href="/terms" className="hover:text-ink inline-flex min-h-11 items-center px-2">Terms</a>
        </div>
        <p>© 2026 Yap101</p>
      </footer>
    </div>
  );
}
