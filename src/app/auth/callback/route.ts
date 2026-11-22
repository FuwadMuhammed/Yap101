import { NextResponse, type NextRequest } from "next/server";
import { GUEST_COOKIE } from "@/lib/data/mode";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after Google or the email link, with ?code=...
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data } = await supabase.from("profiles").select("onboarded_at").single();
      // Back to where they were heading before signing in (set by the login page), if safe.
      const next = decodeURIComponent(request.cookies.get("yap101-next")?.value ?? "");
      const target = next.startsWith("/") && !next.startsWith("//") && (data?.onboarded_at || next === "/admin") ? next : data?.onboarded_at ? "/home" : "/onboarding";
      const res = NextResponse.redirect(`${origin}${target}`);
      res.cookies.delete("yap101-next");
      // Signed in for real: leave guest mode, or the app would keep using the guest store.
      res.cookies.set(GUEST_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
