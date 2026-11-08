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
  /** Solid fill when selected. Text turns white unless `lightFill`. */
  fill: string;
  lightFill?: boolean;
};

const FILLS = [
  { fill: "bg-grape", lightFill: true },
  { fill: "bg-mint" },
  { fill: "bg-sun", lightFill: true },
  { fill: "bg-sky" },
  { fill: "bg-yap" },
  { fill: "bg-berry" },
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

export const PLATFORMS: Option[] = (
  [
    ["tiktok", "TikTok", Music2],
    ["instagram", "Reels", Camera],
    ["youtube", "Shorts", Play],
    ["linkedin", "LinkedIn", Users],
    ["podcast", "Podcast", Mic2],
    ["none", "Not yet", AtSign],
  ] as const
).map(([value, label, icon], i) => ({ value, label, icon, ...tint(i + 3) }));

export const CONFIDENCE: { value: string; label: string; mood: MascotMood; color: string }[] = [
  { value: "1", label: "I freeze", mood: "sleepy", color: "#a98bff" },
  { value: "2", label: "Nervous", mood: "think", color: "#2f7bf6" },
  { value: "3", label: "Okay", mood: "happy", color: "#1fa463" },
  { value: "4", label: "Good", mood: "talk", color: "#ffc21a" },
  { value: "5", label: "Natural", mood: "cheer", color: "#ff6b2c" },
];

export const LEVEL_OPTIONS: Option<Level>[] = [
  { value: "beginner", label: "Beginner", icon: Egg, hint: "I've barely talked to a camera", fill: "bg-sun", lightFill: true },
  { value: "intermediate", label: "Intermediate", icon: Feather, hint: "I post sometimes, but it's hard", fill: "bg-sky" },
  { value: "pro", label: "Pro", icon: Bird, hint: "I post weekly and want to level up", fill: "bg-yap" },
];

export const GOAL_OPTIONS: Option<Goal>[] = [
  { value: "confidence", label: "Feel natural", icon: Smile, hint: "Stop freezing, start talking", fill: "bg-mint" },
  { value: "storytelling", label: "Tell stories", icon: BookOpen, hint: "Keep people watching to the end", fill: "bg-grape", lightFill: true },
  { value: "clarity", label: "Get to the point", icon: Crosshair, hint: "Say more with fewer words", fill: "bg-sky" },
  { value: "on_camera", label: "Sound pro", icon: Mic2, hint: "Pace, energy, fewer ums", fill: "bg-berry" },
  { value: "hooks", label: "Hook fast", icon: Magnet, hint: "Grab attention in 3 seconds", fill: "bg-yap" },
];

export const labelFor = <T extends { value: string }>(list: T[], value: string | null | undefined) => list.find((o) => o.value === value);

/** When the user plans to yap. `hour:minute` is the reminder time. */
export const YAP_TIMES: (Option & { at: [number, number] })[] = [
  { value: "morning", label: "Morning", icon: Sunrise, hint: "Before the day gets busy · 8:00", fill: "bg-sun", lightFill: true, at: [8, 0] },
  { value: "midday", label: "Lunch break", icon: Sun, hint: "A quick reset · 12:30", fill: "bg-yap", at: [12, 30] },
  { value: "evening", label: "Evening", icon: Moon, hint: "Wind down and reflect · 19:00", fill: "bg-grape", lightFill: true, at: [19, 0] },
];
