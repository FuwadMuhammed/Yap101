import { ImageResponse } from "next/og";
import { PUFF } from "@/components/brand/mascot";

// The link preview for WhatsApp, Instagram DMs, X, LinkedIn, iMessage, Slack...
// Generated once at build time (no request data), so it's fast and cached.
export const alt = "Yap101: get confident on camera in 30 days. Daily 60-second speaking practice for creators.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#15171c";
const BLUE = "#6fb3ec";
const STONE = "#5d6470";

function Yappy({ px, body, eyes = INK }: { px: number; body: string; eyes?: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 100 100">
      <path d={PUFF} fill={body} />
      <ellipse cx="41" cy="47" rx="5.2" ry="8" fill={eyes} />
      <ellipse cx="63" cy="47" rx="5.2" ry="8" fill={eyes} />
    </svg>
  );
}

function Chip({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: bg, borderRadius: 999, padding: "14px 26px", fontSize: 28, fontWeight: 700, color: INK }}>
      {children}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f4f6f8", padding: 64, fontFamily: "sans-serif" }}>
        {/* Left: the pitch */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Yappy px={64} body={BLUE} />
            <div style={{ fontSize: 44, fontWeight: 800, color: INK, letterSpacing: -1 }}>yap101</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 800, color: INK, lineHeight: 1.02, letterSpacing: -2 }}>Get confident on camera in 30 days.</div>
            <div style={{ fontSize: 32, color: STONE, marginTop: 24, lineHeight: 1.3 }}>One 60-second speaking challenge a day, a teleprompter, and a Yap score.</div>
          </div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: INK }}>yap101.vercel.app</div>
        </div>

        {/* Right: Yappy on a blue tile, with a couple of the app's chips */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 380, height: 380, borderRadius: 96, background: BLUE }}>
            <Yappy px={300} body="#ffffff" />
          </div>
          <div style={{ display: "flex", position: "absolute", top: 40, left: 0 }}>
            <Chip bg="#fbc95e">7-day streak</Chip>
          </div>
          <div style={{ display: "flex", position: "absolute", bottom: 48, right: 0 }}>
            <Chip bg="#ffffff">Yap score 82</Chip>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
