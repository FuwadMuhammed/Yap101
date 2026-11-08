# Yap101

Daily speaking practice for creators. Phase 1: mobile-first web app (Next.js 16 + Supabase on Vercel).

## Demo mode (no Supabase)

Set `NEXT_PUBLIC_DEMO_MODE=true` in `.env.local` (it is also on automatically while the Supabase URL is
missing or still the placeholder). Sign-in, onboarding, prompts, recording, fake AI feedback, streaks
and history all work with sample data saved in the browser (recordings in IndexedDB). The History
screen has demo tools to fake a streak or reset everything.

## Setup

1. Node 22.12 or newer is best (`.nvmrc`). The npm scripts pass `--experimental-require-module` so Node 22.0–22.11 also works (Tailwind's loader needs it).
2. `npm install`
3. Create a Supabase project, then run both files in `supabase/migrations/` (in order) and
   `supabase/seed.sql` in its SQL editor (or use the Supabase CLI: `supabase db push`).
4. In Supabase → Authentication, enable Google and Email, and add
   `http://localhost:3000/auth/callback` (plus your Vercel URLs) to the redirect URLs.
5. `cp .env.example .env.local` and fill in the URL and publishable key.
6. `npm run dev` and open http://localhost:3000. To test the camera on a phone, use an HTTPS
   tunnel or the Vercel preview URL, because browsers only allow the camera on HTTPS.

## Curriculum

`src/lib/curriculum.ts` is the source of truth for prompts: 4 weekly themes plus a graduate finale,
a skill and tip per day, 4 goal-specific swap-in days per goal, and `{niche}` placeholders filled in
from the user's niche. Level sets the target length (30/45/60 s) and how many talking points show.
After editing it, regenerate the Supabase seed:

```bash
node --experimental-strip-types scripts/gen-seed.ts
```

## Screens

| Route | What it does |
|---|---|
| `/` | Landing page (waitlist form still to do) |
| `/login` | Google or email magic link (Supabase Auth) |
| `/onboarding` | Name, niche, platform, confidence, level, goal, yap time; then straight into day 1 |
| `/home` | Today: week strip, prompt card with skill, streak + freezes, 30-day track, level, badges |
| `/track` | All 30 days by week; future days show the skill with the title hidden |
| `/record` | Prep card (skill + tip), then camera on tap; teleprompter, level target length, 60 s cap, share/save |
| `/feedback/[id]` | Celebration, pace + filler words, trend vs last yap, tips, tomorrow's prompt, calendar reminder |
| `/history` | Past yaps, delete |

## Still to build (per the launch plan)

- AI feedback route: speech-to-text + one LLM call, writes to `feedback`
- Waitlist launch email (Resend), PostHog/Plausible, Sentry
- Legal review of the draft privacy and terms pages; delete-my-account
- Designer pass on the curriculum copy in `src/lib/curriculum.ts`
