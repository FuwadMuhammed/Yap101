import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { NextResponse } from "next/server";
import { envDemo } from "@/lib/data/mode";
import { createClient } from "@/lib/supabase/server";
import { demoWrittenScript, parseWriteRequest, SCRIPT_SYSTEM, scriptUserMessage } from "@/lib/write-script";

// "Write it for me" in the script editor: one Claude call turns today's prompt, the user's
// onboarding answers and anything they already typed into a short teleprompter script.
// The API key stays on the server. Signed-in users only, so strangers can't spend it.

const OUTPUT = jsonSchemaOutputFormat({
  type: "object",
  properties: { lines: { type: "array", items: { type: "string" } } },
  required: ["lines"],
  additionalProperties: false,
});

export async function POST(request: Request) {
  const input = parseWriteRequest(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const key = process.env.ANTHROPIC_API_KEY;
  // Local demo build without a key: a template script, so the button can still be tried.
  if (envDemo && !key) return NextResponse.json({ lines: demoWrittenScript(input), demo: true });
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
    if (response.stop_reason === "refusal") return NextResponse.json({ error: "refused" }, { status: 422 });
    const lines = (response.parsed_output?.lines ?? []).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 20);
    if (!lines.length) return NextResponse.json({ error: "empty" }, { status: 502 });
    return NextResponse.json({ lines });
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
