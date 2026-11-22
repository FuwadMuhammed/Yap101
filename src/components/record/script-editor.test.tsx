// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/data/types";
import { profileSig, saveSuggestion } from "@/lib/script";
import type { Prompt } from "@/lib/yap";

const h = vi.hoisted(() => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: h.toast }));

const profile: Profile = {
  display_name: "Sam",
  niche: "fitness",
  platform: "tiktok",
  confidence: 2,
  level: "beginner",
  goal: "confidence",
  track_start_date: null,
  onboarded_at: null,
  yap_time: null,
};
const getProfile = vi.hoisted(() => ({ fn: null as unknown as ReturnType<typeof import("vitest").vi.fn> }));
vi.mock("@/lib/data", async () => {
  const { vi: v } = await import("vitest");
  getProfile.fn = v.fn(async () => profile);
  return { api: { getProfile: getProfile.fn } };
});

const { ScriptEditor } = await import("./script-editor");
/** The cache signature for the test profile above (labels as the editor sends them). */
const SIG = profileSig({ name: "Sam", niche: "fitness", platform: "TikTok", goal: "Stop freezing, start talking", level: "Beginner" });

const day = (over: Partial<Prompt> = {}) =>
  ({
    id: 2,
    day_index: 2,
    title: "Why you got into fitness",
    talking_points: ["The moment it clicked", "What you love about it", "Who you want to help"],
    skill: "Talk to one friend",
    skill_tip: "Picture one friend behind the lens.",
    week: 1,
    focus: "If you stumble, smile and keep going.",
    milestone: false,
    level: "beginner",
    goal: "confidence",
    ...over,
  }) as Prompt;

const INTRO = ["Hey, I'm Sam!", "I make content about fitness."];

function open({ prompt = day(), initial = null as string[] | null, suggested = null as string[] | null } = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<ScriptEditor initial={initial} suggested={suggested} points={prompt.talking_points} prompt={prompt} seconds={30} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose, user: userEvent.setup(), box: screen.getByRole("textbox", { name: "Script" }) as HTMLTextAreaElement };
}

/** Fake /api/script. Each call gets the next reply; the bodies sent are recorded. */
function api(...replies: { status?: number; body: unknown }[]) {
  const f = vi.fn();
  for (const r of replies) f.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
  vi.stubGlobal("fetch", f);
  return { f, sent: (i = 0) => JSON.parse(f.mock.calls[i][1].body) };
}
const script = (...lines: string[]) => ({ body: { kind: "script", lines, message: "" } });

const btn = (name: RegExp | string) => screen.getByRole("button", { name });

beforeEach(() => {
  h.toast.mockClear();
  h.toast.error.mockClear();
});

describe("ScriptEditor: the topic", () => {
  it("shows today's day, topic and talking points", () => {
    open();
    expect(screen.getByText("Day 2 · today's topic")).toBeInTheDocument();
    expect(screen.getByText("Why you got into fitness")).toBeInTheDocument();
    for (const p of day().talking_points) expect(screen.getByText(p)).toBeInTheDocument();
  });

  it("starts empty with both paths offered and polish waiting for words", () => {
    open();
    expect(btn("Use our suggestion")).toBeEnabled();
    expect(btn("Polish it for me")).toBeDisabled();
    expect(btn("Save script")).toBeDisabled();
    expect(screen.getByText("Start from our suggestion, or type your own and we'll polish it.")).toBeInTheDocument();
  });
});

