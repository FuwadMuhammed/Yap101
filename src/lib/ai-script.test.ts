import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiBusyError, AiKeyError, AiUnavailableError, aiProvider, clean, parseLoose, writeScript } from "./ai-script";
import { parseWriteRequest, REDIRECT_MESSAGE, type WriteRequest } from "./write-script";

const input = parseWriteRequest({ mode: "polish", title: "Introduce yourself", draft: "um hi I'm Sam and I make videos" }) as WriteRequest;

/** Fake OpenRouter: each call returns the next response in the list. */
function openRouter(...replies: { status?: number; body: unknown }[]) {
  const fetchMock = vi.fn();
  for (const r of replies) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const reply = (content: string, finish_reason = "stop") => ({ body: { choices: [{ finish_reason, message: { content } }] } });

describe("parseLoose", () => {
  it("reads plain JSON and JSON in a code fence", () => {
    expect(parseLoose('{"kind":"script","lines":["Hi."],"message":""}')).toEqual({ kind: "script", lines: ["Hi."], message: "" });
    expect(parseLoose('```json\n{"kind":"question","lines":[],"message":"About what?"}\n```')?.message).toBe("About what?");
  });

  it("salvages complete lines from cut-off JSON", () => {
    expect(parseLoose('{"kind":"script","lines":["One.","Two.","Thr')).toEqual({ kind: "script", lines: ["One.", "Two."], message: "" });
  });

  it("falls back to plain lines of text, without bullets", () => {
    expect(parseLoose("- Hey there.\n2. I'm Sam.")).toEqual({ kind: "script", lines: ["Hey there.", "I'm Sam."], message: "" });
  });

  it("returns null for nothing", () => {
    expect(parseLoose("   ")).toBeNull();
  });
});

describe("writeScript via OpenRouter", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_MODEL", "model-a,model-b");
  });

  it("picks OpenRouter when its key is set", () => {
    expect(aiProvider()).toBe("openrouter");
  });

  it("sends the polish task and returns cleaned lines", async () => {
    const f = openRouter(reply(JSON.stringify({ kind: "script", lines: ["  Hi,   I'm Sam. ", "", "I make videos."], message: "" })));
    await expect(writeScript(input)).resolves.toEqual({ kind: "script", lines: ["Hi, I'm Sam.", "I make videos."], message: "" });
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.model).toBe("model-a");
    expect(sent.messages[1].content).toContain("<task>\npolish:");
    expect(sent.messages[1].content).toContain("um hi I'm Sam and I make videos");
  });

  it("moves on to the next model when one is rate-limited", async () => {
    const f = openRouter({ status: 429, body: {} }, reply('{"kind":"script","lines":["From B."],"message":""}'));
    await expect(writeScript(input)).resolves.toMatchObject({ lines: ["From B."] });
    expect(JSON.parse(f.mock.calls[1][1].body).model).toBe("model-b");
  });

  it("reports busy when every model is rate-limited", async () => {
    openRouter({ status: 429, body: {} }, { status: 429, body: {} });
    await expect(writeScript(input)).rejects.toBeInstanceOf(AiBusyError);
  });

  it("stops at once on a bad key", async () => {
    const f = openRouter({ status: 401, body: { error: { message: "bad key" } } });
    await expect(writeScript(input)).rejects.toBeInstanceOf(AiKeyError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("replaces any redirect message with ours", async () => {
    openRouter(reply('{"kind":"redirect","lines":[],"message":"whatever"}'));
    await expect(writeScript(input)).resolves.toEqual({ kind: "redirect", lines: [], message: REDIRECT_MESSAGE });
  });

  it("passes a clarifying question through", async () => {
    openRouter(reply('{"kind":"question","lines":[],"message":"What do you make?"}'));
    await expect(writeScript(input)).resolves.toEqual({ kind: "question", lines: [], message: "What do you make?" });
  });

  it("treats empty answers as unavailable", async () => {
    openRouter(reply('{"kind":"script","lines":[],"message":""}'), reply(""));
    await expect(writeScript(input)).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("clean: what reaches the teleprompter", () => {
  const sugg: { mode: "suggest" | "polish"; draft: string; skillTip: string; focus: string } = { mode: "suggest", draft: "", skillTip: "Picture one friend behind the lens, not a crowd.", focus: "If you stumble, smile and keep going." };
  const run = (lines: unknown[], kind = "script", input = sugg) => clean({ kind: kind as "script", lines: lines as string[], message: "" }, input);

  it("BUG-07: drops a lead-in line and strips markdown", () => {
    expect(run(["Sure! Here's your script:", "- **Hey**, I'm Sam.", "## I make videos.", "1. `Short` ones."]).lines).toEqual(["Hey, I'm Sam.", "I make videos.", "Short ones."]);
  });

  it("BUG-07: a reply that echoes our brief becomes a redirect, never lines", () => {
    expect(run(["# Role", "You are Yap101's personal script writer and speaking coach."]).kind).toBe("redirect");
    expect(clean({ kind: "question", lines: [], message: "<profile> Name: Sam" }).kind).toBe("redirect");
  });

  it("BUG-14: splits a very long line instead of passing it through", () => {
    const out = run(["This is one sentence that goes on. ".repeat(20).trim()]).lines;
    expect(out.length).toBeGreaterThan(1);
    expect(Math.max(...out.map((l) => l.length))).toBeLessThanOrEqual(220);
    expect(run(["a".repeat(1000)]).lines.every((l) => l.length <= 220)).toBe(true);
  });

  it("BUG-16: drops lines that recite the coaching notes in a suggestion", () => {
    const out = run(["Hey, it's Sam.", "Picture one friend behind the lens—that's who I'm talking to.", "Fitness changed my mornings.", "If I stumble, I'll smile and keep going."]).lines;
    expect(out).toEqual(["Hey, it's Sam.", "Fitness changed my mornings."]);
  });

  it("BUG-16: keeps the user's own words in a polish even if they match a tip", () => {
    const out = run(["I picture one friend behind the lens when I film."], "script", { ...sugg, mode: "polish" }).lines;
    expect(out).toEqual(["I picture one friend behind the lens when I film."]);
  });

  it("keeps ordinary lines that share a word or two with a tip", () => {
    expect(run(["My friend got me into lifting.", "Now I go every morning."]).lines).toHaveLength(2);
  });
});
