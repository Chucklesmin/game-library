-- Original prompt deck and server-authoritative multiplayer state.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

insert into public.games(slug,name,summary,game_type,ruleset_version,config,is_published)
values ('cards-against-humanity','Cards Against Humanity','An original prompt-and-response party game.','prompt-vote',1,
  '{"minPlayers":3,"maxPlayers":10,"defaultRounds":5,"originalContent":true}',true)
on conflict (slug) do update set name=excluded.name, summary=excluded.summary,
  game_type=excluded.game_type, ruleset_version=excluded.ruleset_version, config=excluded.config, is_published=true;

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check check(status in(
  'lobby','clue','tune','intercept','reveal','complete',
  'cah_submitting','cah_voting','cah_reveal','cah_complete'
));

-- Keep the generic host setter from bypassing this game's private state machine.
create or replace function public.update_room_state(p_room_id uuid,p_status text,p_game_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_room public.rooms;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_status not in ('lobby','clue','tune','intercept','reveal','complete') then raise exception 'invalid room status'; end if;
  if exists(select 1 from public.rooms r join public.games g on g.id=r.game_id where r.id=p_room_id and g.slug='cards-against-humanity') then
    raise exception 'game state is managed by Cards Against Humanity actions';
  end if;
  update public.rooms set status=p_status,game_state=coalesce(p_game_state,'{}'::jsonb)
    where id=p_room_id and host_id=v_user returning * into v_room;
  if not found then raise exception 'only the room host can update game state'; end if;
  return to_jsonb(v_room);
end; $$;

-- Bind Wavelength's game setup RPC to its own catalog entry.
create or replace function public.wavelength_start_game(p_room_id uuid,p_pack_slug text,p_total_rounds integer)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_room public.rooms; v_pack public.game_packs; v_game public.wavelength_games; v_available integer;
begin
  if p_total_rounds not between 1 and 20 then raise exception 'invalid round count'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or not public.is_room_member(p_room_id) or v_room.host_id<>(select auth.uid()) then raise exception 'host required'; end if;
  if not exists(select 1 from public.games where id=v_room.game_id and slug='signal-spectrum') then raise exception 'room is not a Wavelength room'; end if;
  if v_room.status not in ('lobby','reveal','complete') then raise exception 'game already in progress'; end if;
  select p.* into v_pack from public.game_packs p join public.games g on g.id=p.game_id where g.slug='signal-spectrum' and p.slug=p_pack_slug and p.is_published;
  if not found then raise exception 'pack unavailable'; end if;
  select count(*) into v_available from public.game_content c join public.wavelength_question_tags t on t.content_id=c.id
    where t.pack_id=v_pack.id and c.is_published and c.content_type='wavelength-spectrum';
  if v_available<p_total_rounds then raise exception 'not enough questions in this pack'; end if;
  update public.wavelength_games set status='complete',completed_at=coalesce(completed_at,now()) where room_id=p_room_id and status='active';
  insert into public.wavelength_games(room_id,pack_id,total_rounds) values(p_room_id,v_pack.id,p_total_rounds) returning * into v_game;
  update public.rooms set group_score=0,status='lobby',game_state=jsonb_build_object(
    'phase','setup','gameId',v_game.id,'packSlug',v_pack.slug,'totalRounds',v_game.total_rounds,'currentRound',0) where id=p_room_id;
  return public.wavelength_start_round(p_room_id);
end; $$;

insert into public.game_packs(game_id,slug,name,description,is_published,sort_order)
select id,'original','Original deck','First-party prompts for Cards Against Humanity.',true,0
from public.games where slug='cards-against-humanity'
on conflict (game_id,slug) do update set name=excluded.name, description=excluded.description, is_published=true;

-- Keep CAH rooms joinable only in the lobby and cap them at ten people.
create or replace function public.join_room_by_code(p_code text, p_display_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_room public.rooms; v_team text; v_game_slug text; v_player_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_display_name)) not between 1 and 24 then raise exception 'invalid display name'; end if;
  select * into v_room from public.rooms where code=upper(p_code) for update;
  if not found then raise exception 'room not found'; end if;
  if exists(select 1 from public.room_players where room_id=v_room.id and user_id=v_user) then return to_jsonb(v_room); end if;
  select slug into v_game_slug from public.games where id=v_room.game_id;
  if v_game_slug='cards-against-humanity' then
    if v_room.status<>'lobby' then raise exception 'game already started'; end if;
    select count(*) into v_player_count from public.room_players where room_id=v_room.id;
    if v_player_count>=10 then raise exception 'room is full'; end if;
  end if;
  select case when count(*) filter(where team='amber') <= count(*) filter(where team='violet') then 'amber' else 'violet' end
    into v_team from public.room_players where room_id=v_room.id;
  insert into public.room_players(room_id,user_id,display_name,team) values(v_room.id,v_user,trim(p_display_name),v_team);
  return to_jsonb(v_room);
