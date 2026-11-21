import { NextResponse } from "next/server";
import { aiProvider, AiBusyError, writeScript } from "@/lib/ai-script";
import { envDemo } from "@/lib/data/mode";
import { createClient } from "@/lib/supabase/server";
import { demoWrittenScript, parseWriteRequest, type WriteResult } from "@/lib/write-script";

// "Write it for me" in the script editor: one AI call turns today's prompt, the user's
// profile, their request and anything they already typed into a short teleprompter script
// (or one clarifying question, or a polite redirect for off-topic asks). See lib/ai-script.
// API keys stay on the server. Signed-in users only, so strangers can't spend them.

export async function POST(request: Request) {
  const input = parseWriteRequest(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const provider = aiProvider();
  // Local demo build without a key: a template script, so the button can still be tried.
  if (envDemo && !provider) return NextResponse.json({ kind: "script", lines: demoWrittenScript(input), message: "", demo: true } satisfies WriteResult & { demo: true });
  if (!provider) return NextResponse.json({ error: "setup" }, { status: 503 });

  if (!envDemo) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  }

  try {
    return NextResponse.json(await writeScript(input));
  } catch (error) {
    if (error instanceof AiBusyError) return NextResponse.json({ error: "busy" }, { status: 429 });
    console.error(`write-script (${provider}) failed:`, error);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
