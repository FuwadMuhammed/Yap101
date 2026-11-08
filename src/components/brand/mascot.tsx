import { cn } from "@/lib/utils";

export type MascotMood = "happy" | "talk" | "cheer" | "sleepy" | "think";
export type YapperShape = "bubble" | "blob" | "square" | "scallop" | "bean";

// Scalloped circle (10 bumps), computed once.
const SCALLOP = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    const r = 39 + 5 * Math.cos(10 * t);
    pts.push(`${(50 + r * Math.cos(t)).toFixed(2)} ${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
})();

const BODY: Record<YapperShape, { d: string; face: [number, number] }> = {
  bubble: { d: "M22 12h56a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16H48L30 91l3-15H22A16 16 0 0 1 6 60V28a16 16 0 0 1 16-16Z", face: [50, 42] },
  blob: { d: "M50 7c15 0 21 9 30 14s14 15 12 29-5 22-16 30-26 12-38 6S11 73 8 59s2-26 11-36S35 7 50 7Z", face: [50, 50] },
  square: { d: "M34 9h32a25 25 0 0 1 25 25v32a25 25 0 0 1-25 25H34A25 25 0 0 1 9 66V34A25 25 0 0 1 34 9Z", face: [50, 50] },
  scallop: { d: SCALLOP, face: [50, 50] },
  bean: { d: "M50 6c19 0 32 14 32 34v20c0 20-13 34-32 34S18 80 18 60V40C18 20 31 6 50 6Z", face: [50, 48] },
};

/** One member of the Yapper family: a flat, colourful character with a simple face. */
export function Yapper({
  shape = "bubble",
  color = "#ff6b2c",
  mood = "happy",
  className,
  label,
}: {
  shape?: YapperShape;
  color?: string;
  mood?: MascotMood;
  className?: string;
  label?: string;
}) {
  const ink = "#161514";
  const { d, face } = BODY[shape];
  const [cx, cy] = face;
  const eyeL = cx - 11;
  const eyeR = cx + 11;
  const look = mood === "think" ? -3 : 0;
  return (
    <svg viewBox="0 0 100 100" className={cn("size-20", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={d} fill={color} />
      {/* eyes */}
      {mood === "cheer" ? (
        <g stroke={ink} strokeWidth="4.5" strokeLinecap="round" fill="none">
          <path d={`M${eyeL - 5} ${cy - 2}q5-7 10 0`} />
          <path d={`M${eyeR - 5} ${cy - 2}q5-7 10 0`} />
        </g>
      ) : mood === "sleepy" ? (
        <g stroke={ink} strokeWidth="4.5" strokeLinecap="round">
          <path d={`M${eyeL - 5} ${cy - 2}h10`} />
          <path d={`M${eyeR - 5} ${cy - 2}h10`} />
        </g>
      ) : (
        <g className="animate-blink" style={{ transformOrigin: `${cx}px ${cy - 3}px` }}>
          <ellipse cx={eyeL} cy={cy - 3 + look} rx="4.6" ry="6.4" fill={ink} />
          <ellipse cx={eyeR} cy={cy - 3 + look} rx="4.6" ry="6.4" fill={ink} />
          <circle cx={eyeL + 1.5} cy={cy - 6 + look} r="1.6" fill="#fff" />
          <circle cx={eyeR + 1.5} cy={cy - 6 + look} r="1.6" fill="#fff" />
        </g>
      )}
      {/* mouth */}
      {mood === "talk" ? (
        <ellipse cx={cx} cy={cy + 11} rx="5.5" ry="5" fill={ink} />
      ) : mood === "cheer" ? (
        <path d={`M${cx - 9} ${cy + 6}q9 12 18 0Z`} fill={ink} />
      ) : mood === "think" ? (
        <path d={`M${cx - 5} ${cy + 10}h10`} stroke={ink} strokeWidth="4" strokeLinecap="round" />
      ) : mood === "sleepy" ? (
        <path d={`M${cx - 4} ${cy + 10}q4-3 8 0`} stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" />
      ) : (
        <path d={`M${cx - 6} ${cy + 7}q6 6 12 0`} stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}

/** The cast. Index by number to get a stable character per item (day, badge, etc). */
export const YAPPERS: { shape: YapperShape; color: string; soft: string }[] = [
  { shape: "bubble", color: "#ff6b2c", soft: "#ffe4d6" },
  { shape: "blob", color: "#2f7bf6", soft: "#dceaff" },
  { shape: "scallop", color: "#ff5fa8", soft: "#ffe0ef" },
  { shape: "square", color: "#ffc21a", soft: "#fff4c7" },
  { shape: "bean", color: "#1fa463", soft: "#d5f3e3" },
  { shape: "blob", color: "#a98bff", soft: "#ece5ff" },
];
export const yapperAt = (i: number) => YAPPERS[((i % YAPPERS.length) + YAPPERS.length) % YAPPERS.length];

/** Yappy, our lead character: the orange speech bubble. */
export function Mascot({ mood = "happy", className, color }: { mood?: MascotMood; className?: string; color?: string }) {
  return <Yapper shape="bubble" color={color ?? "#ff6b2c"} mood={mood} className={className} label="Yappy, the Yap101 mascot" />;
}

/** A Yapper sitting in a soft tinted circle, like an avatar. */
export function YapperAvatar({ index = 0, mood, className }: { index?: number; mood?: MascotMood; className?: string }) {
  const y = yapperAt(index);
  return (
    <span className={cn("grid size-12 shrink-0 place-items-center rounded-full", className)} style={{ background: y.soft }}>
      <Yapper shape={y.shape} color={y.color} mood={mood} className="size-[72%]" />
    </span>
  );
}

/** Overlapping circle cluster of the whole cast (hero illustration). */
export function YapperCluster({ className, mood = "happy" }: { className?: string; mood?: MascotMood }) {
  return (
    <div className={cn("flex flex-col items-center", className)} aria-hidden>
      <div className="flex -space-x-4">
        {[1, 0, 2].map((i, k) => (
          <YapperAvatar key={i} index={i} mood={mood} className={cn("size-20 ring-4 ring-white sm:size-24", k === 1 && "z-10 -translate-y-2")} />
        ))}
      </div>
      <div className="-mt-5 flex -space-x-4">
        {[3, 4].map((i) => (
          <YapperAvatar key={i} index={i} mood={mood} className="size-20 ring-4 ring-white sm:size-24" />
        ))}
      </div>
    </div>
  );
}

/** Yappy with a little speech bubble, for coaching moments. */
export function MascotSays({ mood, children, className }: { mood?: MascotMood; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end gap-3", className)}>
      <Mascot mood={mood} className="animate-float size-14 shrink-0" />
      <div className="surface mb-3 rounded-2xl rounded-bl-md px-4 py-3 text-[15px] leading-snug font-medium">{children}</div>
    </div>
  );
}