end; $$;

with prompts(prompt_id,prompt_text) as (values
 ('cah-001',$$The museum's newest exhibit is just a room containing _____.$$),
 ('cah-002',$$The town meeting ended early after someone proposed _____.$$),
 ('cah-003',$$The worst possible thing to hear from your GPS: _____.$$),
 ('cah-004',$$The secret ingredient in Grandma's famous recipe is _____.$$),
 ('cah-005',$$The school mascot was replaced with _____.$$),
 ('cah-006',$$The new wellness trend everyone is pretending to understand: _____.$$),
 ('cah-007',$$The real reason the meeting could have been an email: _____.$$),
 ('cah-008',$$A suspiciously specific thing to put on a dating profile: _____.$$),
 ('cah-009',$$The robot uprising began when a robot discovered _____.$$),
 ('cah-010',$$The world's least convincing magic trick is _____.$$),
 ('cah-011',$$The first sign that this vacation rental has a story: _____.$$),
 ('cah-012',$$The theme of this year's office party is _____.$$),
 ('cah-013',$$The one thing you should never let a raccoon learn: _____.$$),
 ('cah-014',$$The new flavor at the ice cream shop is _____.$$),
 ('cah-015',$$The announcement that made the wedding guests go quiet: _____.$$),
 ('cah-016',$$A terrible name for a luxury hotel: _____.$$),
 ('cah-017',$$The pirate captain's retirement plan involves _____.$$),
 ('cah-018',$$The most chaotic item to find in a shared office fridge: _____.$$),
 ('cah-019',$$The next big streaming series is a gritty drama about _____.$$),
 ('cah-020',$$The magician's assistant was replaced by _____.$$),
 ('cah-021',$$A bad sentence to end a job interview with: _____.$$),
 ('cah-022',$$The statue in the town square is a tribute to _____.$$),
 ('cah-023',$$The only rule in the world's strangest cooking show: _____.$$),
 ('cah-024',$$The app update nobody asked for adds _____.$$),
 ('cah-025',$$A very bold thing to write in a restaurant review: _____.$$),
 ('cah-026',$$The dragon agreed to leave town in exchange for _____.$$),
 ('cah-027',$$The parade's surprise final float featured _____.$$),
 ('cah-028',$$The best way to make a first impression at a book club: _____.$$),
 ('cah-029',$$The emergency alert was about _____.$$),
 ('cah-030',$$The new airport security rule bans _____.$$),
 ('cah-031',$$A surprisingly useful skill for a haunted house: _____.$$),
 ('cah-032',$$The mascot's halftime performance included _____.$$),
 ('cah-033',$$The town's new slogan is _____.$$),
 ('cah-034',$$The thing the gardening club refuses to discuss: _____.$$),
 ('cah-035',$$The first item on the space station's chore chart is _____.$$),
 ('cah-036',$$The one souvenir that perfectly captures this trip: _____.$$)
)
insert into public.game_content(game_id,pack_id,content_type,payload,sort_order,is_published)
select g.id,p.id,'prompt',jsonb_build_object('id',prompts.prompt_id,'text',prompts.prompt_text),
  row_number() over(order by prompts.prompt_id),true
from prompts cross join public.games g join public.game_packs p on p.game_id=g.id and p.slug='original'
where g.slug='cards-against-humanity'
on conflict do nothing;

create table private.cah_games(
  room_id uuid primary key references public.rooms(id) on delete cascade,
  phase text not null check(phase in ('lobby','submitting','voting','reveal','complete')) default 'lobby',
  round_no integer not null default 0 check(round_no between 0 and 7),
  total_rounds integer not null default 5 check(total_rounds in (3,5,7)),
  prompt_id uuid references public.game_content(id),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
create table private.cah_submissions(
  id uuid primary key default gen_random_uuid(), room_id uuid not null references private.cah_games(room_id) on delete cascade,
  round_no integer not null, author_id uuid not null, body text not null check(char_length(body) between 1 and 180),
  created_at timestamptz not null default now(), unique(room_id,round_no,author_id), unique(id,room_id,round_no)
);
create table private.cah_game_players(
  room_id uuid not null references private.cah_games(room_id) on delete cascade,
  player_id uuid not null, primary key(room_id,player_id)
);
create table private.cah_used_prompts(
  room_id uuid not null references private.cah_games(room_id) on delete cascade,
  prompt_id uuid not null references public.game_content(id) on delete cascade, primary key(room_id,prompt_id)
);
create table private.cah_votes(
  room_id uuid not null, round_no integer not null, voter_id uuid not null, submission_id uuid not null,
  created_at timestamptz not null default now(), primary key(room_id,round_no,voter_id),
  foreign key(submission_id,room_id,round_no) references private.cah_submissions(id,room_id,round_no) on delete cascade
);
create table private.cah_scores(
  room_id uuid not null references private.cah_games(room_id) on delete cascade,
  player_id uuid not null, score integer not null default 0 check(score>=0), primary key(room_id,player_id)
);
alter table private.cah_games enable row level security;
alter table private.cah_submissions enable row level security;
alter table private.cah_game_players enable row level security;
alter table private.cah_votes enable row level security;
alter table private.cah_scores enable row level security;
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function private.cah_action(p_room_id uuid,p_action text,p_value text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_room public.rooms; v_game private.cah_games; v_player_count integer;
  v_prompt public.game_content; v_submission private.cah_submissions; v_rows jsonb; v_scores jsonb;
  v_phase text; v_round integer; v_text text; v_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_room from public.rooms where id=p_room_id for update;
  if not found or not exists(select 1 from public.room_players where room_id=p_room_id and user_id=v_user) then
    raise exception 'room membership required';
  end if;
  if not exists(select 1 from public.games where id=v_room.game_id and slug='cards-against-humanity') then
    raise exception 'room is not a Cards Against Humanity room';
  end if;
  insert into private.cah_games(room_id) values(p_room_id) on conflict do nothing;
  select * into v_game from private.cah_games where room_id=p_room_id for update;
  if v_game.phase not in ('lobby','complete') and not exists(select 1 from private.cah_game_players where room_id=p_room_id and player_id=v_user) then
    raise exception 'game already in progress';
  end if;
  select count(*) into v_player_count from private.cah_game_players where room_id=p_room_id;

  if p_action='start' then
    if v_room.host_id<>v_user then raise exception 'only the host can start'; end if;
    if v_game.phase not in ('lobby','complete') then raise exception 'game is already in progress'; end if;
    select count(*) into v_player_count from public.room_players where room_id=p_room_id;
    if v_player_count not between 3 and 10 then raise exception '3 to 10 players are required'; end if;
    v_game.total_rounds := coalesce(nullif(p_value,'')::integer,5);
    if v_game.total_rounds not in (3,5,7) then raise exception 'round count must be 3, 5, or 7'; end if;
    v_game.round_no:=1; v_game.phase:='submitting';
    select * into v_prompt from public.game_content where game_id=v_room.game_id and content_type='prompt' and is_published order by random() limit 1;
    if not found then raise exception 'prompt deck is empty'; end if;
    v_game.prompt_id:=v_prompt.id;
    delete from private.cah_submissions where room_id=p_room_id;
    delete from private.cah_votes where room_id=p_room_id;
    delete from private.cah_scores where room_id=p_room_id;
    delete from private.cah_game_players where room_id=p_room_id;
    delete from private.cah_used_prompts where room_id=p_room_id;
    insert into private.cah_used_prompts(room_id,prompt_id) values(p_room_id,v_prompt.id);
    insert into private.cah_game_players(room_id,player_id) select p_room_id,user_id from public.room_players where room_id=p_room_id;
    insert into private.cah_scores(room_id,player_id,score) select p_room_id,player_id,0 from private.cah_game_players where room_id=p_room_id;
  elsif p_action='submit' then
    if v_game.phase<>'submitting' then raise exception 'responses are not being accepted'; end if;
    v_text:=trim(coalesce(p_value,''));
    if char_length(v_text) not between 1 and 180 then raise exception 'response must be 1 to 180 characters'; end if;
    insert into private.cah_submissions(room_id,round_no,author_id,body) values(p_room_id,v_game.round_no,v_user,v_text);
    select count(*) into v_count from private.cah_submissions where room_id=p_room_id and round_no=v_game.round_no;
    if v_count=v_player_count then v_game.phase:='voting'; end if;
  elsif p_action='vote' then
    if v_game.phase<>'voting' then raise exception 'voting is not open'; end if;
    if not exists(select 1 from private.cah_submissions where id=p_value::uuid and room_id=p_room_id and round_no=v_game.round_no and author_id<>v_user) then
      raise exception 'choose another player response';
    end if;
    insert into private.cah_votes(room_id,round_no,voter_id,submission_id) values(p_room_id,v_game.round_no,v_user,p_value::uuid);
    select count(*) into v_count from private.cah_votes where room_id=p_room_id and round_no=v_game.round_no;
    if v_count=v_player_count then
      update private.cah_scores s set score=score+1 from private.cah_submissions a
      where s.room_id=p_room_id and a.room_id=p_room_id and a.round_no=v_game.round_no and s.player_id=a.author_id
        and a.id in (select submission_id from private.cah_votes where room_id=p_room_id and round_no=v_game.round_no group by submission_id having count(*)= (select max(n) from (select count(*) n from private.cah_votes where room_id=p_room_id and round_no=v_game.round_no group by submission_id) counts));
      v_game.phase:='reveal'; v_game.submitted_at:=now();
    end if;
  elsif p_action='next' then
    if v_room.host_id<>v_user then raise exception 'only the host can advance'; end if;
    if v_game.phase<>'reveal' then raise exception 'round has not been revealed'; end if;
    if v_game.round_no>=v_game.total_rounds then v_game.phase:='complete';
    else
      v_game.round_no:=v_game.round_no+1; v_game.phase:='submitting';
      select * into v_prompt from public.game_content c where c.game_id=v_room.game_id and c.content_type='prompt' and c.is_published
        and not exists(select 1 from private.cah_used_prompts used where used.room_id=p_room_id and used.prompt_id=c.id) order by random() limit 1;
      if not found then raise exception 'prompt deck is empty'; end if;
      insert into private.cah_used_prompts(room_id,prompt_id) values(p_room_id,v_prompt.id);
      v_game.prompt_id:=v_prompt.id;
    end if;
  elsif p_action<>'view' then raise exception 'unknown action';
  end if;

  v_game.updated_at:=now(); update private.cah_games set phase=v_game.phase,round_no=v_game.round_no,total_rounds=v_game.total_rounds,prompt_id=v_game.prompt_id,submitted_at=v_game.submitted_at,updated_at=v_game.updated_at where room_id=p_room_id;
  update public.rooms set status=case v_game.phase when 'submitting' then 'cah_submitting' when 'voting' then 'cah_voting' when 'reveal' then 'cah_reveal' when 'complete' then 'cah_complete' else 'lobby' end,
    game_state=jsonb_build_object('phase',v_game.phase,'round',v_game.round_no,'totalRounds',v_game.total_rounds) where id=p_room_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'text',s.body,
      'author',case when v_game.phase in ('reveal','complete') then rp.display_name else null end,
      'votes',case when v_game.phase in ('reveal','complete') then coalesce(votes.vote_count,0) else null end)
      order by random()),'[]'::jsonb) into v_rows
    from private.cah_submissions s
    left join public.room_players rp on rp.room_id=s.room_id and rp.user_id=s.author_id
    left join (select submission_id,count(*)::integer as vote_count from private.cah_votes where room_id=p_room_id and round_no=v_game.round_no group by submission_id) votes on votes.submission_id=s.id
    where s.room_id=p_room_id and s.round_no=v_game.round_no
      and (v_game.phase in ('reveal','complete') or (v_game.phase='voting' and s.author_id<>v_user));
  select coalesce(jsonb_agg(jsonb_build_object('userId',sc.player_id,'name',rp.display_name,'score',sc.score) order by sc.score desc,rp.joined_at),'[]'::jsonb) into v_scores
    from private.cah_scores sc join public.room_players rp on rp.room_id=sc.room_id and rp.user_id=sc.player_id where sc.room_id=p_room_id;
  select payload->>'text' into v_text from public.game_content where id=v_game.prompt_id;
  return jsonb_build_object('phase',v_game.phase,'round',v_game.round_no,'totalRounds',v_game.total_rounds,'prompt',v_text,
    'responses',v_rows,'scores',v_scores,'submitted',exists(select 1 from private.cah_submissions where room_id=p_room_id and round_no=v_game.round_no and author_id=v_user),
    'voted',exists(select 1 from private.cah_votes where room_id=p_room_id and round_no=v_game.round_no and voter_id=v_user));
end; $$;
revoke all on function private.cah_action(uuid,text,text) from public,anon;
grant execute on function private.cah_action(uuid,text,text) to authenticated;

create or replace function public.cah_start_game(p_room_id uuid,p_total_rounds integer default 5)
returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'start',p_total_rounds::text) $$;
create or replace function public.cah_submit_answer(p_room_id uuid,p_answer text)
returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'submit',p_answer) $$;
create or replace function public.cah_cast_vote(p_room_id uuid,p_submission_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'vote',p_submission_id::text) $$;
create or replace function public.cah_next_round(p_room_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'next',null) $$;
create or replace function public.cah_get_view(p_room_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'view',null) $$;
revoke all on function public.cah_start_game(uuid,integer),public.cah_submit_answer(uuid,text),public.cah_cast_vote(uuid,uuid),public.cah_next_round(uuid),public.cah_get_view(uuid) from public,anon;
grant execute on function public.cah_start_game(uuid,integer),public.cah_submit_answer(uuid,text),public.cah_cast_vote(uuid,uuid),public.cah_next_round(uuid),public.cah_get_view(uuid) to authenticated;
