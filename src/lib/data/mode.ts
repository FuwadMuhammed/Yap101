// Demo mode keeps everything in the browser (localStorage + IndexedDB), no Supabase needed.
// It is on when:
//  - NEXT_PUBLIC_DEMO_MODE=true, or the Supabase URL is missing / still the placeholder, or
//  - the visitor tapped "Continue as guest", which sets the guest cookie. That works even
//    when Supabase is connected, so the full flow can be shown on the live site.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const envDemo = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !url || url.includes("your-project");
export const hasSupabase = !envDemo;

export const GUEST_COOKIE = "yap101-guest";

function guestCookieSet() {
  return typeof document !== "undefined" && document.cookie.split("; ").includes(`${GUEST_COOKIE}=1`);
}

/** Read once when the page loads. Entering or leaving guest mode does a full page load. */
export const isDemo = envDemo || guestCookieSet();

export function startGuest() {
  document.cookie = `${GUEST_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export function endGuest() {
  document.cookie = `${GUEST_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Full page load (not a client-side route change), so `isDemo` and `api` are re-read. */
export function reloadTo(path: string) {
  window.location.href = path;
}
