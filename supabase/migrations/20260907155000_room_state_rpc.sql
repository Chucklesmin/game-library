create or replace function public.update_room_state(p_room_id uuid, p_status text, p_game_state jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid(); v_room public.rooms;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_status not in ('lobby','clue','tune','intercept','reveal','complete') then raise exception 'invalid room status'; end if;
  update public.rooms set status=p_status, game_state=coalesce(p_game_state,'{}'::jsonb)
  where id=p_room_id and host_id=v_user returning * into v_room;
  if not found then raise exception 'only the room host can update game state'; end if;
  return to_jsonb(v_room);
end; $$;
revoke all on function public.update_room_state(uuid,text,jsonb) from public;
grant execute on function public.update_room_state(uuid,text,jsonb) to authenticated;