describe("ScriptEditor: Use our suggestion", () => {
  it("writes from today's topic, talking points and the user's profile", async () => {
    const { f, sent } = api(script("I got into fitness after a bad year.", "Now I help busy parents."));
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("I got into fitness after a bad year.\nNow I help busy parents."));
    expect(f).toHaveBeenCalledWith("/api/script", expect.objectContaining({ method: "POST" }));
    expect(sent()).toMatchObject({
      mode: "suggest",
      title: "Why you got into fitness",
      points: day().talking_points,
      skill: "Talk to one friend",
      challengeDay: 2,
      seconds: 30,
      name: "Sam",
      niche: "fitness",
      platform: "TikTok",
      level: "Beginner",
      draft: "",
      avoid: "",
    });
  });

  it("then offers another take, sending the current one to avoid, and turns polish off", async () => {
    const { sent } = api(script("First take."), script("Second take."));
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("First take."));
    expect(btn("Polish it for me")).toBeDisabled();
    expect(screen.getByText(/Make it yours/)).toBeInTheDocument();
    await user.click(btn("Try another"));
    await waitFor(() => expect(box.value).toBe("Second take."));
    expect(sent(1)).toMatchObject({ mode: "suggest", avoid: "First take." });
  });

  it("includes what they typed in 'Anything our suggestion should include?'", async () => {
    const { sent } = api(script("As a nurse…"));
    const { user, box } = open();
    await user.type(screen.getByLabelText(/Anything our suggestion should include/), "I'm a nurse{Enter}");
    await waitFor(() => expect(box.value).toBe("As a nurse…"));
    expect(sent().request).toBe("I'm a nurse");
  });

  it("is instant and free on intro days: our onboarding script, no AI call", async () => {
    const { f } = api();
    const { user, box } = open({ prompt: day({ id: 1, day_index: 1, title: "Introduce yourself" }), suggested: INTRO });
    await user.click(btn("Use our suggestion"));
    expect(box.value).toBe(INTRO.join("\n"));
    expect(f).not.toHaveBeenCalled();
  });

  it("opens intro days with the suggestion already in, ready for another take", () => {
    const { box } = open({ initial: INTRO, suggested: INTRO });
    expect(box.value).toBe(INTRO.join("\n"));
    expect(btn("Try another")).toBeEnabled();
    expect(btn("Polish it for me")).toBeDisabled();
  });

  it("reuses the suggestion saved for today instead of calling again", async () => {
    saveSuggestion(2, ["Saved earlier."], SIG);
    const { f } = api();
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    expect(box.value).toBe("Saved earlier.");
    expect(f).not.toHaveBeenCalled();
  });

  it("saves a new suggestion for next time", async () => {
    api(script("Fresh one."));
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("Fresh one."));
    expect(JSON.parse(localStorage.getItem("yap101-suggestions")!)[2]).toEqual({ sig: SIG, lines: ["Fresh one."] });
  });

  it("falls back to a talking-point starter with [blanks] when the writer is down", async () => {
    api({ status: 429, body: { error: "busy" } });
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toContain("The moment it clicked: [say it in one line]."));
    expect(box.value.split("\n")[0]).toBe("Hey, I'm Sam and I talk about fitness!");
    expect(h.toast).toHaveBeenCalledWith(expect.stringContaining("fill in the [blanks]"));
  });

  it("falls back the same way when offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toContain("[say it in one line]"));
  });

  it("shows the writer's clarifying question instead of changing the text", async () => {
    api({ body: { kind: "question", lines: [], message: "What do you post about?" } });
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await screen.findByText("What do you post about?");
    expect(box.value).toBe("");
  });

  it("replacing their own words can be undone", async () => {
    api(script("Our take."));
    const { user, box } = open();
    await user.type(box, "My own idea about lifting");
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("Our take."));
    expect(screen.getByText("Our suggestion")).toBeInTheDocument();
    await user.click(btn(/Back to your version/));
    expect(box.value).toBe("My own idea about lifting");
    expect(screen.queryByText(/Back to your version/)).not.toBeInTheDocument();
  });

  it("keeps their original draft as the undo target across several takes", async () => {
    api(script("Take one."), script("Take two."));
    const { user, box } = open();
    await user.type(box, "Mine mine mine mine");
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("Take one."));
    await user.click(btn("Try another"));
    await waitFor(() => expect(box.value).toBe("Take two."));
    await user.click(btn(/Back to your version/));
    expect(box.value).toBe("Mine mine mine mine");
  });
});

