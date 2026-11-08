-- Yap101 Phase 1 schema: profiles, 30-day prompt tracks, yaps, AI feedback.
-- Every user table has row-level security; users only see their own rows.

create type yap_level as enum ('beginner', 'intermediate', 'pro');
create type yap_goal as enum ('confidence', 'storytelling', 'clarity', 'on_camera', 'hooks');
create type yap_media as enum ('video', 'audio');

-- One row per user, filled by onboarding.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  niche text,
  platform text,              -- e.g. 'tiktok', 'instagram', 'youtube', 'linkedin'
  confidence smallint check (confidence between 1 and 5),
  level yap_level,
  goal yap_goal,
  track_start_date date,      -- day 1 of the user's 30-day track
  yap_time text check (yap_time in ('morning', 'midday', 'evening')),  -- for reminders
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Hand-written prompts, tagged so each level + goal gets its own 30-day track.
create table public.prompts (
  id bigint generated always as identity primary key,
  level yap_level not null,
  goal yap_goal not null,
  day_index smallint not null check (day_index between 1 and 30),
  title text not null,                          -- may contain {niche}, filled in by the app
  talking_points text[] not null default '{}',  -- 3–5 bullets for the teleprompter
  skill text not null,                          -- the micro-skill taught that day
  skill_tip text not null,
  week smallint not null check (week between 1 and 5),
  focus text not null,                          -- goal-specific reminder
  milestone boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index prompts_track_idx on public.prompts (level, goal, day_index) where active;

-- A single recording.
create table public.yaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_id bigint references public.prompts (id) on delete set null,
  title text not null,                      -- the personalised prompt title at the time
  media yap_media not null,
  storage_path text not null,               -- path in the private 'yaps' bucket
  duration_seconds numeric(5, 1) check (duration_seconds <= 60),
  created_at timestamptz not null default now(),
  local_date date not null                  -- the user's calendar day, for streaks and the 3-a-day limit
);
create index yaps_user_date_idx on public.yaps (user_id, local_date desc);

-- AI feedback for a yap (speech-to-text + one LLM call).
create table public.feedback (
  yap_id uuid primary key references public.yaps (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  transcript text,
  words_per_minute numeric(5, 1),
  filler_count integer,
  filler_words jsonb,                       -- e.g. {"um": 4, "like": 2}
  tips text[],
  created_at timestamptz not null default now()
);

-- Row-level security
alter table public.profiles enable row level security;
alter table public.prompts enable row level security;
alter table public.yaps enable row level security;
alter table public.feedback enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "signed-in users read active prompts" on public.prompts
  for select to authenticated using (active);

create policy "own yaps read" on public.yaps
  for select using (auth.uid() = user_id);
create policy "own yaps delete" on public.yaps
  for delete using (auth.uid() = user_id);
-- Inserts go through insert_yap() so the daily limit can't be bypassed.

create policy "own feedback read" on public.feedback
  for select using (auth.uid() = user_id);
-- Feedback is written by the server with the service role.

-- Create a profile row when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Insert a yap, enforcing the free limit of 3 per day.
create function public.insert_yap(
  p_prompt_id bigint,
  p_title text,
  p_media yap_media,
  p_storage_path text,
  p_duration_seconds numeric,
  p_local_date date
) returns public.yaps
language plpgsql security definer set search_path = '' as $$
declare
  result public.yaps;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if (select count(*) from public.yaps where user_id = auth.uid() and local_date = p_local_date) >= 3 then
    raise exception 'daily limit reached' using errcode = 'P0001';
  end if;
  insert into public.yaps (user_id, prompt_id, title, media, storage_path, duration_seconds, local_date)
  values (auth.uid(), p_prompt_id, left(p_title, 200), p_media, p_storage_path, p_duration_seconds, p_local_date)
  returning * into result;
  return result;
end;
$$;

-- Current streak: consecutive days with at least one yap, ending today or yesterday.
create function public.current_streak(p_today date) returns integer
language sql stable security invoker set search_path = '' as $$
  with days as (
    select distinct local_date from public.yaps where user_id = auth.uid()
  ), numbered as (
    select local_date, local_date + (row_number() over (order by local_date desc))::int as grp
    from days
  ), runs as (
    select min(local_date) as first_day, max(local_date) as last_day, count(*) as len
    from numbered group by grp
  )
  select coalesce((select len::int from runs where last_day >= p_today - 1 order by last_day desc limit 1), 0);
$$;

-- Private storage bucket: files live under <user_id>/<yap_id>.<ext>
insert into storage.buckets (id, name, public) values ('yaps', 'yaps', false)
  on conflict (id) do nothing;

create policy "own yap files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'yaps' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own yap files upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'yaps' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own yap files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'yaps' and (storage.foldername(name))[1] = auth.uid()::text);
