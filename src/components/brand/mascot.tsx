import { cn } from "@/lib/utils";

export type MascotMood = "happy" | "talk" | "cheer" | "sleepy" | "think" | "calm";
export type YapperShape = "puff" | "bubble" | "blob" | "square" | "scallop" | "bean";

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

// Yappy: a soft cloud of a speech bubble (overlapping circles with the dips between them
// filled in, tail bottom-left). Generated once with a geometry library; see the commit notes.
const PUFF = "M13.2 82.6L12.9 83.8L13.3 85.0L14.1 85.8L15.3 86.1L16.4 85.9L22.3 82.5L24.8 81.7L27.0 81.4L29.9 81.5L34.6 82.5L37.6 82.7L40.6 82.3L45.1 81.0L48.3 80.8L50.9 81.1L54.6 82.2L56.7 82.6L59.5 82.7L62.1 82.3L65.4 81.2L68.4 79.3L70.6 77.3L73.8 73.4L76.4 71.4L79.0 70.1L84.3 68.4L86.1 67.4L87.8 66.1L89.2 64.8L90.4 63.2L91.4 61.6L92.2 59.7L92.7 57.8L93.0 55.9L93.0 53.9L92.7 51.9L92.0 49.4L90.9 47.1L89.7 45.3L87.2 42.5L85.7 39.9L84.7 37.1L84.0 32.8L83.2 30.0L81.8 27.1L79.9 24.5L78.1 22.7L76.2 21.2L73.9 19.9L71.5 19.0L69.3 18.5L67.1 18.2L61.2 18.6L58.2 18.3L55.4 17.4L50.3 15.0L48.1 14.4L45.9 14.0L41.7 14.0L37.5 14.8L33.6 16.5L30.2 18.9L28.5 20.5L26.9 22.5L25.7 24.3L23.9 27.9L21.8 30.5L19.2 32.6L14.2 35.4L11.2 38.1L9.0 41.3L7.6 44.9L7.1 47.4L7.0 50.1L7.3 52.6L8.0 55.1L8.9 57.2L10.0 59.0L13.4 63.0L14.8 65.1L15.9 67.5L16.5 70.3L16.7 73.3L16.1 76.5L15.2 78.9Z";

const BODY: Record<YapperShape, { d: string; face: [number, number] }> = {
  puff: { d: PUFF, face: [52, 50] },
  bubble: { d: "M22 12h56a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16H48L30 91l3-15H22A16 16 0 0 1 6 60V28a16 16 0 0 1 16-16Z", face: [50, 42] },
  blob: { d: "M50 7c15 0 21 9 30 14s14 15 12 29-5 22-16 30-26 12-38 6S11 73 8 59s2-26 11-36S35 7 50 7Z", face: [50, 50] },
  square: { d: "M34 9h32a25 25 0 0 1 25 25v32a25 25 0 0 1-25 25H34A25 25 0 0 1 9 66V34A25 25 0 0 1 34 9Z", face: [50, 50] },
  scallop: { d: SCALLOP, face: [50, 50] },
  bean: { d: "M50 6c19 0 32 14 32 34v20c0 20-13 34-32 34S18 80 18 60V40C18 20 31 6 50 6Z", face: [50, 48] },
};

/** One member of the Yapper family: a flat, colourful character with a simple face. */
export function Yapper({
  shape = "bubble",
  color = "#f08a5d",
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
  const ink = "#15171c";
  const { d, face } = BODY[shape];
  const [cx, cy] = face;
  const eyeL = cx - 11;
  const eyeR = cx + 11;
  const look = mood === "think" ? -3 : 0;
  // "calm" is the logo face: two tall eyes, nothing else.
  const calm = mood === "calm";
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
          <ellipse cx={eyeL} cy={cy - 3 + look} rx={calm ? 5.2 : 4.6} ry={calm ? 8 : 6.4} fill={ink} />
          <ellipse cx={eyeR} cy={cy - 3 + look} rx={calm ? 5.2 : 4.6} ry={calm ? 8 : 6.4} fill={ink} />
          {!calm && <circle cx={eyeL + 1.5} cy={cy - 6 + look} r="1.6" fill="#fff" />}
          {!calm && <circle cx={eyeR + 1.5} cy={cy - 6 + look} r="1.6" fill="#fff" />}
        </g>
      )}
      {/* mouth */}
      {calm ? null : mood === "talk" ? (
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
  { shape: "puff", color: "#6fb3ec", soft: "#e4f2fd" },
  { shape: "blob", color: "#6fb3ec", soft: "#dceaff" },
  { shape: "scallop", color: "#ee8fb4", soft: "#ffe0ef" },
  { shape: "square", color: "#f5b740", soft: "#fff4c7" },
  { shape: "bean", color: "#74c08d", soft: "#d5f3e3" },
  { shape: "blob", color: "#a993f2", soft: "#ece5ff" },
];
export const yapperAt = (i: number) => YAPPERS[((i % YAPPERS.length) + YAPPERS.length) % YAPPERS.length];

/** The brand blue Yappy is drawn in. */
export const YAPPY_BLUE = "#6fb3ec";

/** Yappy, our lead character: a soft blue cloud of a speech bubble. */
export function Mascot({ mood = "happy", className, color }: { mood?: MascotMood; className?: string; color?: string }) {
  return <Yapper shape="puff" color={color ?? YAPPY_BLUE} mood={mood} className={className} label="Yappy, the Yap101 mascot" />;
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

/** Hero illustration: one big Yappy on a soft blue disc. (Replaces the old five-character cluster.) */
export function YapperCluster({ className, mood = "happy" }: { className?: string; mood?: MascotMood }) {
  return (
    <div className={cn("flex flex-col items-center", className)} aria-hidden>
      <span className="bg-sky-soft grid size-36 place-items-center rounded-full sm:size-40">
        <Yapper shape="puff" color={YAPPY_BLUE} mood={mood} className="animate-float size-[74%]" />
      </span>
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