describe("ScriptEditor: reopening a saved suggestion", () => {
  it("still knows it's ours: no polish, and the next tap is another take", async () => {
    saveSuggestion(2, ["Saved earlier."], SIG);
    const { sent } = api(script("A new take."));
    const { user, box } = open({ initial: ["Saved earlier."] });
    expect(btn("Polish it for me")).toBeDisabled();
    await user.click(btn("Try another"));
    await waitFor(() => expect(box.value).toBe("A new take."));
    expect(sent().avoid).toBe("Saved earlier.");
  });

  it("calls for a fresh one instead of putting back the same text", async () => {
    saveSuggestion(2, ["Same text."], SIG);
    const { f } = api(script("Fresh."));
    // They cleared the box's AI history by editing, then typed the same thing back.
    const { user, box } = open({ initial: ["Same text?"] });
    await user.clear(box);
    await user.type(box, "Same text.");
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("Fresh."));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("ScriptEditor: Import .txt", () => {
  const file = (text: string) => new File([text], "script.txt", { type: "text/plain" });

  it("imports a file, one sentence per line, and the same file twice", async () => {
    const { user, box } = open();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, file("Hi there. I'm Sam."));
    await waitFor(() => expect(box.value).toBe("Hi there.\nI'm Sam."));
    await user.clear(box);
    await user.upload(input, file("Hi there. I'm Sam."));
    await waitFor(() => expect(box.value).toBe("Hi there.\nI'm Sam."));
  });

  it("is locked while the writer is busy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { user } = open();
    await user.click(btn("Use our suggestion"));
    expect(btn(/Import .txt/)).toBeDisabled();
  });
});

describe("ScriptEditor: Polish it for me", () => {
  it("needs a few words of their own first", async () => {
    const { user, box } = open();
    await user.type(box, "hi there");
    expect(btn("Polish it for me")).toBeDisabled();
    expect(screen.getByText("Type a few more words and we'll polish them.")).toBeInTheDocument();
    await user.type(box, " I am Sam");
    expect(btn("Polish it for me")).toBeEnabled();
  });

  it("sends their draft in polish mode and shows the polished version", async () => {
    const { sent } = api(script("Hi, I'm Sam.", "I make fitness videos for busy moms."));
    const { user, box } = open();
    await user.type(box, "um hi im sam i make like fitness videos for busy moms");
    await user.click(btn("Polish it for me"));
    await waitFor(() => expect(box.value).toBe("Hi, I'm Sam.\nI make fitness videos for busy moms."));
    expect(sent()).toMatchObject({ mode: "polish", draft: "um hi im sam i make like fitness videos for busy moms", request: "", avoid: "" });
    expect(screen.getByText("Polished version")).toBeInTheDocument();
    expect(screen.getByText("Polished. Read it out loud once, then save.")).toBeInTheDocument();
    // Polishing the polished version again would do nothing.
    expect(btn("Polish it for me")).toBeDisabled();
  });

  it("doesn't send the suggestion box text with a polish", async () => {
    const { sent } = api(script("Polished."));
    const { user, box } = open();
    await user.type(screen.getByLabelText(/Anything our suggestion should include/), "be funny");
    await user.type(box, "this is my own draft");
    await user.click(btn("Polish it for me"));
    await waitFor(() => expect(box.value).toBe("Polished."));
    expect(sent().request).toBe("");
  });

  it("can be undone back to exactly what they typed", async () => {
    api(script("Polished."));
    const { user, box } = open();
    await user.type(box, "um this is my rough draft");
    await user.click(btn("Polish it for me"));
    await waitFor(() => expect(box.value).toBe("Polished."));
    await user.click(btn(/Back to your version/));
    expect(box.value).toBe("um this is my rough draft");
    expect(btn("Polish it for me")).toBeEnabled();
  });

  it("works again once they edit the polished version", async () => {
    api(script("Polished."));
    const { user, box } = open();
    await user.type(box, "um this is my rough draft");
    await user.click(btn("Polish it for me"));
    await waitFor(() => expect(box.value).toBe("Polished."));
    await user.type(box, " And one more line here.");
    expect(btn("Polish it for me")).toBeEnabled();
    expect(screen.queryByText(/Back to your version/)).not.toBeInTheDocument();
  });

  it("becomes available after they edit our suggestion", async () => {
    const { user, box } = open({ initial: INTRO, suggested: INTRO });
    expect(btn("Polish it for me")).toBeDisabled();
    await user.type(box, " I also coach.");
    expect(btn("Polish it for me")).toBeEnabled();
  });

  it("does a quick local tidy when the writer is down", async () => {
    api({ status: 502, body: { error: "upstream" } });
    const { user, box } = open();
    await user.type(box, "um so i i make fitness videos");
    await user.click(btn("Polish it for me"));
    await waitFor(() => expect(box.value).toBe("I make fitness videos."));
    expect(h.toast).toHaveBeenCalledWith(expect.stringContaining("quick tidy"));
  });

  it("shows an error instead when the tidy would change nothing", async () => {
    api({ status: 429, body: { error: "guest_limit" } });
    const { user, box } = open();
    await user.type(box, "I make fitness videos.");
    await user.click(btn("Polish it for me"));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining("free AI scripts for guests")));
    expect(box.value).toBe("I make fitness videos.");
  });
});

