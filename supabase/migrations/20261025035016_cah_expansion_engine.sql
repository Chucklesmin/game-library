-- Server-owned CAH participants, hands and leased AI decisions. Human IDs remain auth user IDs.
alter table private.cah_games add column pack_slug text not null default 'original', add column response_mode text not null default 'write' check(response_mode in ('write','cards')), add column scoring_mode text not null default 'crowd' check(scoring_mode in ('crowd','judge')), add column generation uuid not null default gen_random_uuid(), add column judge_status text not null default 'idle', add column judge_explanation text, add column winner_ids uuid[] not null default '{}';
create table private.cah_bots(room_id uuid not null references public.rooms(id) on delete cascade,id uuid primary key default gen_random_uuid(),name text not null,profile text not null check(profile in ('dry','chaos','topical','wordplay')));
create table private.cah_hands(room_id uuid not null references private.cah_games(room_id) on delete cascade,participant_id uuid not null,card_id uuid not null references public.game_content(id),primary key(room_id,participant_id,card_id),unique(room_id,card_id));
create table private.cah_used_responses(room_id uuid not null references private.cah_games(room_id) on delete cascade,card_id uuid not null references public.game_content(id),primary key(room_id,card_id));
create table private.cah_jobs(id uuid primary key default gen_random_uuid(),room_id uuid not null references private.cah_games(room_id) on delete cascade,generation uuid not null,round_no int not null,kind text not null check(kind in ('submit','vote','judge')),participant_id uuid not null, status text not null default 'pending' check(status in ('pending','leased','done','failed','stale')),lease_token uuid,lease_until timestamptz,worker_id text,attempts int not null default 0,fallback boolean not null default false,error text,created_at timestamptz not null default now(),unique(room_id,generation,round_no,kind,participant_id));
create index cah_jobs_pending on private.cah_jobs(status,lease_until,created_at);
alter table private.cah_bots enable row level security;
alter table private.cah_hands enable row level security;
alter table private.cah_used_responses enable row level security;
alter table private.cah_jobs enable row level security;
alter table private.cah_used_prompts enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;

-- Fill every participant to seven cards, without simultaneous duplicate ownership.
create function private.cah_deal(p_room_id uuid) returns void language plpgsql set search_path='' as $$
declare p record; c uuid; needed int; v_pack text;
begin
 select pack_slug into v_pack from private.cah_games where room_id=p_room_id;
 for p in select player_id from private.cah_game_players where room_id=p_room_id loop
  select 7-count(*) into needed from private.cah_hands where room_id=p_room_id and participant_id=p.player_id;
  for i in 1..needed loop
   select gc.id into c from public.game_content gc join public.game_packs gp on gp.id=gc.pack_id join public.games g on g.id=gc.game_id
   where gp.slug=v_pack and g.slug='cards-against-humanity' and gc.content_type='response' and gc.is_published
   and not exists(select 1 from private.cah_hands h where h.room_id=p_room_id and h.card_id=gc.id)
   and not exists(select 1 from private.cah_used_responses u where u.room_id=p_room_id and u.card_id=gc.id) order by random() limit 1;
   if c is null then
    delete from private.cah_used_responses where room_id=p_room_id;
    select gc.id into c from public.game_content gc join public.game_packs gp on gp.id=gc.pack_id join public.games g on g.id=gc.game_id
    where gp.slug=v_pack and g.slug='cards-against-humanity' and gc.content_type='response' and gc.is_published
    and not exists(select 1 from private.cah_hands h where h.room_id=p_room_id and h.card_id=gc.id) order by random() limit 1;
   end if;
   if c is null then raise exception 'response deck is too small'; end if;
   insert into private.cah_hands values(p_room_id,p.player_id,c);
  end loop;
 end loop;
end $$;

