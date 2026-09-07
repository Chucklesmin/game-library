-- Shared room lifecycle. All game-specific moves are validated by an application adapter before persistence.
create or replace function public.create_room_for_game(p_game_slug text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_game public.games; v_room public.rooms; v_code text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then raise exception 'invalid display name'; end if;
  select * into v_game from public.games where slug=p_game_slug and is_published;
  if not found then raise exception 'game unavailable'; end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
    begin
      insert into public.rooms(code,host_id,game_id,game_version,game_state) values(v_code,v_user,v_game.id,v_game.ruleset_version,'{}') returning * into v_room;
      exit;
    exception when unique_violation then end;
  end loop;
  insert into public.room_players(room_id,user_id,display_name,team,is_keeper) values(v_room.id,v_user,trim(p_display_name),'amber',true);
  return to_jsonb(v_room);
end; $$;

create or replace function public.join_room_by_code(p_code text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_room public.rooms; v_team text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then raise exception 'invalid display name'; end if;
  select * into v_room from public.rooms where code=upper(p_code) for update;
  if not found then raise exception 'room not found'; end if;
  if exists(select 1 from public.room_players where room_id=v_room.id and user_id=v_user) then return to_jsonb(v_room); end if;
  select case when count(*) filter(where team='amber') <= count(*) filter(where team='violet') then 'amber' else 'violet' end into v_team from public.room_players where room_id=v_room.id;
  insert into public.room_players(room_id,user_id,display_name,team) values(v_room.id,v_user,trim(p_display_name),v_team);
  return to_jsonb(v_room);
end; $$;

revoke all on function public.create_room_for_game(text,text) from public;
revoke all on function public.join_room_by_code(text,text) from public;
grant execute on function public.create_room_for_game(text,text) to authenticated;
grant execute on function public.join_room_by_code(text,text) to authenticated;
