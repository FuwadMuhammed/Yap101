import { NextResponse, type NextRequest } from "next/server";
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
      return NextResponse.redirect(`${origin}${data?.onboarded_at ? "/home" : "/onboarding"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
