import { AppShell } from "@/components/yap/app-shell";
import { GameProvider } from "@/lib/use-game";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <GameProvider>
      <AppShell>{children}</AppShell>
    </GameProvider>
  );
}
