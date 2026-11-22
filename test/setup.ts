import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Component tests run in jsdom; clean up rendered trees and storage between tests.
afterEach(async () => {
  if (typeof document === "undefined") return;
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  localStorage.clear();
});
