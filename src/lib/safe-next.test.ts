import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext (where to go after sign-in)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/home")).toBe("/home");
    expect(safeNext(encodeURIComponent("/record?prompt=2"))).toBe("/record?prompt=2");
    expect(safeNext("/admin")).toBe("/admin");
  });
  it("rejects anything that leaves the site or is malformed", () => {
    for (const bad of [undefined, "", "home", "https://evil.example", "//evil.example", "/\\evil.example", encodeURIComponent("/\\evil.example"), "/%E0%A4%A", "/a\nb", encodeURIComponent("/x\r\nSet-Cookie: a=b")])
      expect(safeNext(bad)).toBeNull();
  });
});
