-- The browser can subscribe to member-only revisions. The private match state
-- and all writes are reserved for the application server.
create schema if not exists private;

create table private.roadmap_matches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9A-F]{6}$'),
  slug text not null,
  host_id uuid not null,
  max_players smallint not null check (max_players between 2 and 12),
  players jsonb not null,
  state jsonb,
  match_id uuid,
  revision integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.roadmap_room_updates (
  id uuid primary key references private.roadmap_matches(id) on delete cascade,
  revision integer not null default 0
);

alter table private.roadmap_matches enable row level security;
alter table public.roadmap_room_updates enable row level security;
revoke all on private.roadmap_matches from public, anon, authenticated, service_role;
revoke all on public.roadmap_room_updates from public, anon, authenticated, service_role;
grant select on public.roadmap_room_updates to authenticated;

create function private.roadmap_is_member(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.roadmap_matches
    where id = p_id and players @> jsonb_build_array(jsonb_build_object('id', auth.uid()))
  )
$$;

revoke all on function private.roadmap_is_member(uuid) from public, anon, authenticated;
grant execute on function private.roadmap_is_member(uuid) to authenticated;
create policy roadmap_member_updates on public.roadmap_room_updates for select
  to authenticated using (private.roadmap_is_member(id));

alter publication supabase_realtime add table public.roadmap_room_updates;

create function public.roadmap_open(
  p_slug text, p_actor uuid, p_name text, p_max smallint, p_code text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room private.roadmap_matches;
  v_player jsonb := jsonb_build_object('id', p_actor, 'name', btrim(p_name));
  v_code text;
begin
  if p_actor is null or p_name is null or char_length(btrim(p_name)) not between 1 and 24
    or p_slug is null or p_max is null then
    raise exception 'Choose a display name of 1–24 characters.';
  end if;

  if p_code is not null then
    select * into v_room from private.roadmap_matches
      where code = p_code and slug = p_slug for update;
    if not found then raise exception 'Room not found for this game.'; end if;
    if v_room.players @> jsonb_build_array(jsonb_build_object('id', p_actor)) then
      return to_jsonb(v_room);
    end if;
    if v_room.state is not null then raise exception 'This match has already started.'; end if;
    if jsonb_array_length(v_room.players) >= v_room.max_players then raise exception 'This room is full.'; end if;
    update private.roadmap_matches set
      players = players || jsonb_build_array(v_player), revision = revision + 1
      where id = v_room.id returning * into v_room;
    update public.roadmap_room_updates set revision = v_room.revision where id = v_room.id;
  else
    loop
      v_code := upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 6));
      insert into private.roadmap_matches(code, slug, host_id, max_players, players)
        values(v_code, p_slug, p_actor, p_max, jsonb_build_array(v_player))
        on conflict (code) do nothing returning * into v_room;
      exit when found;
    end loop;
    insert into public.roadmap_room_updates(id) values(v_room.id);
  end if;
  return to_jsonb(v_room);
end;
$$;

create function public.roadmap_load(p_id uuid, p_slug text, p_actor uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(room) from private.roadmap_matches room
  where room.id = p_id and room.slug = p_slug
    and room.players @> jsonb_build_array(jsonb_build_object('id', p_actor))
$$;

create function public.roadmap_commit(
  p_id uuid, p_actor uuid, p_revision integer, p_state jsonb, p_match uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room private.roadmap_matches;
begin
  update private.roadmap_matches set state = p_state, match_id = p_match, revision = revision + 1
    where id = p_id and revision = p_revision
      and players @> jsonb_build_array(jsonb_build_object('id', p_actor))
    returning * into v_room;
  if not found then return null; end if;
  update public.roadmap_room_updates set revision = v_room.revision where id = v_room.id;
  return to_jsonb(v_room);
end;
$$;

revoke all on function public.roadmap_open(text,uuid,text,smallint,text),
  public.roadmap_load(uuid,text,uuid), public.roadmap_commit(uuid,uuid,integer,jsonb,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.roadmap_open(text,uuid,text,smallint,text),
  public.roadmap_load(uuid,text,uuid), public.roadmap_commit(uuid,uuid,integer,jsonb,uuid)
  to service_role;


alter table private.roadmap_matches
  add column expires_at timestamptz not null default (now() + interval '24 hours');
create index roadmap_expiring_rooms on private.roadmap_matches(expires_at);

create function private.roadmap_extend_lifetime()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.expires_at := now() + interval '24 hours';
  return new;
end;
$$;

revoke all on function private.roadmap_extend_lifetime() from public, anon, authenticated;
create trigger roadmap_room_activity before update on private.roadmap_matches
  for each row execute function private.roadmap_extend_lifetime();

select cron.schedule(
  'roadmap-expired-rooms', '17 * * * *',
  $$delete from private.roadmap_matches where expires_at < now()$$
);
