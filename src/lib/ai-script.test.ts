import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiBusyError, AiKeyError, AiUnavailableError, aiProvider, parseLoose, writeScript } from "./ai-script";
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
