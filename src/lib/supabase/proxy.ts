import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { GUEST_COOKIE, envDemo } from "@/lib/data/mode";

const PUBLIC_PATHS = ["/", "/login", "/auth", "/privacy", "/terms"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

// Refreshes the Supabase session cookie and sends signed-out users to /login.
// This is an optimistic check only; RLS in the database is the real guard.
export async function updateSession(request: NextRequest) {
  // Demo mode keeps everything in the browser, so screens check sign-in themselves.
  // Guests (the "Continue as guest" cookie) also keep their data in the browser.
  if (envDemo || request.cookies.get(GUEST_COOKIE)?.value === "1") return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  if (!signedIn && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