create function private.cah_sync(p_room_id uuid) returns void language plpgsql set search_path='' as $$
declare v private.cah_games; n int; ct int;
begin
 select * into v from private.cah_games where room_id=p_room_id;
 select count(*) into n from private.cah_game_players where room_id=p_room_id;
 if v.phase='submitting' then
  select count(*) into ct from private.cah_submissions where room_id=p_room_id and round_no=v.round_no;
  if ct=n then v.phase:='voting'; v.judge_status:=case when v.scoring_mode='judge' then 'pending' else 'idle' end; end if;
 end if;
 if v.phase='voting' and (v.scoring_mode='crowd' or v.judge_status='fallback') then
  select count(*) into ct from private.cah_votes where room_id=p_room_id and round_no=v.round_no;
  if ct=n then
   select array_agg(id) into v.winner_ids from private.cah_submissions where room_id=p_room_id and round_no=v.round_no and id in
   (select submission_id from private.cah_votes where room_id=p_room_id and round_no=v.round_no group by submission_id having count(*)=(select max(num) from (select count(*) num from private.cah_votes where room_id=p_room_id and round_no=v.round_no group by submission_id) z));
   update private.cah_scores sc set score=score+1 from private.cah_submissions s where sc.room_id=p_room_id and s.room_id=p_room_id and sc.player_id=s.author_id and s.id=any(v.winner_ids);
   v.phase:='reveal';
  end if;
 end if;
 update private.cah_games set phase=v.phase,judge_status=v.judge_status,winner_ids=v.winner_ids,updated_at=now() where room_id=p_room_id;
 if v.phase in ('submitting','voting') then
  insert into private.cah_jobs(room_id,generation,round_no,kind,participant_id)
  select p_room_id,v.generation,v.round_no,case when v.phase='submitting' then 'submit' else 'vote' end,b.id from private.cah_bots b join private.cah_game_players p on p.room_id=b.room_id and p.player_id=b.id where b.room_id=p_room_id
  and (v.phase='submitting' or v.scoring_mode='crowd' or v.judge_status='fallback') on conflict do nothing;
  if v.phase='voting' and v.scoring_mode='judge' and v.judge_status='pending' then
   insert into private.cah_jobs(room_id,generation,round_no,kind,participant_id) values(p_room_id,v.generation,v.round_no,'judge',p_room_id) on conflict do nothing;
  end if;
 end if;
 update public.rooms set status=case v.phase when 'submitting' then 'cah_submitting' when 'voting' then 'cah_voting' when 'reveal' then 'cah_reveal' when 'complete' then 'cah_complete' else 'lobby' end,game_state=jsonb_build_object('phase',v.phase,'round',v.round_no,'totalRounds',v.total_rounds,'aiStatus',v.judge_status,'updatedAt',clock_timestamp()) where id=p_room_id;
end $$;

