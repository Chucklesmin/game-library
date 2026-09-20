-- Let every member of the active round observe provisional player positions.
-- Only non-Keepers may publish, enforced by the existing insert policy.
drop policy if exists "wavelength preview keeper" on realtime.messages;
create policy "wavelength preview room members" on realtime.messages for select to authenticated using (
  extension = 'broadcast'
  and realtime.topic() ~ '^wavelength-preview:[0-9a-f-]{36}:[0-9a-f-]{36}:[0-9a-f-]{36}$'
  and exists(
    select 1 from public.rooms r
    join public.room_players viewer on viewer.room_id = r.id
    join public.room_players target on target.room_id = r.id and target.user_id = split_part(realtime.topic(), ':', 4)::uuid
    where r.id = split_part(realtime.topic(), ':', 2)::uuid
      and viewer.user_id = (select auth.uid())
      and r.status = 'tune'
      and r.game_state ->> 'roundId' = split_part(realtime.topic(), ':', 3)
  )
);
