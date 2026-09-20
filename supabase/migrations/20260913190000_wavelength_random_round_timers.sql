-- Wavelength rounds now own their randomized target and server deadline.
-- The client may choose a randomized spectrum prompt, but it can never choose
-- the hidden target or extend a phase deadline.

create or replace function public.wavelength_start_round(p_room_id uuid, p_spectrum jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  room public.rooms;
  v_previous_keeper uuid;
  v_keeper uuid;
  v_deadline timestamptz := now() + interval '60 seconds';
begin
  if jsonb_typeof(p_spectrum) <> 'object'
    or nullif(trim(p_spectrum ->> 'left'), '') is null
    or nullif(trim(p_spectrum ->> 'right'), '') is null
    or char_length(p_spectrum ->> 'left') > 80
    or char_length(p_spectrum ->> 'right') > 80 then
    raise exception 'invalid spectrum';
  end if;

  select * into room from public.rooms where id = p_room_id for update;
  if not found or not public.is_room_member(p_room_id) then raise exception 'room member required'; end if;
  if room.status not in ('lobby', 'reveal') then raise exception 'round already in progress'; end if;

  select keeper_id into v_previous_keeper from public.rounds where room_id = p_room_id order by created_at desc limit 1;
  if v_previous_keeper is null then
    v_previous_keeper := nullif(room.game_state ->> 'keeperId', '')::uuid;
  end if;
  if v_previous_keeper is not null then
    select p.user_id into v_keeper from public.room_players p
    where p.room_id = p_room_id and p.joined_at > (select joined_at from public.room_players where room_id = p_room_id and user_id = v_previous_keeper)
    order by p.joined_at limit 1;
  end if;
  if v_keeper is null then
    select user_id into v_keeper from public.room_players where room_id = p_room_id order by joined_at limit 1;
  end if;
  if v_keeper is null then raise exception 'at least one player is required'; end if;

  -- 12..88 matches the local target range while keeping both ends playable.
  insert into public.rounds(room_id, keeper_id, spectrum, target)
  values (p_room_id, v_keeper, p_spectrum, 12 + floor(random() * 77)::integer);

  update public.rooms
  set status = 'clue',
      game_state = jsonb_build_object(
        'phase', 'clue',
        'keeperId', v_keeper,
        'spectrum', p_spectrum,
        'deadlineAt', v_deadline
      )
  where id = p_room_id
  returning * into room;
  return to_jsonb(room);
end; $$;

create or replace function public.wavelength_submit_clue(p_room_id uuid, p_clue text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  room public.rooms;
  round_row public.rounds;
  v_deadline timestamptz;
begin
  if char_length(trim(p_clue)) not between 1 and 60 then raise exception 'invalid clue'; end if;
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'clue' or room.game_state ->> 'keeperId' <> auth.uid()::text then raise exception 'keeper required'; end if;
  v_deadline := (room.game_state ->> 'deadlineAt')::timestamptz;
  select * into round_row from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found then raise exception 'round not found'; end if;
  if v_deadline <= now() then
    update public.rooms
    set status = 'reveal',
        game_state = jsonb_build_object('phase', 'timeout', 'timedOutPhase', 'clue', 'points', 0, 'keeperId', round_row.keeper_id, 'spectrum', round_row.spectrum)
    where id = p_room_id returning * into room;
    return to_jsonb(room);
  end if;

  update public.rounds set clue = trim(p_clue) where id = round_row.id;
  update public.rooms
  set status = 'tune',
      game_state = jsonb_build_object(
        'phase', 'tune',
        'clue', trim(p_clue),
        'spectrum', round_row.spectrum,
        'keeperId', round_row.keeper_id,
        'deadlineAt', now() + interval '90 seconds'
      )
  where id = p_room_id returning * into room;
  return to_jsonb(room);
end; $$;

create or replace function public.wavelength_submit_tune(p_room_id uuid, p_needle integer)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  room public.rooms;
  round_row public.rounds;
  v_deadline timestamptz;
begin
  if p_needle not between 0 and 100 then raise exception 'invalid needle'; end if;
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'tune' then raise exception 'round is not ready to tune'; end if;
  if not public.is_room_member(p_room_id) or room.game_state ->> 'keeperId' = auth.uid()::text then raise exception 'a non-keeper must lock the dial'; end if;
  v_deadline := (room.game_state ->> 'deadlineAt')::timestamptz;
  select * into round_row from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found or round_row.needle is not null then raise exception 'round is not ready to tune'; end if;
  if v_deadline <= now() then
    update public.rounds set active_score = 0 where id = round_row.id;
    update public.rooms
    set status = 'reveal',
        game_state = jsonb_build_object('phase', 'reveal', 'target', round_row.target, 'needle', null, 'points', 0, 'timedOut', true, 'keeperId', round_row.keeper_id, 'spectrum', round_row.spectrum)
    where id = p_room_id returning * into room;
    return to_jsonb(room);
  end if;

  update public.rounds set needle = p_needle where id = round_row.id;
  update public.rooms
  set status = 'intercept',
      game_state = jsonb_build_object('phase', 'reveal_pending', 'needle', p_needle, 'keeperId', round_row.keeper_id, 'spectrum', round_row.spectrum)
  where id = p_room_id returning * into room;
  return to_jsonb(room);
end; $$;

create or replace function public.wavelength_timeout_phase(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  room public.rooms;
  round_row public.rounds;
  v_deadline timestamptz;
begin
  select * into room from public.rooms where id = p_room_id for update;
  if not found or not public.is_room_member(p_room_id) then raise exception 'room member required'; end if;
  if room.status not in ('clue', 'tune') then return to_jsonb(room); end if;
  v_deadline := (room.game_state ->> 'deadlineAt')::timestamptz;
  if v_deadline > now() then raise exception 'phase has not expired'; end if;
  select * into round_row from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found then raise exception 'round not found'; end if;

  if room.status = 'clue' then
    update public.rooms
    set status = 'reveal',
        game_state = jsonb_build_object('phase', 'timeout', 'timedOutPhase', 'clue', 'points', 0, 'keeperId', round_row.keeper_id, 'spectrum', round_row.spectrum)
    where id = p_room_id returning * into room;
  else
    update public.rounds set active_score = 0 where id = round_row.id;
    update public.rooms
    set status = 'reveal',
        game_state = jsonb_build_object('phase', 'reveal', 'target', round_row.target, 'needle', null, 'points', 0, 'timedOut', true, 'keeperId', round_row.keeper_id, 'spectrum', round_row.spectrum)
    where id = p_room_id returning * into room;
  end if;
  return to_jsonb(room);
end; $$;

revoke all on function public.wavelength_start_round(uuid) from public, anon, authenticated;
revoke all on function public.wavelength_start_round(uuid,jsonb), public.wavelength_submit_clue(uuid,jsonb,integer,text), public.wavelength_submit_clue(uuid,text), public.wavelength_submit_tune(uuid,integer), public.wavelength_timeout_phase(uuid) from public, anon, authenticated;
grant execute on function public.wavelength_start_round(uuid,jsonb), public.wavelength_submit_clue(uuid,text), public.wavelength_submit_tune(uuid,integer), public.wavelength_timeout_phase(uuid) to authenticated;
