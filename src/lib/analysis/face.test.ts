import { describe, expect, it } from "vitest";
import { gazeBaseline, isLooking, type Gaze } from "./face";

const g = (side: number, down: number, up: number, yaw: number): Gaze => ({ side, down, up, yaw });

describe("gaze calibration", () => {
  it("without a calibration, uses the fixed limits", () => {
    expect(isLooking(g(0.1, 0.3, 0.1, 5))).toBe(true);
    expect(isLooking(g(0.6, 0.3, 0.1, 5))).toBe(false); // eyes to the side
    expect(isLooking(g(0.1, 0.3, 0.1, 30))).toBe(false); // head turned
  });

  it("learns the person's own look at the lens from the countdown", () => {
    const base = gazeBaseline([g(0.3, 0.55, 0.05, 8), g(0.32, 0.6, 0.04, 9), g(0.28, 0.58, 0.06, 7), g(0.31, 0.57, 0.05, 8), g(0.29, 0.56, 0.05, 10)]);
    expect(base).toEqual({ side: 0.3, down: 0.57, up: 0.05, yaw: 8 });
    // Someone whose eyes read "down 0.75" at rest: fixed limits call it away; calibrated says lens.
    const atLens = g(0.32, 0.75, 0.05, 10);
    expect(isLooking(atLens)).toBe(false);
    expect(isLooking(atLens, base)).toBe(true);
    // Clearly away, even with the calibration.
    expect(isLooking(g(0.8, 0.6, 0.05, 8), base)).toBe(false);
    expect(isLooking(g(0.3, 0.6, 0.05, 30), base)).toBe(false);
  });

  it("no baseline from too few checks, or from looking away during the countdown", () => {
    expect(gazeBaseline([g(0.1, 0.2, 0, 0), g(0.1, 0.2, 0, 0), g(0.1, 0.2, 0, 0)])).toBeNull();
    expect(gazeBaseline(Array.from({ length: 6 }, () => g(0.9, 0.2, 0, 40)))).toBeNull();
  });
});
