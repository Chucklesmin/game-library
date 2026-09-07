create or replace function public.create_room_for_game(p_game_slug text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_user uuid := auth.uid(); v_game public.games; v_room public.rooms; v_code text;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then raise exception 'invalid display name'; end if;
  select * into v_game from public.games where slug=p_game_slug and is_published;
  if not found then raise exception 'game unavailable'; end if;
  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
    begin insert into public.rooms(code,host_id,game_id,game_version,game_state) values(v_code,v_user,v_game.id,v_game.ruleset_version,'{}') returning * into v_room; exit; exception when unique_violation then end;
  end loop;
  insert into public.room_players(room_id,user_id,display_name,team,is_keeper) values(v_room.id,v_user,trim(p_display_name),'amber',true);
  return to_jsonb(v_room);
end; $$;
