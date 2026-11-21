import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { NextResponse } from "next/server";
import { envDemo } from "@/lib/data/mode";
import { createClient } from "@/lib/supabase/server";
import { demoWrittenScript, parseWriteRequest, REDIRECT_MESSAGE, SCRIPT_SYSTEM, scriptUserMessage, type WriteResult } from "@/lib/write-script";

// "Write it for me" in the script editor: one Claude call turns today's prompt, the user's
// profile, their request and anything they already typed into a short teleprompter script
// (or one clarifying question, or a polite redirect for off-topic asks).
// The API key stays on the server. Signed-in users only, so strangers can't spend it.

const OUTPUT = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    kind: { type: "string", enum: ["script", "question", "redirect"] },
    lines: { type: "array", items: { type: "string" } },
    message: { type: "string" },
  },
  required: ["kind", "lines", "message"],
  additionalProperties: false,
});

export async function POST(request: Request) {
  const input = parseWriteRequest(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const key = process.env.ANTHROPIC_API_KEY;
  // Local demo build without a key: a template script, so the button can still be tried.
  if (envDemo && !key) return NextResponse.json({ kind: "script", lines: demoWrittenScript(input), message: "", demo: true } satisfies WriteResult & { demo: true });
  if (!key) return NextResponse.json({ error: "setup" }, { status: 503 });

  if (!envDemo) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });
  }

  const client = new Anthropic({ apiKey: key, timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // A short creative task: low effort keeps the wait to a few seconds.
      output_config: { effort: "low", format: OUTPUT },
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SCRIPT_SYSTEM,
      messages: [{ role: "user", content: scriptUserMessage(input) }],
    });
    // Declined even after the fallback: answer like any other off-topic ask.
    if (response.stop_reason === "refusal") return NextResponse.json({ kind: "redirect", lines: [], message: REDIRECT_MESSAGE } satisfies WriteResult);
    const out = response.parsed_output;
    if (!out) return NextResponse.json({ error: "empty" }, { status: 502 });
    if (out.kind === "redirect") return NextResponse.json({ kind: "redirect", lines: [], message: REDIRECT_MESSAGE } satisfies WriteResult);
    if (out.kind === "question") {
      const message = out.message.trim().slice(0, 300);
      if (!message) return NextResponse.json({ error: "empty" }, { status: 502 });
      return NextResponse.json({ kind: "question", lines: [], message } satisfies WriteResult);
    }
    const lines = out.lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 20);
    if (!lines.length) return NextResponse.json({ error: "empty" }, { status: 502 });
    return NextResponse.json({ kind: "script", lines, message: "" } satisfies WriteResult);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "busy" }, { status: 429 });
    if (error instanceof Anthropic.APIError) {
      console.error("write-script: Claude API error", error.status, error.message);
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    console.error("write-script: failed", error);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
