-- Avoid recursive RLS evaluation between rooms and room_players by centralizing
-- the authenticated caller's membership check in a restricted helper.
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "players read room" on public.rooms;
drop policy if exists "players read roster" on public.room_players;
drop policy if exists "keeper or revealed round" on public.rounds;

create policy "players read room" on public.rooms
for select to authenticated using (public.is_room_member(id));

create policy "players read roster" on public.room_players
for select to authenticated using (public.is_room_member(room_id));

create policy "keeper or revealed round" on public.rounds
for select to authenticated using (
  public.is_room_member(room_id)
  and (keeper_id = auth.uid() or exists(select 1 from public.rooms r where r.id = rounds.room_id and r.status = 'reveal'))
);