describe("ScriptEditor: fixes from the QA audit", () => {
  it("BUG-04: refuses to polish a draft over the limit instead of cutting it", async () => {
    const { f } = api();
    const { box } = open();
    const long = "Sentence here. ".repeat(250); // 3,750 chars
    await userEvent.setup().click(box);
    await act(async () => {
      box.focus();
    });
    // Paste-like: set the whole value at once.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(box, { target: { value: long } });
    expect(btn("Polish it for me")).toBeDisabled();
    expect(screen.getByText(/Too long to polish \(over 3,000 characters\)/)).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("BUG-21: Cancel stops a slow request and leaves the box as it was", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((_r, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }));
    const { user, box } = open();
    await user.type(box, "my own words for today");
    await user.click(btn("Polish it for me"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(btn("Polish it for me")).toBeEnabled());
    expect(signal?.aborted).toBe(true);
    expect(box.value).toBe("my own words for today");
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("BUG-11: closing the sheet aborts the request, so a late reply is never cached", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    }));
    const { user } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(signal).toBeDefined());
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    expect(signal?.aborted).toBe(true);
    expect(localStorage.getItem("yap101-suggestions")).toBeNull();
  });

  it("BUG-12: a cached suggestion for another name is not reused", async () => {
    saveSuggestion(2, ["Hey, I'm Alex!"], "Alex|fitness|TikTok|x|Beginner");
    const { f } = api(script("Hey, I'm Sam!"));
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("Hey, I'm Sam!"));
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("BUG-15: an expired session gets a sign-in message, not a fake script", async () => {
    api({ status: 401, body: { error: "unauthorized" } });
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining("Sign in again")));
    expect(box.value).toBe("");
  });
});

describe("ScriptEditor: browser Back (BUG-28)", () => {
  it("Back closes the sheet instead of leaving the page", async () => {
    const { onClose } = open();
    expect(window.history.state?.yapSheet).toBe(true);
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closing with X removes the history entry it added", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { user } = open();
    await user.click(btn("Close without saving"));
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    await new Promise((r) => setTimeout(r, 5));
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("ScriptEditor: saving", () => {
  it("saves one teleprompter line per sentence", async () => {
    const { user, box, onSave } = open();
    await user.type(box, "Hi, I'm Sam. I lift.");
    await user.click(btn("Save script"));
    expect(onSave).toHaveBeenCalledWith(["Hi, I'm Sam.", "I lift."]);
  });

  it("locks the box and Save while writing", async () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (finish = r))));
    const { user, box } = open();
    await user.click(btn("Use our suggestion"));
    expect(await screen.findByText("Writing…")).toBeInTheDocument();
    expect(box).toHaveAttribute("readonly");
    expect(btn("Save script")).toBeDisabled();
    await act(async () => finish(new Response(JSON.stringify(script("Done.").body))));
    await waitFor(() => expect(box.value).toBe("Done."));
    expect(btn("Save script")).toBeEnabled();
  });

  it("Escape closes without saving", async () => {
    const { user, onClose, onSave } = open();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("ScriptEditor: Phase 2 P3 fixes", () => {
  it("keeps unsaved text across a reload and clears it on save (BUG-29)", async () => {
    localStorage.clear();
    const first = open();
    await first.user.type(first.box, "My own rough words for today");
    await waitFor(() => expect(localStorage.getItem("yap101-script-drafts")).toContain("rough words"), { timeout: 2000 });
    document.body.innerHTML = "";
    const again = open();
    expect(again.box.value).toBe("My own rough words for today");
    expect(screen.getByText(/We kept the text you hadn.t saved yet/)).toBeTruthy();
    await again.user.click(btn("Save script"));
    expect(again.onSave).toHaveBeenCalledWith(["My own rough words for today"]);
    expect(localStorage.getItem("yap101-script-drafts")).toBeNull();
  });

  it("can remove a saved script (BUG-31)", async () => {
    localStorage.clear();
    const { onSave, user } = open({ initial: ["A saved line."] });
    await user.click(btn(/Remove script/));
    expect(onSave).toHaveBeenCalledWith([]);
  });

  it("no Remove button when there's nothing saved", () => {
    localStorage.clear();
    open();
    expect(screen.queryByRole("button", { name: /Remove script/ })).toBeNull();
  });

  it("ignores non-string lines from the server (BUG-36)", async () => {
    localStorage.clear();
    const { user, box } = open();
    api({ body: { kind: "script", lines: [42, null, "  A real line.  ", { x: 1 }, ""], message: "" } });
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("A real line."));
  });

  it("Clear has a 44 px touch target (BUG-35)", async () => {
    localStorage.clear();
    const { user, box } = open();
    await user.type(box, "x");
    expect(btn("Clear").className).toMatch(/min-h-11/);
  });

  it("says so when the profile can't load, and still writes (BUG-33)", async () => {
    localStorage.clear();
    getProfile.fn.mockRejectedValue(new Error("db down"));
    const { user, box } = open();
    const { sent } = api(script("A generic line."));
    await user.click(btn("Use our suggestion"));
    await waitFor(() => expect(box.value).toBe("A generic line."));
    expect(sent().name).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(expect.stringMatching(/couldn't load your profile/));
    getProfile.fn.mockImplementation(async () => profile);
  });
});
