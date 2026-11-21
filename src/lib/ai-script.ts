import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { REDIRECT_MESSAGE, SCRIPT_SYSTEM, scriptUserMessage, type WriteRequest, type WriteResult } from "@/lib/write-script";

// The AI call behind "Write it for me". Two providers, picked by which key is set:
//  - OPENROUTER_API_KEY: OpenRouter's free models (OPENROUTER_MODEL to change them).
//  - ANTHROPIC_API_KEY: Claude.
// OpenRouter wins when both are set.

export class AiBusyError extends Error {}
export class AiUnavailableError extends Error {}
/** The API key is missing, wrong or revoked: retrying won't help until it's fixed. */
export class AiKeyError extends Error {}

export const aiProvider = () => (process.env.OPENROUTER_API_KEY ? "openrouter" : process.env.ANTHROPIC_API_KEY ? "anthropic" : null);

const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["script", "question", "redirect"] },
    lines: { type: "array", items: { type: "string" } },
    message: { type: "string" },
  },
  required: ["kind", "lines", "message"],
  additionalProperties: false,
} as const;

/**
 * Free models to try, in order. Picked from OpenRouter's free list in Nov 2026: Nemotron 3.5
 * Super follows the JSON format and writes clean scripts; Gemma 4 31B writes well but its free
 * pool is often rate-limited; openrouter/free picks whichever free model is up. Free models
 * come and go, so OPENROUTER_MODEL can replace this list without a code change.
 */
const DEFAULT_OPENROUTER_MODELS = ["nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free", "openrouter/free"];

export async function writeScript(input: WriteRequest): Promise<WriteResult> {
  const raw = aiProvider() === "openrouter" ? await viaOpenRouter(input) : await viaClaude(input);
  return clean(raw, input);
}

// --- Cleaning the model's reply ----------------------------------------------------------
// Free models don't always follow the format. Whatever comes back, the teleprompter should
// get only lines the user can say: no markdown, no "Here's your script:", no coaching notes
// read aloud, no wall of text on one line, and never our own instructions.

