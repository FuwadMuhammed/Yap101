-- Landing-page waitlist. Anyone can join; nobody can read the list through the API.
create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text,
  created_at timestamptz not null default now()
);
create unique index waitlist_email_idx on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

create policy "anyone can join the waitlist" on public.waitlist
  for insert to anon, authenticated
  with check (true);
-- No select/update/delete policies: read the list from the Supabase dashboard.
