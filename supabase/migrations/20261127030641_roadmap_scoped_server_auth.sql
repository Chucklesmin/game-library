create table private.roadmap_server_credentials (
  singleton boolean primary key default true check (singleton),
  token_hash bytea not null check (octet_length(token_hash) = 32)
);
alter table private.roadmap_server_credentials enable row level security;
revoke all on private.roadmap_server_credentials from public, anon, authenticated, service_role;

create function private.roadmap_server_actor()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  token text := (nullif(current_setting('request.headers', true), '')::jsonb)->>'x-roadmap-server-token';
begin
  if actor is null or token is null or char_length(token) <> 64 or not exists (
    select 1 from private.roadmap_server_credentials
    where token_hash = extensions.digest(token, 'sha256')
  ) then
    raise insufficient_privilege using message = 'Roadmap server authentication required.';
  end if;
  return actor;
end;
$$;
revoke all on function private.roadmap_server_actor() from public, anon, authenticated, service_role;

create function public.roadmap_server_open(
  p_slug text, p_name text, p_max smallint, p_code text default null
)
returns jsonb language sql security definer set search_path = '' as $$
  select public.roadmap_open(p_slug, private.roadmap_server_actor(), p_name, p_max, p_code)
$$;

create function public.roadmap_server_load(p_id uuid, p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.roadmap_load(p_id, p_slug, private.roadmap_server_actor())
$$;

create function public.roadmap_server_commit(p_id uuid, p_revision integer, p_state jsonb, p_match uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select public.roadmap_commit(p_id, private.roadmap_server_actor(), p_revision, p_state, p_match)
$$;

revoke all on function public.roadmap_server_open(text,text,smallint,text),
  public.roadmap_server_load(uuid,text), public.roadmap_server_commit(uuid,integer,jsonb,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.roadmap_server_open(text,text,smallint,text),
  public.roadmap_server_load(uuid,text), public.roadmap_server_commit(uuid,integer,jsonb,uuid)
  to authenticated;
