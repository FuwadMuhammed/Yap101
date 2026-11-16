import {
  AtSign, Bike, Briefcase, ChefHat, Coins, Crosshair, Dumbbell, Gamepad2, Laugh, Laptop, Magnet, Mic2, Music2, Palette,
  Plane, Smile, Sparkle, Sprout, BookOpen, Camera, Play, Users, Egg, Bird, Feather, Sunrise, Sun, Moon, type LucideIcon,
} from "lucide-react";
import type { MascotMood } from "@/components/brand/mascot";
import type { Goal, Level } from "@/lib/yap";

export type Option<T extends string = string> = {
  value: T;
  label: string;
  icon: LucideIcon;
  hint?: string;
  /** Pastel fill when selected (ink text). `lightFill` kept for older call sites. */
  fill: string;
  lightFill?: boolean;
};

const FILLS = [
  { fill: "bg-grape", lightFill: true },
  { fill: "bg-mint", lightFill: true },
  { fill: "bg-sun", lightFill: true },
  { fill: "bg-sky", lightFill: true },
  { fill: "bg-yap", lightFill: true },
  { fill: "bg-berry", lightFill: true },
];
const tint = (i: number) => FILLS[i % FILLS.length];

export const NICHES: Option[] = (
  [
    ["fitness", "Fitness", Dumbbell],
    ["tech", "Tech", Laptop],
    ["food", "Food", ChefHat],
    ["finance", "Money", Coins],
    ["beauty", "Beauty", Sparkle],
    ["gaming", "Gaming", Gamepad2],
    ["travel", "Travel", Plane],
    ["business", "Business", Briefcase],
    ["comedy", "Comedy", Laugh],
    ["art", "Art", Palette],
    ["sports", "Sports", Bike],
    ["lifestyle", "Lifestyle", Sprout],
  ] as const
).map(([value, label, icon], i) => ({ value, label, icon, ...tint(i) }));

// --- Niches: people can pick up to 3. Stored as "fitness,tech" (a single value still works). ---
export const MAX_NICHES = 3;
export const nicheValues = (v: string | null | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
export const nicheOptions = (v: string | null | undefined) =>
  nicheValues(v).flatMap((x) => NICHES.find((o) => o.value === x) ?? []);
/** "fitness", "fitness and tech", "fitness, tech and food" (lowercase, for sentences). */
export function nicheList(v: string | null | undefined) {
  const l = nicheOptions(v).map((o) => o.label.toLowerCase());
  return l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}
/** The niche a day's prompt is about: rotates through their picks so titles stay simple. */
export function nicheForDay(v: string | null | undefined, day: number) {
  const o = nicheOptions(v);
  return o.length ? o[(Math.max(1, day) - 1) % o.length].label : undefined;
}

export const PLATFORMS: Option[] = (
  [
    ["tiktok", "TikTok", Music2],
    ["instagram", "Instagram", Camera],
    ["youtube", "YouTube", Play],
    ["linkedin", "LinkedIn", Users],
    ["podcast", "Podcast", Mic2],
    ["none", "Not yet", AtSign],
  ] as const
).map(([value, label, icon], i) => ({ value, label, icon, ...tint(i + 3) }));

export const CONFIDENCE: { value: string; label: string; mood: MascotMood; color: string }[] = [
  { value: "1", label: "I freeze", mood: "sleepy", color: "#a993f2" },
  { value: "2", label: "Nervous", mood: "think", color: "#6fb3ec" },
  { value: "3", label: "Okay", mood: "happy", color: "#74c08d" },
  { value: "4", label: "Good", mood: "talk", color: "#f5b740" },
  { value: "5", label: "Natural", mood: "cheer", color: "#f08a5d" },
];

export const LEVEL_OPTIONS: Option<Level>[] = [
  { value: "beginner", label: "Beginner", icon: Egg, hint: "I've barely talked to a camera", fill: "bg-sun", lightFill: true },
  { value: "intermediate", label: "Intermediate", icon: Feather, hint: "I post sometimes, but it's hard", fill: "bg-sky", lightFill: true },
  { value: "pro", label: "Pro", icon: Bird, hint: "I post weekly and want to level up", fill: "bg-yap", lightFill: true },
];

export const GOAL_OPTIONS: Option<Goal>[] = [
  { value: "confidence", label: "Feel natural", icon: Smile, hint: "Stop freezing, start talking", fill: "bg-mint", lightFill: true },
  { value: "storytelling", label: "Tell stories", icon: BookOpen, hint: "Keep people watching to the end", fill: "bg-grape", lightFill: true },
  { value: "clarity", label: "Get to the point", icon: Crosshair, hint: "Say more with fewer words", fill: "bg-sky", lightFill: true },
  { value: "on_camera", label: "Sound pro", icon: Mic2, hint: "Pace, energy and presence", fill: "bg-berry", lightFill: true },
  { value: "hooks", label: "Hook fast", icon: Magnet, hint: "Grab attention in 3 seconds", fill: "bg-yap", lightFill: true },
];

export const labelFor = <T extends { value: string }>(list: T[], value: string | null | undefined) => list.find((o) => o.value === value);

/** When the user plans to yap. `hour:minute` is the reminder time. */
export const YAP_TIMES: (Option & { at: [number, number] })[] = [
  { value: "morning", label: "Morning", icon: Sunrise, hint: "Before the day gets busy · 8:00", fill: "bg-sun", lightFill: true, at: [8, 0] },
  { value: "midday", label: "Lunch break", icon: Sun, hint: "A quick reset · 12:30", fill: "bg-yap", lightFill: true, at: [12, 30] },
  { value: "evening", label: "Evening", icon: Moon, hint: "Wind down and reflect · 19:00", fill: "bg-grape", lightFill: true, at: [19, 0] },
];
