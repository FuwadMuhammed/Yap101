// The Yap101 30-day curriculum. Plain data + pure functions, no imports with path
// aliases, so `scripts/gen-seed.ts` can load it directly with Node.
import type { Goal, Level, Prompt } from "./yap";

export type Week = { n: 1 | 2 | 3 | 4 | 5; theme: string; blurb: string };
export const WEEKS: Week[] = [
  { n: 1, theme: "Warm up", blurb: "Get comfortable talking to the lens." },
  { n: 2, theme: "Structure", blurb: "Hook, point, close. Every time." },
  { n: 3, theme: "Story", blurb: "Setup, tension, payoff." },
  { n: 4, theme: "Post-ready", blurb: "Takes and clips worth posting." },
  { n: 5, theme: "Graduate", blurb: "See how far you've come." },
];
export const weekFor = (day: number): Week => WEEKS[day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4];
export const MILESTONE_DAYS = [7, 14, 21, 30] as const;

type Day = { title: string; points: string[]; skill: string; tip: string };

// {niche} is replaced with the user's niche (e.g. "fitness") at display time.
const BASE: Day[] = [
  // Week 1: Warm up
  { title: "Introduce yourself", points: ["Your name and what you make", "Why you started", "What people can expect from you"], skill: "Smile and start", tip: "Smile right before you hit record. It relaxes your face and your voice." },
  { title: "Why you got into {niche}", points: ["The moment it clicked", "What you love about it", "Who you want to help"], skill: "Talk to one friend", tip: "Picture one friend behind the lens, not a crowd." },
  { title: "Your {niche} routine, honestly", points: ["What you planned to do", "What actually happens", "One thing you'd change"], skill: "Slow down", tip: "Nerves speed you up. Aim for slightly slower than feels natural." },
  { title: "A small win from this week", points: ["What happened", "Why it mattered", "What's next"], skill: "Pause instead of um", tip: "Feel an um coming? Close your mouth and pause. Silence looks confident." },
  { title: "The best {niche} advice you ever got", points: ["Who told you", "What they said", "How you use it"], skill: "Eyes on the lens", tip: "Look at the camera dot, not your own face on screen." },
  { title: "What you'd tell a {niche} beginner", points: ["The mistake to avoid", "The habit to build", "One encouraging thing"], skill: "Use your hands", tip: "Natural gestures make you look relaxed and add energy." },
  { title: "Who you are and what you share", points: ["Your name and your niche", "The one thing you talk about", "Why people should follow"], skill: "Put it together", tip: "Milestone yap! Smile, slow down, eyes on the lens. Post it if you like it." },
  // Week 2: Structure
  { title: "One {niche} mistake everyone makes", points: ["Name the mistake first", "Why it happens", "What to do instead"], skill: "Hook in 3 seconds", tip: "Say the most surprising part first. No 'hey guys, so today…'." },
  { title: "Three tools you use for {niche}", points: ["Tool one and why", "Tool two and why", "Tool three and why"], skill: "Number your points", tip: "Say 'three things' up front. People stay to hear all three." },
  { title: "Explain a {niche} idea in plain words", points: ["The idea in one line", "A simple example", "Why it matters"], skill: "One idea per sentence", tip: "Short sentences. If you need 'and' twice, split it." },
  { title: "A {niche} myth, busted", points: ["The myth", "Why people believe it", "The truth"], skill: "Hook, point, close", tip: "Hook with the myth, make your point, close with one line to remember." },
  { title: "Before and after: something you changed", points: ["How it was", "What you changed", "How it is now"], skill: "Signpost", tip: "Say 'first', 'then', 'now' so people never get lost." },
  { title: "Answer a question you get about {niche}", points: ["Say the question", "Answer in one line", "Then explain"], skill: "Get to the point", tip: "Answer in your first sentence. Explain after." },
  { title: "Teach one {niche} tip", points: ["Hook: the problem", "The tip, step by step", "Tell them to try it"], skill: "Close with an ask", tip: "Milestone yap! End with one clear ask: try it, save it, or comment." },
  // Week 3: Story
  { title: "The day something went wrong", points: ["Where you were", "What went wrong", "How it ended"], skill: "Set the scene fast", tip: "Where and when in one sentence, then jump into the action." },
  { title: "A moment that changed how you see {niche}", points: ["Before that moment", "What happened", "What changed in you"], skill: "Show the feeling", tip: "Say how it felt. Feelings are what people remember." },
  { title: "A story with a twist", points: ["What you expected", "The build-up", "What actually happened"], skill: "Build tension", tip: "Slow down right before the twist. Let it land." },
  { title: "Your biggest {niche} fail", points: ["What you tried", "How it went wrong", "What you learned"], skill: "Be honest", tip: "Real beats perfect. Admitting a fail builds trust fast." },
  { title: "Someone who inspired you", points: ["Who they are", "One specific moment", "What you took from it"], skill: "Use details", tip: "One sharp detail (a place, a sound, a quote) beats ten vague ones." },
  { title: "A time you almost quit", points: ["Why you wanted to stop", "What kept you going", "Where you are now"], skill: "Vary your pace", tip: "Slow for the hard part, faster for the comeback." },
  { title: "Your origin story", points: ["Setup: who you were", "Tension: what got hard", "Payoff: who you are now"], skill: "Setup, tension, payoff", tip: "Milestone yap! The full story arc in 60 seconds." },
  // Week 4: Post-ready
  { title: "Your hot take about {niche}", points: ["Say the take in one line", "Two reasons why", "Invite people to disagree"], skill: "Take a side", tip: "Don't hedge. A clear opinion gets comments." },
  { title: "Convince me to try something in {niche}", points: ["What it is", "The best reason", "Answer the doubt"], skill: "Answer the doubt", tip: "Say the objection out loud before they think it." },
  { title: "Rate something popular in {niche}", points: ["What it is", "One good thing, one bad thing", "Your score out of 10"], skill: "Energy up", tip: "Bring 20% more energy than feels normal. The camera eats energy." },
  { title: "Three things nobody tells you about {niche}", points: ["Thing one", "Thing two", "Save the best for last"], skill: "Open a loop", tip: "Tease the best one early: 'the third one surprised me'." },
  { title: "React to a trend in {niche}", points: ["What the trend is", "What you think", "What you'd do instead"], skill: "Sound like you", tip: "Use your own words and your own jokes. That's your brand." },
  { title: "If you started {niche} from zero today", points: ["What you'd skip", "What you'd do first", "What you'd tell yourself"], skill: "Strong close", tip: "Finish on your best line, then stop. Don't trail off." },
  { title: "Your best {niche} hook", points: ["A hook that stops the scroll", "One point that pays it off", "A close that sticks"], skill: "Post-ready", tip: "Use everything: hook, structure, energy, close. This one's for posting." },
  // Graduate
  { title: "What got easier this month", points: ["How you felt on day 1", "What changed", "What surprised you"], skill: "Reflect", tip: "Be specific: name one thing you do now that you didn't before." },
  { title: "Introduce yourself, again", points: ["Your name and what you make", "Why you started", "What people can expect from you"], skill: "Show your growth", tip: "Same prompt as day 1. Watch them side by side and see the difference!" },
];

