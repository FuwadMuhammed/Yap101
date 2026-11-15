import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono, Instrument_Serif } from "next/font/google";
import { DemoBanner } from "@/components/yap/demo-banner";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Display: Instrument Serif (calm, editorial headlines). Body: DM Sans (friendly, readable).
const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Yap101: learn to yap on camera",
  description: "Daily 60-second speaking practice for creators. Pick a goal, yap with a teleprompter, get feedback, keep your streak.",
  appleWebApp: { capable: true, title: "Yap101", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf7ef",
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
