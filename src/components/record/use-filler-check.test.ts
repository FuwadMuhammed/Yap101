// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnalyseInput } from "@/lib/analysis/score";
import type { Word } from "@/lib/analysis/transcript";

const asr = vi.hoisted(() => ({ next: null as null | { resolve: (w: Word[]) => void; reject: (e: Error) => void } }));
vi.mock("@/lib/analysis/asr", () => ({
  transcribe: (_b: Blob, onProgress?: (p: { stage: "transcribing" }) => void) => {
    onProgress?.({ stage: "transcribing" });
    return new Promise<Word[]>((resolve, reject) => (asr.next = { resolve, reject }));
  },
}));
const { useFillerCheck } = await import("./use-filler-check");

const input: AnalyseInput = { audio: null, face: null, scriptDone: null, v2: { seconds: 10, targetSeconds: 30, day: 1, goal: null } };
const frames = { rms: [], times: [] };
const words = "Um so today I want to show you one thing".split(" ").map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.3 }));
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

describe("useFillerCheck", () => {
  it("re-scores the take with the words and reports the filler count", async () => {
    const onRescored = vi.fn();
    const { result } = renderHook(() => useFillerCheck(onRescored));
    act(() => result.current.start(new Blob(), input, frames));
    await flush();
    expect(result.current.status).toEqual({ stage: "transcribing" });
    await act(async () => asr.next!.resolve(words));
    await flush();
    expect(onRescored).toHaveBeenCalledTimes(1);
    expect(onRescored.mock.calls[0][0].transcript).toHaveLength(words.length);
    expect(result.current.status).toEqual({ stage: "done", fillers: 1 });
  });

  it("a retake drops a late result for the old take", async () => {
    const onRescored = vi.fn();
    const { result } = renderHook(() => useFillerCheck(onRescored));
    act(() => result.current.start(new Blob(), input, frames));
    await flush();
    act(() => result.current.cancel());
    await act(async () => asr.next!.resolve(words));
    await flush();
    expect(onRescored).not.toHaveBeenCalled();
    expect(result.current.status).toBeNull();
  });

  it("saving waits for a running check, and Skip stops the wait", async () => {
    const { result } = renderHook(() => useFillerCheck(vi.fn()));
    act(() => result.current.start(new Blob(), input, frames));
    await flush();
    let settled = false;
    act(() => void result.current.settle().then(() => (settled = true)));
    await flush();
    expect(result.current.waiting).toBe(true);
    expect(settled).toBe(false);
    act(() => result.current.skip());
    await flush();
    expect(settled).toBe(true);
    expect(result.current.waiting).toBe(false);
  });

  it("nothing running: settle resolves at once; a failure is reported, not thrown", async () => {
    const { result } = renderHook(() => useFillerCheck(vi.fn()));
    await act(() => result.current.settle());
    expect(result.current.waiting).toBe(false);
    act(() => result.current.start(new Blob(), input, frames));
    await flush();
    await act(async () => asr.next!.reject(new Error("offline")));
    await flush();
    expect(result.current.status).toEqual({ stage: "failed" });
    await act(() => result.current.settle()); // finished: no wait
  });
});
