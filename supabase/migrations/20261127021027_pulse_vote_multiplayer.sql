-- Pulse Vote uses shared rooms for membership and realtime phase notifications.
-- Ballots, prompt order and scores live outside the Data API and realtime publication.
update public.games set
  summary='Cast one private vote and score if your answer is among the room''s most popular.',
  config='{"minPlayers":3,"maxPlayers":8,"defaultRounds":5,"maxRounds":10,"phases":["lobby","vote","reveal","complete"]}'
where slug='pulse-vote';

insert into public.game_packs(game_id, slug, name, description, is_published)
select id, 'starter', 'The Starter Pack', 'Everyday dilemmas and imaginary situations.', true
from public.games where slug='pulse-vote';

with prompts(position, question, choices) as (values
  (1, 'What would get you to a group breakfast before 8 a.m.?', array['Excellent pancakes','A friend visiting from out of town','A table with a sunrise view','The promise of a nap afterward']),
  (2, 'Which tiny luxury would you put in every hotel room?', array['A really good reading lamp','A fridge with cold sparkling water','A pillow menu','A wide windowsill you can sit on']),
  (3, 'What should be the grand prize at a neighborhood field day?', array['A year of ice cream','First pick of the community garden tomatoes','A ridiculous traveling trophy','A catered dinner for your block']),
  (4, 'Which chore deserves its own walk-up song?', array['Taking out the recycling','Folding a fitted sheet','Unloading a full dishwasher','Cleaning the shower drain']),
  (5, 'You get an extra hour on Friday. Where does it go?', array['A long lunch','A walk with no destination','A head start on sleep','One more episode']),
  (6, 'What makes a borrowed cabin feel like a vacation first?', array['Putting your phone away','Getting the fireplace going','Making the first pot of coffee','Picking a spot on the porch']),
  (7, 'Which snack would you trust to rescue a five-hour train ride?', array['A bakery cookie','A bag of sour candy','A sleeve of crackers and cheese','A perfectly ripe peach']),
  (8, 'Which room would you add to a library if you had the space?', array['A room for recording stories','A sunny room full of plants','A puzzle room','A quiet room with hammocks']),
  (9, 'What would make a group photo worth retaking?', array['Someone blinked','The light is suddenly better','Someone arrived late','The funniest person was behind the camera']),
  (10, 'What would you buy first with a coupon for any street vendor?', array['Flowers for the table','A hot pretzel','An illustrated map','A scoop of an unusual ice cream']),
  (11, 'Which harmless mystery would you solve first?', array['Where the missing socks go','Who leaves painted rocks in the park','Why that one house has six doorbells','Which neighbor has the best garden at night']),
  (12, 'What would be the hardest perk to give up in an imaginary job?', array['A four-day week','A dog-friendly office','Free lunch every day','A month off between projects']),
  (13, 'What is the best first clue that a diner is worth stopping at?', array['A pie case by the door','People ordering breakfast at dinner','Handwritten specials','A crowded counter']),
  (14, 'Which ticket would you take for a surprise evening out?', array['An outdoor movie','A small comedy show','A night at the aquarium','A concert where you know one song']),
  (15, 'What would you most want a household robot to learn?', array['Finding lost keys','Making perfect toast','Untangling cords','Putting groceries away']),
  (16, 'What is the best thing to hear after hosting dinner?', array['Someone asks for the recipe','Someone asks to take leftovers','Someone offers to do the dishes','Someone asks when we can do it again'])
)
insert into public.game_content(game_id, pack_id, content_type, payload, sort_order, is_published)
select p.game_id, p.id, 'pulse-vote-prompt', jsonb_build_object('question', q.question, 'choices', q.choices), q.position, true
from prompts q cross join public.game_packs p join public.games g on g.id=p.game_id
where g.slug='pulse-vote' and p.slug='starter';

alter table public.rooms drop constraint rooms_status_check;
alter table public.rooms add constraint rooms_status_check check(status in (
  'lobby','clue','tune','intercept','reveal','complete',
  'cah_submitting','cah_voting','cah_reveal','cah_complete',
  'pulse_voting','pulse_reveal','pulse_complete'
));

create table private.pulse_vote_matches (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  round_id uuid not null,
  round_number integer not null check (round_number >= 1),
  prompts jsonb not null,
  scores jsonb not null,
  ballots jsonb not null default '{}',
  result jsonb
);
alter table private.pulse_vote_matches enable row level security;
revoke all on private.pulse_vote_matches from public, anon, authenticated;

