-- Wavelength is cooperative: one rotating Keeper and one shared room score.
alter table public.rooms add column if not exists group_score integer not null default 0 check (group_score >= 0);

create or replace function public.wavelength_start_round(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room public.rooms; v_previous_keeper uuid; v_keeper uuid;
begin
  select * into room from public.rooms where id = p_room_id for update;
  if not found or not public.is_room_member(p_room_id) then raise exception 'room member required'; end if;
  if room.status not in ('lobby', 'reveal') then raise exception 'round already in progress'; end if;

  select keeper_id into v_previous_keeper from public.rounds where room_id = p_room_id order by created_at desc limit 1;
  if v_previous_keeper is not null then
    select p.user_id into v_keeper from public.room_players p
    where p.room_id = p_room_id and p.joined_at > (select joined_at from public.room_players where room_id = p_room_id and user_id = v_previous_keeper)
    order by p.joined_at limit 1;
  end if;
  if v_keeper is null then
    select user_id into v_keeper from public.room_players where room_id = p_room_id order by joined_at limit 1;
  end if;
  if v_keeper is null then raise exception 'at least one player is required'; end if;

  update public.rooms set status = 'clue', game_state = jsonb_build_object('phase', 'clue', 'keeperId', v_keeper) where id = p_room_id returning * into room;
  return to_jsonb(room);
end; $$;

create or replace function public.wavelength_submit_clue(p_room_id uuid, p_spectrum jsonb, p_target integer, p_clue text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room public.rooms;
begin
  if p_target not between 0 and 100 then raise exception 'invalid target'; end if;
  if char_length(trim(p_clue)) not between 1 and 60 then raise exception 'invalid clue'; end if;
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'clue' or room.game_state ->> 'keeperId' <> auth.uid()::text then raise exception 'keeper required'; end if;
  insert into public.rounds(room_id, keeper_id, spectrum, target, clue) values (p_room_id, auth.uid(), p_spectrum, p_target, trim(p_clue));
  update public.rooms set status = 'tune', game_state = jsonb_build_object('phase', 'tune', 'clue', trim(p_clue), 'spectrum', p_spectrum, 'keeperId', auth.uid()) where id = p_room_id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.wavelength_submit_tune(p_room_id uuid, p_needle integer)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room public.rooms; round_row public.rounds;
begin
  if p_needle not between 0 and 100 then raise exception 'invalid needle'; end if;
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'tune' then raise exception 'round is not ready to tune'; end if;
  if not public.is_room_member(p_room_id) or room.game_state ->> 'keeperId' = auth.uid()::text then raise exception 'a non-keeper must lock the dial'; end if;
  select * into round_row from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found or round_row.needle is not null then raise exception 'round is not ready to tune'; end if;
  update public.rounds set needle = p_needle where id = round_row.id;
  update public.rooms set status = 'intercept', game_state = jsonb_build_object('phase', 'reveal_pending', 'needle', p_needle, 'keeperId', room.game_state ->> 'keeperId') where id = p_room_id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.wavelength_reveal_round(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room public.rooms; round_row public.rounds; distance integer; points integer;
begin
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'intercept' or room.game_state ->> 'keeperId' <> auth.uid()::text then raise exception 'keeper required to reveal'; end if;
  select * into round_row from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found or round_row.needle is null then raise exception 'round incomplete'; end if;
  distance := abs(round_row.needle - round_row.target);
  points := case when distance <= 5 then 4 when distance <= 12 then 3 when distance <= 20 then 2 else 0 end;
  update public.rounds set active_score = points, intercept_score = 0 where id = round_row.id;
  update public.rooms set group_score = group_score + points, status = 'reveal', game_state = jsonb_build_object('phase', 'reveal', 'target', round_row.target, 'needle', round_row.needle, 'points', points, 'keeperId', round_row.keeper_id) where id = p_room_id returning * into room;
  return to_jsonb(room);
end; $$;

revoke all on function public.wavelength_start_round(uuid), public.wavelength_submit_clue(uuid,jsonb,integer,text), public.wavelength_submit_tune(uuid,integer), public.wavelength_reveal_round(uuid) from public, anon;
grant execute on function public.wavelength_start_round(uuid), public.wavelength_submit_clue(uuid,jsonb,integer,text), public.wavelength_submit_tune(uuid,integer), public.wavelength_reveal_round(uuid) to authenticated;
