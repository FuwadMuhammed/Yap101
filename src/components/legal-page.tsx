import { Logo } from "@/components/brand/logo";
import { YapLink } from "@/components/yap/yap-button";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6">
      <div className="flex items-center justify-between">
        <Logo />
        <YapLink href="/" variant="soft" size="sm">Home</YapLink>
      </div>
      <p className="bg-sun-soft mt-8 rounded-[20px] px-4 py-3 text-sm font-semibold">Draft: needs legal review before launch.</p>
      <h1 className="mt-6 text-4xl font-extrabold">{title}</h1>
      <p className="text-stone mt-1 text-sm">Last updated {updated}</p>
      <div className="surface mt-6 rounded-[28px] p-6 leading-relaxed [&_h2]:font-display [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2:first-child]:mt-0 [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
