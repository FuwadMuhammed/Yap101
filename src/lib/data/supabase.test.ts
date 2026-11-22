// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { summarise } from "./types";

// A chainable stand-in for the Supabase query builder: records each select, answers in order.
const db = vi.hoisted(() => ({ selects: [] as string[], answers: [] as { data: unknown; error: unknown }[] }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const q = {
        select: (s: string) => (db.selects.push(s), q),
        order: () => q,
        is: () => q,
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(db.answers.shift()).then(ok, bad),
      };
      return q;
    },
  }),
}));
const { supabaseApi } = await import("./supabase");

const row = { id: "y1", local_date: "2026-11-20", duration_seconds: 30, media: "video", title: "Yap", deleted_at: null };
const yap = { overall: 71, groups: [], params: [], fixes: [], win: null } as unknown;

describe("supabase listYaps", () => {
  it("asks only for the summary fields and maps them", async () => {
    db.selects = [];
    db.answers = [{ data: [{ ...row, feedback: { filler_count: 2, words_per_minute: 140, score: 71, version: 2, overall: 71, parts: [], yap, confidence: { fearBefore: 6 }, pitchRange: 2.1, loudnessRange: 7 } }], error: null }];
    const [y] = await supabaseApi.listYaps({ includeDeleted: true });
    expect(db.selects).toHaveLength(1);
    expect(db.selects[0]).toContain("yap:analysis->yap");
    expect(db.selects[0]).not.toMatch(/[ (]analysis[,)]/); // never the whole report
    expect(y).toMatchObject({ id: "y1", score: 71, filler_count: 2, analysis: { version: 2, overall: 71, yap, confidence: { fearBefore: 6 }, audio: { pitchRange: 2.1, loudnessRange: 7 } } });
  });

  it("no report saved: analysis is null; an embed as a one-item list works too", async () => {
    db.answers = [{ data: [{ ...row, feedback: [{ filler_count: null, words_per_minute: null, score: null, overall: null }] }, { ...row, id: "y2", feedback: null }], error: null }];
    const list = await supabaseApi.listYaps();
    expect(list.map((y) => y.analysis)).toEqual([null, null]);
  });

  it("falls back to the full select if the slim one is rejected", async () => {
    db.selects = [];
    const full = { version: 2, overall: 64, parts: [], yap, transcript: [{ text: "um", start: 0, end: 1 }], audio: { pitchRange: 1, loudnessRange: 2, timeline: [1, 2, 3] } };
    db.answers = [{ data: null, error: { message: "bad select" } }, { data: [{ ...row, feedback: { filler_count: 0, words_per_minute: 150, score: 64, analysis: full } }], error: null }];
    const [y] = await supabaseApi.listYaps();
    expect(db.selects).toHaveLength(2);
    expect(y.analysis).toEqual({ version: 2, overall: 64, parts: [], yap, confidence: undefined, audio: { pitchRange: 1, loudnessRange: 2 } });
  });
});

describe("summarise", () => {
  it("keeps only what lists need", () => {
    expect(summarise(null)).toBeNull();
    const s = summarise({ version: 1, overall: 50, verdict: "x", parts: [], tips: [], wpm: 120, audio: null, face: null, scriptDone: null, delivery: null });
    expect(s).toEqual({ version: 1, overall: 50, parts: [], yap: undefined, confidence: undefined, audio: null });
  });
});
