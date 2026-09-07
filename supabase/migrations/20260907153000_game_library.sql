-- Generic library: each game owns its ruleset, packs, and opaque per-room state.
create table public.games(
  id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9-]+$'),
  name text not null, summary text not null default '', ruleset_version integer not null default 1 check(ruleset_version > 0),
  game_type text not null, is_published boolean not null default false, config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.game_packs(
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
  slug text not null, name text not null, description text not null default '', is_published boolean not null default false,
  sort_order integer not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique(game_id, slug)
);
create table public.game_content(
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
  pack_id uuid references public.game_packs(id) on delete set null, content_type text not null, payload jsonb not null,
  sort_order integer not null default 0, is_published boolean not null default false, created_at timestamptz not null default now()
);
alter table public.rooms add column game_id uuid references public.games(id) on delete restrict;
alter table public.rooms add column game_version integer not null default 1 check(game_version > 0);
alter table public.rooms add column game_state jsonb not null default '{}'::jsonb;
create index game_packs_game_id_idx on public.game_packs(game_id);
create index game_content_game_id_idx on public.game_content(game_id);
create index game_content_pack_id_idx on public.game_content(pack_id);
create index rooms_game_id_idx on public.rooms(game_id);
insert into public.games(slug,name,summary,game_type,is_published,config)
values('signal-spectrum','Signal','Original spectrum-clue party game.','spectrum-party',true,'{"winScore":12,"phases":["lobby","clue","tune","intercept","reveal"],"stateContract":"game_state is game-specific and server-validated"}')
on conflict(slug) do nothing;
alter table public.games enable row level security; alter table public.game_packs enable row level security; alter table public.game_content enable row level security;
create policy "published games visible" on public.games for select to authenticated using(is_published);
create policy "published packs visible" on public.game_packs for select to authenticated using(is_published and exists(select 1 from public.games g where g.id=game_id and g.is_published));
create policy "published content visible" on public.game_content for select to authenticated using(is_published and exists(select 1 from public.games g where g.id=game_id and g.is_published));
alter publication supabase_realtime add table public.games,public.game_packs,public.game_content;