/** Phrases only our system brief contains: a reply with them is the brief leaking. */
const BRIEF_MARKERS = [/yap101's personal script writer/i, /^#+\s*(role|output|scope)\b/i, /reply in the json format/i, /<todays_prompt>|<profile>|<request>/i];
const LEAD_IN = /^(sure|certainly|of course|absolutely|okay|ok|great)\b[^.?!]*[!.:]?$|^(sure|certainly|of course|absolutely|okay|ok|great|here)\b.*\b(script|version|draft)\b.*:$|^here('s| is| are)\b|^(script|polished( version)?|title|draft)\s*:/i;
const MAX_LINE = 220;

/** Strips markdown markers from one line. */
const unmark = (l: string) =>
  l
    .replace(/^\s*(#{1,6}\s+|[-*•>]\s+|\d+[.)]\s+)/, "")
    .replace(/(\*\*|__|`)(.+?)\1/g, "$2")
    .replace(/(^|\s)[*_](\S(?:.*?\S)?)[*_](?=\s|[.,!?]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

/** Long lines are split at sentence ends, then at commas, then between words. */
function splitLong(line: string): string[] {
  if (line.length <= MAX_LINE) return [line];
  const out: string[] = [];
  for (const sentence of line.split(/(?<=[.!?])\s+/)) {
    let rest = sentence;
    while (rest.length > MAX_LINE) {
      const cut = rest.lastIndexOf(", ", MAX_LINE) > 40 ? rest.lastIndexOf(", ", MAX_LINE) + 1 : rest.lastIndexOf(" ", MAX_LINE) > 40 ? rest.lastIndexOf(" ", MAX_LINE) : MAX_LINE;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

const STOP = new Set("the a an and or but if so to of in on at for with your you i i'm i'll it its is are be not that this one".split(" "));
const contentWords = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** True when a line mostly repeats a coaching note (skill tip or goal focus) we sent. */
function echoesCoaching(line: string, notes: string[]) {
  const words = contentWords(line);
  return notes.some((note) => {
    const want = [...contentWords(note)];
    if (want.length < 3) return false;
    return want.filter((w) => words.has(w)).length / want.length >= 0.6;
  });
}

/** Tidy whatever the model sent back into a WriteResult the editor can use. */
export function clean(out: Partial<WriteResult> | null, input?: Pick<WriteRequest, "skillTip" | "focus" | "mode" | "draft">): WriteResult {
  if (!out) throw new AiUnavailableError("empty");
  if (out.kind === "redirect") return { kind: "redirect", lines: [], message: REDIRECT_MESSAGE };
  const raw = [out.message ?? "", ...(Array.isArray(out.lines) ? out.lines : [])].filter((l): l is string => typeof l === "string");
  if (raw.some((l) => BRIEF_MARKERS.some((m) => m.test(l.trim())))) return { kind: "redirect", lines: [], message: REDIRECT_MESSAGE };
  if (out.kind === "question") {
    const message = (out.message ?? "").trim().slice(0, 300);
    if (message) return { kind: "question", lines: [], message };
  }
  // Coaching notes are only stripped from suggestions: in a polish the words are the user's own.
  const notes = input && input.mode !== "polish" ? [input.skillTip, input.focus].filter(Boolean) : [];
  let lines = (Array.isArray(out.lines) ? out.lines : [])
    .filter((l): l is string => typeof l === "string")
    .map(unmark)
    .filter((l, i) => l && !(i === 0 && LEAD_IN.test(l)) && !(LEAD_IN.test(l) && l.endsWith(":")))
    .flatMap(splitLong);
  const kept = lines.filter((l) => !echoesCoaching(l, notes));
  if (kept.length >= 2) lines = kept;
  lines = lines.slice(0, 30);
  if (!lines.length) throw new AiUnavailableError("empty");
  return { kind: "script", lines, message: "" };
}

// --- OpenRouter ---------------------------------------------------------------------

type ChatResponse = {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null } }[];
  error?: { code?: number; message?: string };
};

/** Tries each model in turn, moving on when one is rate-limited, cut off or returns nothing. */
async function viaOpenRouter(input: WriteRequest): Promise<Partial<WriteResult> | null> {
  const custom = (process.env.OPENROUTER_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const models = custom.length ? custom : DEFAULT_OPENROUTER_MODELS;
  const deadline = Date.now() + 50_000;
  let busy = false;
  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    try {
      const out = await askOpenRouter(model, input, left);
      if (out) return out;
    } catch (error) {
      if (error instanceof AiKeyError) throw error;
      if (error instanceof AiBusyError) busy = true;
      else console.warn(`write-script: ${model} failed`, error instanceof Error ? error.message : error);
    }
  }
  throw busy ? new AiBusyError("every free model is rate-limited") : new AiUnavailableError("no free model answered");
}

async function askOpenRouter(model: string, input: WriteRequest, timeoutMs: number): Promise<Partial<WriteResult> | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      // Optional attribution headers OpenRouter shows on its dashboard.
      "X-Title": "Yap101",
      ...(process.env.NEXT_PUBLIC_SITE_URL ? { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${SCRIPT_SYSTEM}\n\nReply with only a JSON object with the keys "kind", "lines" and "message".` },
        { role: "user", content: scriptUserMessage(input) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "yap_script", strict: true, schema: SCHEMA } },
      // Some free models think before answering, and that counts towards this limit.
      max_tokens: 6000,
      reasoning: { effort: "low", exclude: true },
      temperature: 0.8,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => null)) as ChatResponse | null;
  if (res.status === 429 || data?.error?.code === 429) throw new AiBusyError(`${model} rate limited`);
  if (res.status === 401 || res.status === 403) throw new AiKeyError(`OpenRouter rejected the key (${res.status}): ${data?.error?.message ?? ""}`);
  if (!res.ok || data?.error) throw new AiUnavailableError(`OpenRouter ${res.status}: ${data?.error?.message ?? "no body"}`);
  const choice = data?.choices?.[0];
  const out = parseLoose(choice?.message?.content ?? "");
  // Cut off mid-reply: only keep it if whole lines could be recovered.
  if (choice?.finish_reason === "length" && !out?.lines?.length) return null;
  return out;
}

/**
 * Free models don't always honour the schema: accept JSON, JSON in a code fence, JSON that
 * was cut off (the complete lines are kept), or plain lines of text.
 */
export function parseLoose(text: string): Partial<WriteResult> | null {
  const t = text.trim();
  if (!t) return null;
  const start = t.indexOf("{");
  if (start >= 0) {
    const json = t.slice(start, t.lastIndexOf("}") + 1);
    try {
      return JSON.parse(json) as Partial<WriteResult>;
    } catch {
      // Broken or cut-off JSON: salvage the kind and every complete string in "lines".
      const kind = t.match(/"kind"\s*:\s*"(script|question|redirect)"/)?.[1] as WriteResult["kind"] | undefined;
      const message = t.match(/"message"\s*:\s*("(?:[^"\\]|\\.)*")/)?.[1];
      const list = t.match(/"lines"\s*:\s*\[([\s\S]*)/)?.[1] ?? "";
      const lines = [...list.matchAll(/"((?:[^"\\]|\\.)*)"\s*(?=[,\]])/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
      return kind || lines.length ? { kind: kind ?? "script", lines, message: message ? (JSON.parse(message) as string) : "" } : null;
    }
  }
  const lines = t
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•>]|\d+[.)])\s+/, "").replace(/^"(.*)"$/, "$1").trim())
    .filter((l) => l && !l.startsWith("```"));
  return { kind: "script", lines, message: "" };
}

// --- Claude --------------------------------------------------------------------------

const CLAUDE_OUTPUT = jsonSchemaOutputFormat(SCHEMA);

async function viaClaude(input: WriteRequest): Promise<Partial<WriteResult> | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // A short creative task: low effort keeps the wait to a few seconds.
      output_config: { effort: "low", format: CLAUDE_OUTPUT },
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SCRIPT_SYSTEM,
      messages: [{ role: "user", content: scriptUserMessage(input) }],
    });
    // Declined even after the fallback: answer like any other off-topic ask.
    if (response.stop_reason === "refusal") return { kind: "redirect" };
    return response.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new AiBusyError("rate limited");
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AiKeyError(`Claude rejected the key: ${error.message}`);
    if (error instanceof Anthropic.APIError) throw new AiUnavailableError(`Claude ${error.status}: ${error.message}`);
    throw error;
  }
}
