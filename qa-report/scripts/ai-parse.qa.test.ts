// Malformed / unexpected AI provider responses, through the real OpenRouter client code.
import { describe, expect, it, vi } from "vitest";
import { writeScript } from "@/lib/ai-script";
import { parseWriteRequest, type WriteRequest } from "@/lib/write-script";

const input = parseWriteRequest({ mode: "suggest", title: "Introduce yourself" }) as WriteRequest;
const replyWith = (content: string, finish = "stop") => {
  vi.stubEnv("OPENROUTER_API_KEY", "test");
  vi.stubEnv("OPENROUTER_MODEL", "m1");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }] }))));
};
const run = async (content: string, finish?: string) => {
  replyWith(content, finish);
  try {
    return await writeScript(input);
  } catch (e) {
    return { thrown: (e as Error).constructor.name };
  }
};

describe("AI responses the app must survive", () => {
  const cases: [string, string, string?][] = [
    ["M1 chatty preamble, plain text", "Sure! Here's your script:\n\nHey, I'm Sam.\nI make videos."],
    ["M2 markdown bullets and bold", "- **Hey**, I'm Sam.\n- I make videos."],
    ["M3 JSON with numbers in lines", '{"kind":"script","lines":[1, "Hi.", null, {"a":1}],"message":""}'],
    ["M4 unknown kind", '{"kind":"poem","lines":["Roses."],"message":""}'],
    ["M5 one 20,000-character line", JSON.stringify({ kind: "script", lines: ["a".repeat(20000)], message: "" })],
    ["M6 60 lines", JSON.stringify({ kind: "script", lines: Array.from({ length: 60 }, (_, i) => `Line ${i}.`), message: "" })],
    ["M7 cut off mid-JSON", '{"kind":"script","lines":["One.","Tw', "length"],
    ["M8 empty content", ""],
    ["M9 question with empty message", '{"kind":"question","lines":[],"message":""}'],
    ["M10 HTML in lines", '{"kind":"script","lines":["<img src=x onerror=alert(1)>"],"message":""}'],
    ["M11 system prompt echoed as text", "# Role\nYou are Yap101's personal script writer and speaking coach."],
  ];
  for (const [name, content, finish] of cases)
    it(name, async () => {
      const out = await run(content, finish);
      const summary = "thrown" in out ? `throws ${out.thrown}` : `${out.kind}: ${out.lines.length} lines, longest ${Math.max(0, ...out.lines.map((l) => l.length))} chars, first "${(out.lines[0] ?? out.message).slice(0, 50)}"`;
      console.log(`${name} -> ${summary}`);
      expect(out).toBeTruthy();
    });
});
