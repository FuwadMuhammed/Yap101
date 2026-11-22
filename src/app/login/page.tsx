"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { YapperCluster } from "@/components/brand/mascot";
import { YapButton } from "@/components/yap/yap-button";
import { demoApi, demoSignIn } from "@/lib/data/demo";
import { endGuest, hasSupabase, reloadTo, startGuest } from "@/lib/data/mode";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  // The auth callback sends people back here with ?error=auth when a link has expired or was used.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "auth")
      toast.error("That sign-in link didn't work. It may have expired, so ask for a new one.");
  }, []);
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-4 pb-8">
      <Link href="/" className="surface grid size-11 place-items-center rounded-full" aria-label="Back">
        <ChevronLeft className="size-5" />
      </Link>
      <div className="flex flex-1 flex-col justify-center gap-8 py-8">
        <div className="text-center">
          <YapperCluster className="animate-pop mb-8" />
          <h1 className="text-[36px] leading-tight">Let&apos;s get yapping</h1>
          <p className="text-stone mt-2 text-lg">Sign in to start your 30-day track.</p>
        </div>
        <div className="flex flex-col gap-3">
          {hasSupabase && (
            <>
              <SupabaseLogin />
              <div className="text-stone my-1 flex items-center gap-3 text-sm"><span className="bg-line h-px flex-1" />or<span className="bg-line h-px flex-1" /></div>
            </>
          )}
          <GuestLogin primary={!hasSupabase} />
        </div>
      </div>
    </div>
  );
}

function GuestLogin({ primary }: { primary: boolean }) {
  async function enter() {
    startGuest();
    demoSignIn();
    const p = await demoApi.getProfile();
    // Full page load so the app switches to the in-browser (guest) data store.
    reloadTo(p?.onboarded_at ? "/home" : "/onboarding");
  }
  return (
    <div className="flex flex-col gap-3">
      <YapButton size="xl" block arrow={primary} variant={primary ? "primary" : "mist"} onClick={enter}>Continue as guest</YapButton>
      <p className="text-stone text-center text-sm">No account needed. Your yaps stay in this browser.</p>
    </div>
  );
}

// Google sign-in needs the provider switched on in Supabase (Auth > Providers > Google).
// Until then the button would lead to an error page, so it only shows when this is "true".
const GOOGLE_ON = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";

function SupabaseLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const redirectTo = () => {
    // Signing in for real ends guest mode (see also the auth callback and the proxy).
    endGuest();
    // Remember where they were heading (e.g. /admin) for after the email link / Google.
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) document.cookie = `yap101-next=${encodeURIComponent(next)}; path=/; max-age=1800; samesite=lax`;
    return `${window.location.origin}/auth/callback`;
  };

  async function google() {
    const { error } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) toast.error(error.message);
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    if (error) toast.error(error.message);
    else setSent(true);
  }

  if (sent)
    return (
      <div className="bg-mint text-ink rounded-[28px] p-6 text-center">
        <p className="font-display text-[26px]">Check your inbox</p>
        <p className="text-ink/75 mt-1">We sent a sign-in link to {email}.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {GOOGLE_ON && (
        <>
          <YapButton variant="soft" size="xl" block onClick={google}>
            <svg viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" /></svg>
            Continue with Google
          </YapButton>
          <div className="text-stone my-1 flex items-center gap-3 text-sm"><span className="bg-line h-px flex-1" />or<span className="bg-line h-px flex-1" /></div>
        </>
      )}
      <form onSubmit={magicLink} className="flex flex-col gap-3">
        <input
          type="email"
          required
          aria-label="Email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="surface focus:border-ink h-16 rounded-full px-6 text-base outline-none"
        />
        <YapButton type="submit" size="xl" block arrow>Email me a link</YapButton>
      </form>
    </div>
  );
}