create function private.cah_view(p_room_id uuid,p_user uuid) returns jsonb language plpgsql set search_path='' as $$
declare v private.cah_games; rows jsonb; scores jsonb; parts jsonb; hand jsonb;
begin
 select * into v from private.cah_games where room_id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'isBot',is_bot,'profile',profile) order by is_bot,name),'[]') into parts from
 (select user_id id,display_name name,false is_bot,null::text profile from public.room_players where room_id=p_room_id union all select id,name,true,profile from private.cah_bots where room_id=p_room_id) p;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'text',s.body,'author',case when v.phase in ('reveal','complete') then coalesce(rp.display_name,b.name) else null end,'votes',case when v.phase in ('reveal','complete') then (select count(*) from private.cah_votes x where x.submission_id=s.id) else null end) order by md5(s.id::text||v.generation::text)),'[]') into rows from private.cah_submissions s left join public.room_players rp on rp.room_id=s.room_id and rp.user_id=s.author_id left join private.cah_bots b on b.id=s.author_id where s.room_id=p_room_id and s.round_no=v.round_no and (v.phase in ('reveal','complete') or (v.phase='voting' and (v.scoring_mode='crowd' or v.judge_status='fallback') and s.author_id<>p_user));
 select coalesce(jsonb_agg(jsonb_build_object('userId',s.player_id,'name',coalesce(rp.display_name,b.name),'score',s.score,'isBot',b.id is not null) order by s.score desc,s.player_id),'[]') into scores from private.cah_scores s left join public.room_players rp on rp.room_id=s.room_id and rp.user_id=s.player_id left join private.cah_bots b on b.id=s.player_id where s.room_id=p_room_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.card_id,'text',c.payload->>'text') order by h.card_id),'[]') into hand from private.cah_hands h join public.game_content c on c.id=h.card_id where h.room_id=p_room_id and h.participant_id=p_user;
 return jsonb_build_object('phase',v.phase,'round',v.round_no,'totalRounds',v.total_rounds,'prompt',(select payload->>'text' from public.game_content where id=v.prompt_id),'responses',rows,'scores',scores,'participants',parts,'hand',hand,'settings',jsonb_build_object('packSlug',v.pack_slug,'responseMode',v.response_mode,'scoringMode',v.scoring_mode),'judge',jsonb_build_object('status',v.judge_status,'explanation',case when v.phase in ('reveal','complete') then v.judge_explanation else null end,'winnerIds',case when v.phase in ('reveal','complete') then to_jsonb(v.winner_ids) else '[]'::jsonb end),'aiStatus',jsonb_build_object('pending',(select count(*) from private.cah_jobs where room_id=p_room_id and generation=v.generation and round_no=v.round_no and status in ('pending','leased')),'fallbackUsed',exists(select 1 from private.cah_jobs where room_id=p_room_id and generation=v.generation and fallback),'failed',exists(select 1 from private.cah_jobs where room_id=p_room_id and generation=v.generation and round_no=v.round_no and status='failed')),'submitted',exists(select 1 from private.cah_submissions where room_id=p_room_id and round_no=v.round_no and author_id=p_user),'voted',exists(select 1 from private.cah_votes where room_id=p_room_id and round_no=v.round_no and voter_id=p_user));
end $$;

