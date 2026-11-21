import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { aiProvider, AiBusyError, AiKeyError, writeScript } from "@/lib/ai-script";
import { envDemo } from "@/lib/data/mode";
import { clientIp, GUEST_COOKIE_NAME, GUEST_DAILY_SCRIPTS, guestUsed, recordGuestScript } from "@/lib/guest-limit";
import { createClient } from "@/lib/supabase/server";
import { demoWrittenScript, parseWriteRequest, tidyDraft, type WriteResult } from "@/lib/write-script";

// The script editor's two AI buttons, one call each (see lib/ai-script):
//  - mode "suggest" ("Use our suggestion"): today's prompt + talking points + the user's profile
//    → a fresh script (or, rarely, one clarifying question).
//  - mode "polish" ("Polish it for me"): the user's own draft → the same words, tidied.
// Either can get a polite redirect for off-topic asks.
// API keys stay on the server. Signed-in users can use it freely; guests get a few a day.

export async function POST(request: Request) {
  const input = parseWriteRequest(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const provider = aiProvider();
  // Local demo build without a key: a template script, so the button can still be tried.
  if (envDemo && !provider) return NextResponse.json({ kind: "script", lines: demoWrittenScript(input), message: "", demo: true } satisfies WriteResult & { demo: true });
  if (!provider) return NextResponse.json({ error: "setup" }, { status: 503 });

  // Anyone not signed in (guests, and every visitor of a demo build) is a guest.
  let guest = true;
  if (!envDemo) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    guest = !user;
  }
  const jar = await cookies();
  const ip = clientIp(request);
  const used = guest ? guestUsed(ip, jar.get(GUEST_COOKIE_NAME)?.value) : 0;
  if (guest && used >= GUEST_DAILY_SCRIPTS) return NextResponse.json({ error: "guest_limit" }, { status: 429 });

  try {
    let result = await writeScript(input);
    // Polish never asks back: their draft is the brief. Fall back to a light tidy instead.
    if (input.mode === "polish" && result.kind === "question") result = { kind: "script", lines: tidyDraft(input.draft), message: "" };
    const res = NextResponse.json(result);
    // Only finished scripts count towards a guest's allowance, not questions or redirects.
    if (guest && result.kind === "script") {
      res.cookies.set(GUEST_COOKIE_NAME, recordGuestScript(ip, used), { httpOnly: true, sameSite: "lax", secure: true, path: "/api/script", maxAge: 60 * 60 * 24 });
    }
    return res;
  } catch (error) {
    if (error instanceof AiBusyError) return NextResponse.json({ error: "busy" }, { status: 429 });
    if (error instanceof AiKeyError) {
      console.error(`write-script: ${error.message}. Check the API key in the server's environment variables.`);
      return NextResponse.json({ error: "setup" }, { status: 503 });
    }
    console.error(`write-script (${provider}) failed:`, error);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
