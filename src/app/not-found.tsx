import { Yapper } from "@/components/brand/mascot";
import { YapLink } from "@/components/yap/yap-button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <Yapper shape="blob" color="#2f7bf6" mood="sleepy" className="size-28" />
      <h1 className="text-4xl font-extrabold">Nothing to yap about here</h1>
      <p className="text-stone max-w-sm">This page doesn&apos;t exist, or it moved. Let&apos;s get you back to your yap.</p>
      <YapLink href="/home" size="lg" arrow>Back to today</YapLink>
    </main>
  );
}
