// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/data/types";
import { saveSuggestion } from "@/lib/script";
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
vi.mock("@/lib/data", () => ({ api: { getProfile: vi.fn(async () => profile) } }));

const { ScriptEditor } = await import("./script-editor");

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
    saveSuggestion(2, ["Saved earlier."]);
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
    expect(JSON.parse(localStorage.getItem("yap101-suggestions")!)[2]).toEqual(["Fresh one."]);
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