// Each goal swaps in 4 of its own prompts (days 3, 10, 17, 24) and adds a focus line.
const SWAP_DAYS = [3, 10, 17, 24];
const GOALS: Record<Goal, { focus: string; swaps: Day[] }> = {
  confidence: {
    focus: "If you stumble, smile and keep going.",
    swaps: [
      { title: "Talk about your day without stopping", points: ["Morning", "Afternoon", "Right now"], skill: "Keep going", tip: "Mistakes are fine. The only rule is: don't stop." },
      { title: "Say something you're proud of", points: ["What you did", "Why it was hard", "How it felt"], skill: "Own it", tip: "No 'kind of' or 'I guess'. Say it like you mean it." },
      { title: "Talk to the camera like a FaceTime", points: ["Say hi like you know them", "Tell them your news", "Ask them a question"], skill: "Be casual", tip: "Hold the phone like a call. It feels less like a performance." },
      { title: "An opinion you usually keep to yourself", points: ["The opinion", "Why you hold back", "Why it matters"], skill: "Speak up", tip: "Nervous is normal. Say it anyway, a little slower." },
    ],
  },
  storytelling: {
    focus: "End with what changed.",
    swaps: [
      { title: "The funniest thing that happened to you", points: ["Set the scene", "What happened", "The punchline"], skill: "Save the punchline", tip: "Don't laugh before the funny part. Let it land." },
      { title: "A story in exactly three sentences", points: ["Sentence one: setup", "Sentence two: problem", "Sentence three: ending"], skill: "Cut the fluff", tip: "Three sentences forces you to keep only what matters." },
      { title: "A time you were wrong", points: ["What you believed", "What proved you wrong", "What you think now"], skill: "Turn the corner", tip: "The moment you realised is the heart of the story. Slow down there." },
      { title: "A {niche} moment you'll never forget", points: ["Where you were", "What happened", "Why it stuck"], skill: "Paint the picture", tip: "Add one sense: what you saw, heard or felt." },
    ],
  },
  clarity: {
    focus: "Say your point in one line first.",
    swaps: [
      { title: "What you do, in one sentence", points: ["Who you help", "What you help with", "Why it's different"], skill: "One-liner", tip: "If a stranger can repeat it back, it's clear." },
      { title: "Explain {niche} to a 10-year-old", points: ["What it is", "A simple example", "Why they'd care"], skill: "No jargon", tip: "Swap every fancy word for one a kid would use." },
      { title: "Pick one of two options in {niche}", points: ["Option A", "Option B", "Your pick and why"], skill: "Decide", tip: "Say your pick first, then justify it." },
      { title: "The one thing that matters most in {niche}", points: ["The thing", "Why it beats everything else", "How to start"], skill: "Prioritise", tip: "Resist adding a second thing. One is memorable." },
    ],
  },
  on_camera: {
    focus: "Eyes on the lens, energy up.",
    swaps: [
      { title: "A big-energy intro", points: ["Greet like you're on stage", "Say what's coming", "Get people excited"], skill: "Energy up", tip: "Stand up if you can. Energy follows posture." },
      { title: "One line, three ways", points: ["Say it calm", "Say it excited", "Say it serious"], skill: "Vocal range", tip: "Same words, different tone. Notice how your face changes too." },
      { title: "Walk and talk about {niche}", points: ["Start moving", "Make your point", "Stop and close"], skill: "Move naturally", tip: "Hold the phone at eye level and keep it steady." },
      { title: "Your 'welcome back' channel intro", points: ["Hook", "Who you are", "What this video is"], skill: "Own the frame", tip: "Centre yourself, lean in slightly, smile with your eyes." },
    ],
  },
  hooks: {
    focus: "Hook in the first 3 seconds.",
    swaps: [
      { title: "Open with a question about {niche}", points: ["A question people wonder about", "Your answer", "One surprising detail"], skill: "Question hook", tip: "Ask something people secretly want to know." },
      { title: "Start with 'Stop doing this'", points: ["What to stop", "Why it hurts", "What to do instead"], skill: "Pattern break", tip: "A warning grabs attention. Back it up quickly." },
      { title: "Three hooks for one {niche} video", points: ["A question hook", "A bold-claim hook", "A story hook"], skill: "Hook reps", tip: "Say all three, then decide which one you'd post." },
      { title: "Start with a number you know", points: ["The number", "What it means", "What to do about it"], skill: "Number hook", tip: "Only use numbers you're sure of. Real beats made up." },
    ],
  },
};

