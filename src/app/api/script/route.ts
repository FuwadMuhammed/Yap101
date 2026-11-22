import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { aiProvider, AiBusyError, AiKeyError, writeScript } from "@/lib/ai-script";
import { envDemo } from "@/lib/data/mode";
import { clientIp, GUEST_COOKIE_NAME, GUEST_DAILY_SCRIPTS, guestUsed, recordGuestScript } from "@/lib/guest-limit";
import { createClient } from "@/lib/supabase/server";
import { demoWrittenScript, MAX_DRAFT_CHARS, parseWriteRequest, tidyDraft, type WriteResult } from "@/lib/write-script";

/** The AI gets up to 50 s (see lib/ai-script); give the function room to answer after it. */
export const maxDuration = 60;

/** A draft written to the assistant rather than to an audience (an injection or an off-topic ask). */
const INSTRUCTION = /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|rules|prompt)\b|\b(system prompt|your (instructions|prompt|rules)|api key)\b|^\s*(write|give|generate|create|solve|translate|code|calculate|tell) me\b/i;

/** A real request is a few KB; anything far bigger is not from the editor. */
const MAX_BODY_BYTES = 32_000;

const NOTHING_TO_POLISH = "There isn't much to polish yet. Add a sentence or two about what you want to say, and try again.";

// The script editor's two AI buttons, one call each (see lib/ai-script):
//  - mode "suggest" ("Use our suggestion"): today's prompt + talking points + the user's profile
//    → a fresh script (or, rarely, one clarifying question).
//  - mode "polish" ("Polish it for me"): the user's own draft → the same words, tidied.
// Either can get a polite redirect for off-topic asks.
// API keys stay on the server. Signed-in users can use it freely; guests get a few a day.

/** Only our own pages may call this: a cross-site form or script would spend our AI quota. */
function crossSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false; // same-origin GET-less fetches and server tools send none
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function POST(request: Request) {
  if (crossSite(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "bad_request" }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* handled below */
  }
  // A draft past the limit is refused, never silently cut: cutting would lose the user's words.
  const draft = (body as { draft?: unknown } | null)?.draft;
  if (typeof draft === "string" && draft.trim().length > MAX_DRAFT_CHARS) return NextResponse.json({ error: "too_long" }, { status: 413 });
  const input = parseWriteRequest(body);
  if (!input) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const provider = aiProvider();
  // Local demo build without a key: a template script, so the button can still be tried.
  if (envDemo && !provider) {
    const lines = demoWrittenScript(input);
    if (!lines.length) return NextResponse.json({ kind: "question", lines: [], message: NOTHING_TO_POLISH } satisfies WriteResult);
    return NextResponse.json({ kind: "script", lines, message: "", demo: true } satisfies WriteResult & { demo: true });
  }
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
    // Polish never refuses the user's own words (QA BUG-37: models sometimes call a draft on
    // another subject "off-topic"). Only a draft that instructs the assistant keeps the redirect.
    if (input.mode === "polish" && result.kind === "redirect" && !INSTRUCTION.test(input.draft)) {
      const lines = tidyDraft(input.draft);
      if (lines.length) result = { kind: "script", lines, message: "" };
    }
    // Polish never asks back: their draft is the brief. Fall back to a light tidy instead.
    if (input.mode === "polish" && result.kind === "question") {
      const lines = tidyDraft(input.draft);
      result = lines.length ? { kind: "script", lines, message: "" } : { kind: "question", lines: [], message: NOTHING_TO_POLISH };
    }
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
