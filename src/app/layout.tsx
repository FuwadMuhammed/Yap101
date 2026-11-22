import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Geist_Mono } from "next/font/google";
import { DemoBanner } from "@/components/yap/demo-banner";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Display: Fraunces (a soft, slightly playful serif; variable weight). Body: DM Sans (friendly, readable).
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["SOFT", "opsz"] });
const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
// Only the recording timer uses the mono font: load it there, not on every page.
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yap101.vercel.app";
const TITLE = "Yap101: learn to yap on camera";
const DESCRIPTION = "Daily 60-second speaking practice for creators. Pick a goal, yap with a teleprompter, get a Yap score, keep your streak.";

export const metadata: Metadata = {
  // Absolute URLs for the link-preview image (opengraph-image.tsx / twitter-image.tsx).
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Yap101",
  appleWebApp: { capable: true, title: "Yap101", statusBarStyle: "default" },
  openGraph: { type: "website", siteName: "Yap101", title: TITLE, description: DESCRIPTION, url: "/", locale: "en_US" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f6f8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="bg-grid text-ink flex min-h-full flex-col">
        <DemoBanner />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
