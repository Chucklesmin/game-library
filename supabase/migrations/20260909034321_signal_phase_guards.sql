-- Keep the public room phase and protected round data in lockstep. Each RPC
-- validates the immediately preceding phase before it changes shared state.
create or replace function public.signal_start_round(p_room_id uuid, p_spectrum jsonb, p_target integer)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare r public.rooms; v_active_team text;
begin
  if p_target not between 0 and 100 then raise exception 'invalid target'; end if;
  select * into r from public.rooms where id = p_room_id and host_id = auth.uid() for update;
  if not found then raise exception 'host required'; end if;
  if r.status not in ('lobby', 'reveal') then raise exception 'round already in progress'; end if;
  v_active_team := case when r.status = 'reveal' then case when r.active_team = 'amber' then 'violet' else 'amber' end else r.active_team end;
  insert into public.rounds(room_id, keeper_id, spectrum, target) values (r.id, auth.uid(), p_spectrum, p_target);
  update public.rooms set active_team = v_active_team, status = 'clue', game_state = jsonb_build_object('phase', 'clue', 'spectrum', p_spectrum)
  where id = r.id returning * into r;
  return to_jsonb(r);
end; $$;

create or replace function public.signal_submit_clue(p_room_id uuid, p_clue text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare r public.rounds; room public.rooms;
begin
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'clue' then raise exception 'round is not ready for a clue'; end if;
  select * into r from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found or r.keeper_id <> auth.uid() then raise exception 'keeper required'; end if;
  if char_length(trim(p_clue)) not between 1 and 60 then raise exception 'invalid clue'; end if;
  update public.rounds set clue = trim(p_clue) where id = r.id;
  update public.rooms set status = 'tune', game_state = jsonb_build_object('phase', 'tune', 'clue', trim(p_clue)) where id = p_room_id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.signal_submit_tune(p_room_id uuid, p_needle integer)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room public.rooms; r public.rounds;
begin
  if p_needle not between 0 and 100 then raise exception 'invalid needle'; end if;
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'tune' then raise exception 'round is not ready to tune'; end if;
  if not exists(select 1 from public.room_players p where p.room_id = p_room_id and p.user_id = auth.uid() and p.team = room.active_team) then raise exception 'active team required'; end if;
  select * into r from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found or r.clue is null or r.needle is not null then raise exception 'round is not ready to tune'; end if;
  update public.rounds set needle = p_needle where id = r.id;
  update public.rooms set status = 'intercept', game_state = jsonb_build_object('phase', 'intercept', 'needle', p_needle) where id = p_room_id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.signal_submit_intercept(p_room_id uuid, p_intercept text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare room public.rooms; r public.rounds;
begin
  if p_intercept not in ('left', 'right') then raise exception 'invalid intercept'; end if;
  select * into room from public.rooms where id = p_room_id for update;
  if not found or room.status <> 'intercept' then raise exception 'round is not ready to intercept'; end if;
  if not exists(select 1 from public.room_players p where p.room_id = p_room_id and p.user_id = auth.uid() and p.team <> room.active_team) then raise exception 'opposing team required'; end if;
  select * into r from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found or r.needle is null or r.intercept is not null then raise exception 'round is not ready to intercept'; end if;
  update public.rounds set intercept = p_intercept where id = r.id;
  update public.rooms set status = 'intercept', game_state = jsonb_build_object('phase', 'reveal_pending', 'intercept', p_intercept) where id = p_room_id;
  return jsonb_build_object('ok', true);
end; $$;
