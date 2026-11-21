// Shared by the "Write it for me" button (client) and /api/script (server).
// The client sends today's prompt plus the user's onboarding answers; the server checks
// and trims everything before it goes into the Claude prompt.

export type WriteRequest = {
  title: string;
  points: string[];
  skill: string;
  skillTip: string;
  focus: string;
  /** How long the yap should be, in seconds (the level's target, capped at 60). */
  seconds: number;
  name: string | null;
  niche: string | null;
  platform: string | null;
  /** Whatever is already in the editor; used as a starting point, not thrown away. */
  draft: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max: number) => str(v, max) || null;

export function parseWriteRequest(body: unknown): WriteRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const title = str(b.title, 200);
  if (!title) return null;
  const points = Array.isArray(b.points) ? b.points.map((p) => str(p, 200)).filter(Boolean).slice(0, 8) : [];
  const seconds = Math.min(60, Math.max(15, Math.round(Number(b.seconds)) || 30));
  return {
    title,
    points,
    skill: str(b.skill, 120),
    skillTip: str(b.skillTip, 400),
    focus: str(b.focus, 300),
    seconds,
    name: opt(b.name, 60),
    niche: opt(b.niche, 120),
    platform: opt(b.platform, 40),
    draft: str(b.draft, 3000),
  };
}

export const SCRIPT_SYSTEM = `You write short teleprompter scripts for Yap101, an app where creators practise talking on camera for a few seconds a day.

The script is read aloud by the creator, in their own voice, to their audience. Write the way people talk, not the way they write: short sentences, everyday words, contractions, no hashtags, emojis, stage directions or headings. Open with the most interesting line. Sound warm and confident, never salesy.

Put one sentence per line. Stay within the word budget you are given, because the creator has a time limit. Cover every talking point you are given, in a natural order, and let the script show off today's speaking skill. Only state facts about the creator that you were told; where you need a personal detail you don't have, write a short placeholder in square brackets, like [your city].

If the creator already wrote a draft, keep their ideas, facts and voice, and make it tighter and easier to say out loud.`;

export function scriptUserMessage(r: WriteRequest) {
  const words = Math.round((r.seconds / 60) * 150); // the editor estimates at 150 words a minute
  const about = [
    r.name && `Name: ${r.name}`,
    r.niche && `Makes content about: ${r.niche}`,
    r.platform && `Posts on: ${r.platform}`,
  ].filter(Boolean);
  return [
    `Today's prompt: ${r.title}`,
    r.points.length ? `Talking points to cover:\n${r.points.map((p) => `- ${p}`).join("\n")}` : "",
    r.skill ? `Today's speaking skill: ${r.skill}${r.skillTip ? ` (${r.skillTip})` : ""}` : "",
    r.focus ? `The creator's goal: ${r.focus}` : "",
    about.length ? `About the creator:\n${about.join("\n")}` : "About the creator: nothing yet, so use placeholders for personal details.",
    `Length: about ${r.seconds} seconds spoken, so at most ${words} words.`,
    r.draft ? `Their draft so far:\n"""\n${r.draft}\n"""` : "",
    "Return the script as a list of lines.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Demo builds with no API key: a simple script built from the talking points. */
export function demoWrittenScript(r: WriteRequest): string[] {
  const hi = r.name ? `Hey, I'm ${r.name}!` : "Hey, it's [your name]!";
  const body = r.points.slice(0, 3).map((p) => `${p.replace(/[.?!]+$/, "")}: [one line about it].`);
  return [hi, `Today: ${r.title.replace(/[.?!]+$/, "")}.`, ...body, "That's it for today. See you tomorrow!"];
}