create or replace function private.cah_action(p_room_id uuid,p_action text,p_value text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.rooms; v private.cah_games; c uuid; n int; body text; cfg jsonb;
begin
 if u is null then raise exception 'authentication required'; end if;
 select * into r from public.rooms where id=p_room_id for update;
 if not found or not exists(select 1 from public.room_players where room_id=p_room_id and user_id=u) then raise exception 'room membership required'; end if;
 if not exists(select 1 from public.games where id=r.game_id and slug='cards-against-humanity') then raise exception 'room is not a Cards Against Humanity room'; end if;
 insert into private.cah_games(room_id) values(p_room_id) on conflict do nothing;
 select * into v from private.cah_games where room_id=p_room_id for update;
 if v.phase not in ('lobby','complete') and not exists(select 1 from private.cah_game_players where room_id=p_room_id and player_id=u) then raise exception 'game already in progress'; end if;
 if p_action in ('configure','add_bot','remove_bot','start','next','judge_fallback') and r.host_id<>u then raise exception 'only the host can perform this action'; end if;
 if p_action in ('configure','add_bot','remove_bot') and v.phase not in ('lobby','complete') then raise exception 'settings can only change in the lobby'; end if;
 if p_action='configure' then
  cfg:=p_value::jsonb;
  if cfg->>'responseMode' not in ('write','cards') or cfg->>'scoringMode' not in ('crowd','judge') then raise exception 'invalid game settings'; end if;
  if not exists(select 1 from public.game_packs where game_id=r.game_id and slug=cfg->>'packSlug' and is_published) then raise exception 'pack unavailable'; end if;
  if cfg->>'responseMode'='cards' and not exists(select 1 from public.game_content c join public.game_packs p on p.id=c.pack_id where p.game_id=r.game_id and p.slug=cfg->>'packSlug' and c.content_type='response' and c.is_published) then raise exception 'this pack has no response cards'; end if;
  update private.cah_games set pack_slug=cfg->>'packSlug',response_mode=cfg->>'responseMode',scoring_mode=cfg->>'scoringMode' where room_id=p_room_id;
 elsif p_action='add_bot' then
  if p_value not in ('dry','chaos','topical','wordplay') then raise exception 'invalid bot profile'; end if;
  select (select count(*) from public.room_players where room_id=p_room_id)+(select count(*) from private.cah_bots where room_id=p_room_id) into n;
  if n>=10 then raise exception 'room is full'; end if;
  insert into private.cah_bots(room_id,name,profile) values(p_room_id,initcap(p_value)||' Bot '||(n+1),p_value);
 elsif p_action='remove_bot' then delete from private.cah_bots where room_id=p_room_id and id=p_value::uuid;
 elsif p_action='start' then
  if v.phase not in ('lobby','complete') then raise exception 'game is already in progress'; end if;
  select (select count(*) from public.room_players where room_id=p_room_id)+(select count(*) from private.cah_bots where room_id=p_room_id) into n;
  if n not between 3 and 10 then raise exception '3 to 10 players are required'; end if;
  n:=coalesce(p_value::int,5); if n not in (3,5,7) then raise exception 'round count must be 3, 5, or 7'; end if;
  delete from private.cah_votes where room_id=p_room_id; delete from private.cah_submissions where room_id=p_room_id; delete from private.cah_scores where room_id=p_room_id; delete from private.cah_game_players where room_id=p_room_id; delete from private.cah_hands where room_id=p_room_id; delete from private.cah_used_responses where room_id=p_room_id; delete from private.cah_used_prompts where room_id=p_room_id;
  insert into private.cah_game_players select p_room_id,user_id from public.room_players where room_id=p_room_id union all select p_room_id,id from private.cah_bots where room_id=p_room_id;
  insert into private.cah_scores select p_room_id,player_id,0 from private.cah_game_players where room_id=p_room_id;
  update private.cah_games set round_no=1,total_rounds=n,phase='submitting',generation=gen_random_uuid(),winner_ids='{}',judge_status='idle',judge_explanation=null where room_id=p_room_id;
 elsif p_action in ('submit','card') then
  if v.phase<>'submitting' then raise exception 'responses are not being accepted'; end if;
  if p_action='card' then
   if v.response_mode<>'cards' then raise exception 'card mode required'; end if;
   select gc.payload->>'text' into body from private.cah_hands h join public.game_content gc on gc.id=h.card_id where h.room_id=p_room_id and h.participant_id=u and h.card_id=p_value::uuid;
   if body is null then raise exception 'card is not in your hand'; end if;
   delete from private.cah_hands where room_id=p_room_id and participant_id=u and card_id=p_value::uuid;
   insert into private.cah_used_responses values(p_room_id,p_value::uuid) on conflict do nothing;
  else
   if v.response_mode<>'write' then raise exception 'select a card from your hand'; end if;
   body:=trim(coalesce(p_value,'')); if char_length(body) not between 1 and 180 then raise exception 'response must be 1 to 180 characters'; end if;
  end if;
  insert into private.cah_submissions(room_id,round_no,author_id,body) values(p_room_id,v.round_no,u,body);
 elsif p_action='vote' then
  if v.phase<>'voting' or (v.scoring_mode='judge' and v.judge_status<>'fallback') then raise exception 'voting is not open'; end if;
  if not exists(select 1 from private.cah_submissions where id=p_value::uuid and room_id=p_room_id and round_no=v.round_no and author_id<>u) then raise exception 'choose another player response'; end if;
  insert into private.cah_votes values(p_room_id,v.round_no,u,p_value::uuid,now());
 elsif p_action='judge_fallback' then
  if v.phase<>'voting' or v.scoring_mode<>'judge' or v.judge_status<>'failed' then raise exception 'judge has not failed'; end if;
  update private.cah_games set judge_status='fallback' where room_id=p_room_id;
 elsif p_action='next' then
  if v.phase<>'reveal' then raise exception 'round has not been revealed'; end if;
  update private.cah_games set phase=case when round_no>=total_rounds then 'complete' else 'submitting' end,round_no=least(round_no+1,total_rounds),winner_ids=case when round_no>=total_rounds then winner_ids else '{}'::uuid[] end,judge_status=case when round_no>=total_rounds then judge_status else 'idle' end,judge_explanation=case when round_no>=total_rounds then judge_explanation else null end where room_id=p_room_id;
 elsif p_action<>'view' then raise exception 'unknown action'; end if;
 select * into v from private.cah_games where room_id=p_room_id;
 if p_action='start' or (p_action='next' and v.phase='submitting') then
  select gc.id into c from public.game_content gc join public.game_packs p on p.id=gc.pack_id where gc.game_id=r.game_id and p.slug=v.pack_slug and gc.content_type='prompt' and gc.is_published and not exists(select 1 from private.cah_used_prompts used where used.room_id=p_room_id and used.prompt_id=gc.id) order by random() limit 1;
  if c is null then raise exception 'prompt deck is empty'; end if;
  insert into private.cah_used_prompts values(p_room_id,c);
  update private.cah_games set prompt_id=c where room_id=p_room_id;
  if v.response_mode='cards' then perform private.cah_deal(p_room_id); end if;
 end if;
 if p_action<>'view' then perform private.cah_sync(p_room_id); end if;
 return private.cah_view(p_room_id,u);
end $$;

create function public.cah_configure(p_room_id uuid,p_pack_slug text,p_response_mode text,p_scoring_mode text) returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'configure',jsonb_build_object('packSlug',p_pack_slug,'responseMode',p_response_mode,'scoringMode',p_scoring_mode)::text) $$;
create function public.cah_add_bot(p_room_id uuid,p_profile text) returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'add_bot',p_profile) $$;
create function public.cah_remove_bot(p_room_id uuid,p_participant_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'remove_bot',p_participant_id::text) $$;
create function public.cah_submit_card(p_room_id uuid,p_card_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'card',p_card_id::text) $$;
create function public.cah_judge_fallback(p_room_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.cah_action(p_room_id,'judge_fallback') $$;
revoke all on function public.cah_configure(uuid,text,text,text),public.cah_add_bot(uuid,text),public.cah_remove_bot(uuid,uuid),public.cah_submit_card(uuid,uuid),public.cah_judge_fallback(uuid) from public,anon;
grant execute on function public.cah_configure(uuid,text,text,text),public.cah_add_bot(uuid,text),public.cah_remove_bot(uuid,uuid),public.cah_submit_card(uuid,uuid),public.cah_judge_fallback(uuid) to authenticated;

-- Only service_role can lease or commit AI decisions. Claims contain no author identities.
create function public.cah_worker_claim(p_limit int,p_worker_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.cah_jobs; candidate record; v private.cah_games; payload jsonb; choices jsonb; result jsonb:='[]'::jsonb;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise exception 'service role required'; end if;
 for candidate in select id,room_id from private.cah_jobs where status='pending' or (status='leased' and lease_until<now()) order by created_at limit least(greatest(coalesce(p_limit,1),1),10) loop
  perform 1 from public.rooms where id=candidate.room_id for update skip locked;
  if not found then continue; end if;
  select * into j from private.cah_jobs where id=candidate.id and (status='pending' or (status='leased' and lease_until<now())) for update skip locked;
  if not found then continue; end if;
  select * into v from private.cah_games where room_id=j.room_id;
  if j.generation<>v.generation or j.round_no<>v.round_no or (j.kind='submit' and v.phase<>'submitting') or (j.kind in ('vote','judge') and v.phase<>'voting') or (j.kind='judge' and v.judge_status<>'pending') then
   update private.cah_jobs set status='stale' where id=j.id; continue;
  end if;
  j.lease_token:=gen_random_uuid();
  update private.cah_jobs set status='leased',lease_token=j.lease_token,lease_until=now()+interval '90 seconds',worker_id=left(p_worker_id,100),attempts=attempts+1 where id=j.id;
  if j.kind='submit' then
   select coalesce(jsonb_agg(jsonb_build_object('id',h.card_id,'text',c.payload->>'text') order by h.card_id),'[]') into choices from private.cah_hands h join public.game_content c on c.id=h.card_id where h.room_id=j.room_id and h.participant_id=j.participant_id;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'text',s.body) order by md5(s.id::text||j.id::text)),'[]') into choices from private.cah_submissions s where s.room_id=j.room_id and s.round_no=j.round_no and (j.kind='judge' or s.author_id<>j.participant_id);
  end if;
  payload:=jsonb_build_object('kind',j.kind,'prompt',(select gc.payload->>'text' from public.game_content gc where gc.id=v.prompt_id),'choices',choices,'profile',(select profile from private.cah_bots where id=j.participant_id),'responseMode',v.response_mode);
  if j.attempts>=3 then
   if j.kind='judge' then
    perform public.cah_worker_complete(j.id,j.lease_token,null,'Worker lease recovery limit reached');
   else
    perform public.cah_worker_complete(j.id,j.lease_token,case when j.kind='submit' and v.response_mode='write' then jsonb_build_object('text','A spectacular failure of adult supervision.','fallback',true) else jsonb_build_object('choiceId',choices->0->>'id','fallback',true) end,null);
   end if;
   continue;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('id',j.id,'leaseToken',j.lease_token,'payload',payload));
 end loop;
 return jsonb_build_object('jobs',result);