-- All Pulse joins and moves take the same room lock. Existing members resume
-- through the shared join RPC's membership check without inserting another row.
create function private.pulse_vote_check_new_player()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  select r.status into v_status from public.rooms r join public.games g on g.id=r.game_id
    where r.id=new.room_id and g.slug='pulse-vote' for update of r;
  if not found then return new; end if;
  if v_status <> 'lobby' then raise exception 'This Pulse Vote match has already started.'; end if;
  if (select count(*) from public.room_players where room_id=new.room_id) >= 8 then
    raise exception 'This Pulse Vote room is full.';
  end if;
  return new;
end;
$$;
revoke all on function private.pulse_vote_check_new_player() from public, anon, authenticated;
create trigger pulse_vote_check_new_player before insert on public.room_players
for each row execute function private.pulse_vote_check_new_player();

-- Prevent generic host writes from bypassing either private game engine.
create or replace function public.update_room_state(p_room_id uuid,p_status text,p_game_state jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_room public.rooms;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_status not in ('lobby','clue','tune','intercept','reveal','complete') then raise exception 'invalid room status'; end if;
  if exists(select 1 from public.rooms r join public.games g on g.id=r.game_id where r.id=p_room_id and g.slug='cards-against-humanity') then
    raise exception 'game state is managed by Cards Against Humanity actions';
  end if;
  if exists(select 1 from public.rooms r join public.games g on g.id=r.game_id where r.id=p_room_id and g.slug='pulse-vote') then
    raise exception 'game state is managed by Pulse Vote actions';
  end if;
  update public.rooms set status=p_status,game_state=coalesce(p_game_state,'{}'::jsonb)
    where id=p_room_id and host_id=v_user returning * into v_room;
  if not found then raise exception 'only the room host can update game state'; end if;
  return to_jsonb(v_room);
end; $$;

create function public.pulse_vote_join(p_code text, p_display_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.rooms r join public.games g on g.id=r.game_id
    where r.code=upper(p_code) and g.slug='pulse-vote') then
    raise exception 'Pulse Vote room not found. Check the invite code.';
  end if;
  return public.join_room_by_code(p_code, p_display_name);
end;
$$;

create function public.pulse_vote_get_view(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_match private.pulse_vote_matches;
  v_players jsonb;
begin
  select r.* into v_room from public.rooms r join public.games g on g.id=r.game_id
    where r.id=p_room_id and g.slug='pulse-vote' and public.is_room_member(r.id);
  if v_user is null or not found then raise exception 'Pulse Vote room membership required.'; end if;
  select * into v_match from private.pulse_vote_matches where room_id=p_room_id;
  select jsonb_agg(jsonb_build_object('id', user_id, 'name', display_name, 'score', score, 'rank', place)
      order by score desc, joined_at, user_id) into v_players
    from (
      select scored.*, rank() over (order by score desc) as place from (
        select user_id, display_name, joined_at, coalesce((v_match.scores->>user_id::text)::int, 0) as score
        from public.room_players where room_id=p_room_id
      ) scored
    ) ranked;
  return jsonb_build_object(
    'roomId', v_room.id, 'code', v_room.code, 'isHost', v_room.host_id=v_user, 'hostId', v_room.host_id,
    'phase', case v_room.status when 'pulse_voting' then 'vote' when 'pulse_reveal' then 'reveal'
      when 'pulse_complete' then 'complete' else 'lobby' end,
    'roundId', v_match.round_id, 'round', v_match.round_number, 'totalRounds', jsonb_array_length(v_match.prompts),
    'prompt', v_match.prompts->(v_match.round_number-1), 'players', v_players,
    'myChoice', v_match.ballots->v_user::text,
    'result', case when v_room.status in ('pulse_reveal','pulse_complete') then v_match.result end
  );
end;
$$;

-- The expected round ID prevents retries and stale tabs from affecting later rounds or rematches.
create function public.pulse_vote_move(
  p_room_id uuid, p_action text, p_round_id uuid, p_value integer default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_match private.pulse_vote_matches;
  v_prompts jsonb;
  v_scores jsonb;
  v_counts integer[];
  v_winners integer[];
  v_peak integer;
  v_players integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select r.* into v_room from public.rooms r join public.games g on g.id=r.game_id
    where r.id=p_room_id and g.slug='pulse-vote' and public.is_room_member(r.id)
    for update of r;
  if not found then raise exception 'Pulse Vote room membership required.'; end if;
  if p_action is null or p_action not in ('start','vote','close','next') then
    raise exception 'Unknown Pulse Vote action.';
  end if;
  if p_action <> 'vote' and v_room.host_id <> v_user then raise exception 'Only the host can advance the match.'; end if;
  select * into v_match from private.pulse_vote_matches where room_id=p_room_id;

  if v_match.round_id is distinct from p_round_id then
    raise exception 'The round has changed. Try again on the current screen.';
  end if;

  case p_action
    when 'start' then
      if v_room.status not in ('lobby','pulse_complete') then raise exception 'A match is already in progress.'; end if;
      if p_value is null or p_value not between 1 and 10 then raise exception 'Choose between 1 and 10 rounds.'; end if;
      select count(*), jsonb_object_agg(user_id, 0) into v_players, v_scores from public.room_players where room_id=p_room_id;
      if v_players not between 3 and 8 then raise exception 'Pulse Vote needs 3 to 8 players.'; end if;
      select jsonb_agg(payload order by draw_order) into v_prompts from (
        select c.payload, random() as draw_order from public.game_content c
        join public.game_packs p on p.id=c.pack_id and p.game_id=c.game_id
        where c.game_id=v_room.game_id and p.slug='starter' and p.is_published
          and c.content_type='pulse-vote-prompt' and c.is_published
        order by draw_order limit p_value
      ) drawn;
      if coalesce(jsonb_array_length(v_prompts),0) < p_value then raise exception 'The starter pack has too few prompts.'; end if;
      insert into private.pulse_vote_matches(room_id, round_id, round_number, prompts, scores)
        values(p_room_id, gen_random_uuid(), 1, v_prompts, v_scores)
        on conflict (room_id) do update set round_id=excluded.round_id, round_number=1,
          prompts=excluded.prompts, scores=excluded.scores, ballots='{}', result=null;
      update public.rooms set status='pulse_voting' where id=p_room_id;

    when 'vote' then
      -- A replay returns the already accepted choice, even if the host just closed this round.
      if v_match.ballots ? v_user::text then return public.pulse_vote_get_view(p_room_id); end if;
      if v_room.status <> 'pulse_voting' then raise exception 'Voting is closed.'; end if;
      if p_value is null or p_value < 0
        or p_value >= jsonb_array_length(v_match.prompts->(v_match.round_number-1)->'choices') then
        raise exception 'Choose an answer from this round.';
      end if;
      update private.pulse_vote_matches set ballots=ballots || jsonb_build_object(v_user, p_value) where room_id=p_room_id;

    when 'close' then
      if v_room.status='pulse_reveal' then return public.pulse_vote_get_view(p_room_id); end if;
      if v_room.status <> 'pulse_voting' then raise exception 'Voting is closed.'; end if;
      select array_agg(tally.total order by choice), max(tally.total) into v_counts, v_peak
        from generate_series(0, jsonb_array_length(v_match.prompts->(v_match.round_number-1)->'choices')-1) as choice
        cross join lateral (
          select count(*)::int as total from jsonb_each_text(v_match.ballots) b where b.value::int=choice
        ) tally;
      select coalesce(array_agg(choice order by choice), '{}'::integer[]) into v_winners
        from generate_series(0, cardinality(v_counts)-1) as choice
        where v_peak > 0 and v_counts[choice+1]=v_peak;
      select jsonb_object_agg(s.key, s.value::int + case
        when (v_match.ballots->>s.key)::int=any(v_winners) then 1 else 0 end)
        into v_scores from jsonb_each_text(v_match.scores) s;
      update private.pulse_vote_matches set scores=v_scores,
        result=jsonb_build_object('counts', v_counts, 'winners', v_winners)
        where room_id=p_room_id;
      update public.rooms set status='pulse_reveal' where id=p_room_id;

    when 'next' then
      if v_room.status <> 'pulse_reveal' then raise exception 'Reveal the results before advancing.'; end if;
      if v_match.round_number=jsonb_array_length(v_match.prompts) then
        update public.rooms set status='pulse_complete' where id=p_room_id;
      else
        update private.pulse_vote_matches set round_id=gen_random_uuid(), round_number=round_number+1, ballots='{}', result=null
          where room_id=p_room_id;
        update public.rooms set status='pulse_voting' where id=p_room_id;
      end if;
  end case;
  return public.pulse_vote_get_view(p_room_id);
end;
$$;

revoke all on function public.pulse_vote_join(text,text), public.pulse_vote_get_view(uuid),
  public.pulse_vote_move(uuid,text,uuid,integer) from public, anon, authenticated;
grant execute on function public.pulse_vote_join(text,text), public.pulse_vote_get_view(uuid),
  public.pulse_vote_move(uuid,text,uuid,integer) to authenticated;
