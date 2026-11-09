import type { Profile } from "@/lib/data/types";
import type { Prompt } from "@/lib/yap";
import { labelFor, NICHES } from "@/lib/options";

// Ready-made scripts for the "Introduce yourself" yaps (day 1, and again on day 30),
// built from what the user told us in onboarding. Each string is one teleprompter line.

const GOAL_LINE: Record<string, string> = {
  confidence: "to get comfortable talking on camera",
  storytelling: "to get better at telling stories",
  clarity: "to learn to get to the point",
  on_camera: "to sound more confident and clear",
  hooks: "to learn to grab you in the first 3 seconds",
};

const WHERE: Record<string, string> = {
  tiktok: "here on TikTok",
  instagram: "here on Instagram",
  youtube: "here on YouTube",
  linkedin: "here on LinkedIn",
  podcast: "on my podcast",
};

export function isIntroPrompt(p: Prompt) {
  return p.title.toLowerCase().startsWith("introduce yourself");
}

export function introScript(p: Prompt, profile: Profile | null): string[] | null {
  if (!isIntroPrompt(p)) return null;
  const name = profile?.display_name && profile.display_name !== "Guest" ? profile.display_name : "[your name]";
  const niche = labelFor(NICHES, profile?.niche)?.label.toLowerCase() ?? "the things I love";
  const goal = GOAL_LINE[profile?.goal ?? ""] ?? "to get better at talking on camera";
  const where = WHERE[profile?.platform ?? ""] ?? "here";

  if (p.day_index >= 30)
    return [
      `Hey, it's ${name} again!`,
      `30 days ago I started the Yap101 yap challenge ${goal}.`,
      `Today is day 30, and I made it.`,
      `I'm sticking with ${niche} content, so you'll keep seeing me ${where}.`,
      "Thanks for watching, and stay tuned for more!",
    ];

  return [
    `Hey, I'm ${name}!`,
    `I make content about ${niche}.`,
    `Today I'm starting the 30-day yap challenge with Yap101, ${goal}.`,
    `You'll see me ${where}, getting a little better every day.`,
    "Stay tuned for more!",
  ];
}