end $$;

create function public.cah_worker_complete(p_job_id uuid,p_lease_token uuid,p_result jsonb,p_error text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.cah_jobs; v private.cah_games; body text; cid uuid; x jsonb; total numeric; top numeric:=-1; wins uuid[]:='{}'::uuid[]; seen uuid[]:='{}'::uuid[]; dims text[]:=array['humor','surprise','fit','originality','timing']; d text; count_entries int;
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','')<>'service_role' then raise exception 'service role required'; end if;
 -- Read room key first, then lock room before job, matching human action lock order.
 select * into j from private.cah_jobs where id=p_job_id;
 if not found then raise exception 'job not found'; end if;
 perform 1 from public.rooms where id=j.room_id for update;
 select * into j from private.cah_jobs where id=p_job_id for update;
 if j.status='done' then return jsonb_build_object('status','done'); end if;
 if j.status<>'leased' or j.lease_token is distinct from p_lease_token or j.lease_until<now() then raise exception 'invalid or expired lease'; end if;
 select * into v from private.cah_games where room_id=j.room_id for update;
 if j.generation<>v.generation or j.round_no<>v.round_no or (j.kind='submit' and v.phase<>'submitting') or (j.kind in ('vote','judge') and v.phase<>'voting') or (j.kind='judge' and v.judge_status<>'pending') then
  update private.cah_jobs set status='stale' where id=j.id; return jsonb_build_object('status','stale');
 end if;
 if p_error is not null then
  update private.cah_jobs set status='failed',error=left(p_error,200) where id=j.id;
  if j.kind='judge' then update private.cah_games set judge_status='failed' where room_id=j.room_id; end if;
  perform private.cah_sync(j.room_id); return jsonb_build_object('status','failed');
 end if;
 if j.kind='submit' then
  if v.response_mode='cards' then
   cid:=(p_result->>'choiceId')::uuid;
   select c.payload->>'text' into body from private.cah_hands h join public.game_content c on c.id=h.card_id where h.room_id=j.room_id and h.participant_id=j.participant_id and h.card_id=cid;
   if body is null then raise exception 'card is not in bot hand'; end if;
   delete from private.cah_hands where room_id=j.room_id and participant_id=j.participant_id and card_id=cid;
   insert into private.cah_used_responses values(j.room_id,cid) on conflict do nothing;
  else body:=trim(coalesce(p_result->>'text','')); if char_length(body) not between 1 and 180 then raise exception 'invalid bot response'; end if;
  end if;
  insert into private.cah_submissions(room_id,round_no,author_id,body) values(j.room_id,j.round_no,j.participant_id,body);
 elsif j.kind='vote' then
  cid:=(p_result->>'choiceId')::uuid;
  if not exists(select 1 from private.cah_submissions where room_id=j.room_id and round_no=j.round_no and id=cid and author_id<>j.participant_id) then raise exception 'invalid vote choice'; end if;
  insert into private.cah_votes values(j.room_id,j.round_no,j.participant_id,cid,now());
 else
  if jsonb_typeof(p_result->'ratings') is distinct from 'array' then raise exception 'ratings required'; end if;
  select count(*) into count_entries from private.cah_submissions where room_id=j.room_id and round_no=j.round_no;
  if jsonb_array_length(p_result->'ratings')<>count_entries then raise exception 'rate every submission'; end if;
  for x in select value from jsonb_array_elements(p_result->'ratings') loop
   cid:=(x->>'id')::uuid;
   if cid=any(seen) or not exists(select 1 from private.cah_submissions where room_id=j.room_id and round_no=j.round_no and id=cid) then raise exception 'invalid rating id'; end if;
   seen:=array_append(seen,cid);
   foreach d in array dims loop
    if jsonb_typeof(x->d) is distinct from 'number' or (x->>d)::numeric not between 0 and 5 then raise exception 'rating must be numeric 0 to 5'; end if;
   end loop;
   total:=(x->>'humor')::numeric*.35+(x->>'surprise')::numeric*.25+(x->>'fit')::numeric*.20+(x->>'originality')::numeric*.10+(x->>'timing')::numeric*.10;
   if total>top then top:=total; end if;
  end loop;
  -- Fixed 0.01 tolerance relative to global maximum, independent of rating order.
  for x in select value from jsonb_array_elements(p_result->'ratings') loop
   total:=(x->>'humor')::numeric*.35+(x->>'surprise')::numeric*.25+(x->>'fit')::numeric*.20+(x->>'originality')::numeric*.10+(x->>'timing')::numeric*.10;
   if top-total<=.01 then wins:=array_append(wins,(x->>'id')::uuid); end if;
  end loop;
  body:=trim(coalesce(p_result->>'explanation',''));
  if char_length(body) not between 1 and 600 then raise exception 'brief judge explanation required'; end if;
  update private.cah_scores sc set score=score+1 from private.cah_submissions s where sc.room_id=j.room_id and s.room_id=j.room_id and sc.player_id=s.author_id and s.id=any(wins);
  update private.cah_games set phase='reveal',judge_status='complete',winner_ids=wins,judge_explanation=body where room_id=j.room_id;
 end if;
 update private.cah_jobs set status='done',fallback=coalesce((p_result->>'fallback')::boolean,false),lease_until=null where id=j.id;
 perform private.cah_sync(j.room_id);
 return jsonb_build_object('status','done');
end $$;
revoke all on function public.cah_worker_claim(int,text),public.cah_worker_complete(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.cah_worker_claim(int,text),public.cah_worker_complete(uuid,uuid,jsonb,text) to service_role;
revoke all on function private.cah_deal(uuid),private.cah_sync(uuid),private.cah_view(uuid,uuid) from public,anon,authenticated;
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
    select (select count(*) from public.room_players where room_id=v_room.id)+(select count(*) from private.cah_bots where room_id=v_room.id) into v_player_count;
    if v_player_count>=10 then raise exception 'room is full'; end if;
  end if;
  select case when count(*) filter(where team='amber') <= count(*) filter(where team='violet') then 'amber' else 'violet' end
    into v_team from public.room_players where room_id=v_room.id;
  insert into public.room_players(room_id,user_id,display_name,team) values(v_room.id,v_user,trim(p_display_name),v_team);
  return to_jsonb(v_room);
end; $$;
