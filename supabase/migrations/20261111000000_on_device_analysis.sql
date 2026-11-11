-- On-device analysis: the app measures pace, pauses, energy, eye contact and smile on the
-- phone and saves a Yap score with the yap. Transcript-based fields (filler words, AI tips)
-- are filled in later by a server route.

alter table public.feedback
  add column score smallint check (score between 0 and 100),
  add column analysis jsonb;            -- sub-scores and raw measurements, see src/lib/analysis

-- Users may save feedback for their own yaps (the on-device report).
create policy "own feedback insert" on public.feedback
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.yaps y where y.id = yap_id and y.user_id = auth.uid())
  );
