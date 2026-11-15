-- Deleting a yap removes the clip and its feedback, but keeps the row (marked deleted) so
-- the 3-a-day limit, streaks, XP and badges can't be gamed by recording and deleting.

alter table public.yaps add column deleted_at timestamptz;

create function public.delete_yap(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.yaps set deleted_at = now()
  where id = p_id and user_id = auth.uid() and deleted_at is null;
  delete from public.feedback where yap_id = p_id and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_yap(uuid) from public, anon;
grant execute on function public.delete_yap(uuid) to authenticated;
