// Demo mode: no Supabase needed. On when NEXT_PUBLIC_DEMO_MODE=true, or when the
// Supabase URL is missing or still the placeholder from .env.example.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const isDemo =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !url || url.includes("your-project");
