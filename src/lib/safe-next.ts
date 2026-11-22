/**
 * A same-site path to return to, or null. Rejects "//host" and "/\\host" (browsers treat a
 * backslash like a slash, so both leave the site), control characters and bad encoding.
 */
export function safeNext(raw: string | undefined): string | null {
  if (!raw) return null;
  let next: string;
  try {
    next = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return null;
  return next;
}
