-- Remove the pre-cooperative overloads so clients cannot accidentally reach
-- the retired client-supplied-target path.
drop function if exists public.wavelength_start_round(uuid);
drop function if exists public.wavelength_submit_clue(uuid, jsonb, integer, text);

-- Avoid re-evaluating auth.uid() for every rounds row.
alter policy "keeper or revealed round" on public.rounds
using (
  exists (
    select 1
    from public.room_players p
    join public.rooms r on r.id = p.room_id
    where p.room_id = rounds.room_id
      and p.user_id = (select auth.uid())
      and (r.status = 'reveal' or rounds.keeper_id = (select auth.uid()))
  )
);