const LEVEL_IDX: Record<Level, number> = { beginner: 0, intermediate: 1, pro: 2 };
const GOAL_LIST = Object.keys(GOALS) as Goal[];

/** The 30 prompts for a level + goal. IDs are stable: (combo * 100) + day. */
export function buildTrack(level: Level, goal: Goal): Prompt[] {
  const combo = LEVEL_IDX[level] * GOAL_LIST.length + GOAL_LIST.indexOf(goal);
  const g = GOALS[goal];
  return BASE.map((base, i) => {
    const day = i + 1;
    const swap = SWAP_DAYS.indexOf(day);
    const d = swap >= 0 ? g.swaps[swap] : base;
    const w = weekFor(day);
    return {
      id: combo * 100 + day,
      level,
      goal,
      day_index: day,
      title: d.title,
      talking_points: d.points,
      skill: d.skill,
      skill_tip: d.tip,
      week: w.n,
      focus: g.focus,
      milestone: (MILESTONE_DAYS as readonly number[]).includes(day),
    };
  });
}

export const ALL_PROMPTS: Prompt[] = (["beginner", "intermediate", "pro"] as Level[]).flatMap((l) => GOAL_LIST.flatMap((g) => buildTrack(l, g)));

/** Seconds we suggest per level. 60 s stays the hard cap. */
export const TARGET_SECONDS: Record<Level, number> = { beginner: 30, intermediate: 45, pro: 60 };

/** Beginners get every talking point; pros get just the opener and improvise the rest. */
export function visiblePoints(points: string[], level: Level | null | undefined) {
  if (level === "pro") return points.slice(0, 1);
  if (level === "intermediate") return points.slice(0, 2);
  return points;
}

/** Fill {niche} placeholders with the user's niche (lower-case label). */
export function personalize<T extends { title: string; talking_points: string[] }>(p: T, niche: string | null | undefined): T {
  const n = (niche || "your niche").toLowerCase();
  const fill = (s: string) => s.replaceAll("{niche}", n);
  return { ...p, title: fill(p.title), talking_points: p.talking_points.map(fill) };
}
