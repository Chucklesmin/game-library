-- Wavelength game sessions, tagged prompt packs, and Keeper-only slider previews.
-- Prompts are seeded once and assigned to packs through a normalized join table.

alter table public.rounds add column if not exists content_id uuid references public.game_content(id) on delete set null;
alter table public.rounds add column if not exists wavelength_game_id uuid;

create table if not exists public.wavelength_games(
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  pack_id uuid not null references public.game_packs(id) on delete restrict,
  total_rounds integer not null check(total_rounds between 1 and 20),
  current_round integer not null default 0 check(current_round >= 0),
  used_content_ids uuid[] not null default '{}',
  status text not null default 'active' check(status in('active','complete')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.rounds
  add constraint rounds_wavelength_game_id_fkey
  foreign key (wavelength_game_id) references public.wavelength_games(id) on delete set null;

create index if not exists wavelength_games_room_created_idx on public.wavelength_games(room_id, created_at desc);
create index if not exists rounds_wavelength_game_id_idx on public.rounds(wavelength_game_id);

create table if not exists public.wavelength_question_tags(
  content_id uuid not null references public.game_content(id) on delete cascade,
  pack_id uuid not null references public.game_packs(id) on delete cascade,
  primary key(content_id, pack_id)
);
create index if not exists wavelength_question_tags_pack_content_idx on public.wavelength_question_tags(pack_id, content_id);

alter table public.wavelength_games enable row level security;
alter table public.wavelength_question_tags enable row level security;

-- A single source row per question makes every playable question explicitly tagged.
insert into public.game_packs(game_id,slug,name,description,is_published,sort_order,metadata)
select g.id, p.slug, p.name, 'Reviewed Wavelength spectrum prompts.', true, p.sort_order, jsonb_build_object('emoji', p.emoji)
from public.games g
cross join (values
  ('daily','Daily Signals','☀️',1),
  ('culture','Culture Club','🎬',2),
  ('food','Taste Test','🍋',3),
  ('places','Places, Please','🗺️',4),
  ('people','Human Energy','✨',5),
  ('internet','Internet Brain','💻',6),
  ('throwback','Throwback Frequency','📼',7),
  ('wild','Wild Cards','🪐',8),
  ('work','Work & Play','🎯',9),
  ('afterdark','After Dark','🌙',10),
  ('naughty','Naughty & Nice','🍒',11)
) as p(slug,name,emoji,sort_order)
where g.slug = 'signal-spectrum'
on conflict(game_id,slug) do update
  set name = excluded.name, description = excluded.description, is_published = excluded.is_published,
      sort_order = excluded.sort_order, metadata = excluded.metadata;

with source(slug,cards) as (
  values
  ('daily',$$Wake early|Sleep in~Homemade|Takeout~Text it|Call it~Spontaneous|Planned~Window seat|Aisle seat~Hot coffee|Iced coffee~City walk|Nature walk~Early|Fashionably late~Notebook|Notes app~Sweet snack|Salty snack~Library|Bookstore~Morning shower|Night shower~One trip|Many trips~Rewatch|Try new~Shoes on|Shoes off~Calendar full|Calendar open~Phone camera|Film camera~Dine in|Picnic~Long playlist|One album~Talk it out|Think it through~Minimalist|Maximalist~Big group|One-on-one~Buy it|Borrow it~Sunrise|Sunset~Workout solo|Workout class~House party|Going out~Fast reply|Thoughtful reply~Clean now|Clean later~Early bird|Night owl~Routine|Surprise$$),
  ('culture',$$Cult classic|Blockbuster~Book first|Screen first~Serious|Silly~Comfort watch|Challenge watch~Live music|Studio recording~Plot|Character~Museum|Concert~Subtitles on|Subtitles off~Slow burn|Instant hook~Classic|Contemporary~Indie|Mainstream~Reboot|Original~Solo artist|Ensemble~Jukebox|Algorithm~Theater|Couch~Fiction|Documentary~Binge|Weekly~Lyrics|Melody~Trailer avoider|Trailer watcher~Film grain|Digital polish~Hero|Antihero~Happy ending|Ambiguous ending~Poetry|Prose~Broadway|Basement show~Vintage|Futuristic~Spooky|Cozy~Meme|Quote~Cover|Original~Drama|Comedy~Thought-provoking|Pure fun$$),
  ('food',$$Mild|Extra spicy~Crunchy|Chewy~Brunch|Midnight snack~Sauce aside|Sauce everywhere~Sweet breakfast|Savory breakfast~Shared plates|Own entrée~Tiny bites|Giant bowl~Familiar order|New item~Lemon|Chocolate~Street food|Tasting menu~Breakfast all day|Dinner only~Fork|Hands~Fancy plating|Big portions~Sparkling|Still~Crispy edge|Soft center~Dessert first|Dessert last~Dip|Drizzle~Pickles|No pickles~Coffee shop|Bakery~Noodles|Rice~Salad|Sandwich~Fruit dessert|Baked dessert~Food truck|Sit-down~Spice blend|Fresh herbs~Comfort food|Health kick~Pie|Cake~Local spot|Chain favorite~Snack board|Full meal~Sour|Sweet~Recipe follower|Improviser$$),
  ('places',$$Mountains|Beach~Small town|Big city~Museum day|Theme park~Train ride|Road trip~Camping|Hotel~Map out|Wander~Landmark|Hidden gem~Coast|Countryside~Cabin|Apartment~Passport|Staycation~Busy market|Quiet café~Sun|Snow~Day trip|Long haul~Scenic route|Fastest route~Northern escape|Southern escape~Trail|Boardwalk~Hostel|Resort~Early flight|Red-eye~Desert|Forest~Historic streets|Modern skyline~Tour guide|Self guided~National park|City park~Souvenir|Photo~Ferry|Subway~Tent|Glamping~Rainy day|Clear sky~Neighborhood bar|Rooftop bar~Familiar route|Scenic route~Museum map|No plan~Beach day|Trail day$$),
  ('people',$$Quiet confidence|Big energy~Diplomatic|Direct~Listener|Storyteller~Optimist|Realist~Competitive|Collaborative~Reserved|Open book~Go with flow|Take charge~Punctual|Flexible~Heart|Head~Tease|Encourage~Host|Guest~Group chat|Private text~Risk taker|Careful planner~Tradition|Reinvention~Quick decision|Deep thought~Observer|Initiator~Practical gift|Sentimental gift~Straight face|Expressive face~Forgive fast|Remember all~Calm|Chaotic good~Coach|Cheerleader~Homebody|Social butterfly~Bold|Understated~Debate|Agree~Routine|Variety~Blunt|Diplomatic~Independent|Team player~Nostalgic|Forward-looking~One best friend|Many friends~Spark|Stability$$),
  ('internet',$$Voice note|Typing~Bookmark|Screenshot~Group chat|Server~Desktop|Mobile~Dark mode|Light mode~Search it|Ask friend~GIF|Emoji~Podcast|Short video~Playlist|Radio~Pinned tab|Clean tabs~Mute|Unfollow~Link drop|Long explanation~Shortcut|Menu click~Email|DM~Wi-Fi|Data~Autoplay|Manual~Online shop|In-store~Infinite scroll|One article~Tab hoarder|Tab closer~Password manager|Memory~Profile pic|No avatar~Comment|Lurk~Video call|Phone call~Cloud|Hard drive~Wallpaper|Plain~QR code|Typed URL~Always notified|Do not disturb~Laptop|Tablet~E-reader|Paper~Rabbit hole|Focus mode$$),
  ('throwback',$$Cartoons|Morning errands~CD binder|Streaming queue~Arcade|Console~School dance|House party~Landline|Cell phone~Mixtape|Playlist~Mall|Main street~Stickers|Digital badges~Summer camp|Summer job~Yearbook|Photo dump~Disposable camera|Selfie~Video store|Streaming app~Roller rink|Bowling~Cartoon theme|Pop intro~Handwritten note|Voice memo~Sleepover|Group vacation~Local radio|Algorithm~Board game|Video game~Photo album|Camera roll~Backyard|Bedroom~Pizza party|Cookout~Comic book|Webtoon~Flip phone|Smart watch~After school|Midnight~Trick-or-treat|Costume party~Weekend chores|Weekend plans$$),
  ('wild',$$Useful power|Fun power~Dragon|Giant robot~Past travel|Future travel~Teleport|Fly~Mermaid|Astronaut~Secret lair|Treehouse~Alien friend|Ghost friend~Magic wand|Magic book~Talking animal|Tiny dinosaur~Strength|Speed~Underwater city|Sky city~Moon base|Jungle temple~Invisible|Mind reading~Treasure map|Mystery door~Cursed item|Lucky charm~Storm chaser|Deep diver~Space opera|Fairy tale~Portal|Puzzle box~Robot butler|Dragon chauffeur~Giant library|Giant kitchen~Winter forever|Summer forever~Perfect day|Surprise adventure~Glowing forest|Crystal cave~Wizard duel|Dance battle~Friendly monster|Mischief fairy~Ancient ruins|Future ruins~Cloud castle|Underground city~Magic mirror|Magic compass~One careful wish|One bold wish$$),
  ('work',$$Deep focus|Quick wins~Brainstorm|Execute~List|Wing it~Big picture|Detail~Office|Café~Early start|Late sprint~One task|Multitask~Sketch|Build~Immediate feedback|Time to reflect~Solo|Co-create~Presentation|Spreadsheet~Sticky notes|Whiteboard~Deadline|Inspiration~Promotion|Freedom~Long hours|Better systems~Inbox zero|Search later~Shortcut|Best practice~Prototype|Polish~Practice|Improvise~Expertise|Curiosity~Ambition|Balance~Mentor|Peer~Remote|In person~Meeting|Async~Perfect|Shipped~Plan ahead|Adapt as you go~Calendar block|To-do list~Sprint|Marathon~Idea|Execution$$),
  ('afterdark',$$Dance floor|Corner booth~Late dinner|Early dessert~Rooftop|Basement~Mocktail|Cocktail~Live DJ|Live band~Dress up|Comfortable~Stay out|Head home~Night drive|Night walk~Neon|Candlelight~Secrets|Stories~First date|Long-time love~Laugh loud|Speak low~Big gesture|Small detail~Busy bar|Quiet lounge~Spontaneous night|Quiet night~Dessert bar|Coffee shop~Movie night|Game night~City lights|Star lights~Last call|First train~Deep talk|Dumb jokes~Crowded room|Empty room~Mystery|Romance~Slow song|Fast song~Capture it|Live in it~Flirt|Tease~Fancy|Casual~Stay in|Go out~Midnight snack|Sunrise breakfast~Last one out|Leave on a high~New connection|Familiar comfort$$),
  ('naughty',$$Play it cool|Make the first move~Cheeky text|Sweet note~Slow dance|Dance floor~Eye contact|Playful banter~Kiss at midnight|Breakfast in bed~Silk sheets|Soft hoodie~Love song|Late-night playlist~Candlelight|Neon lights~Flirt|Tease~Secret crush|Open invitation~Stay in|Sneak out~Champagne|Chocolate~Romantic comedy|Steamy thriller~Handwritten note|Voice message~Dress up|Dress down~First date nerves|Long-time chemistry~Bold compliment|Subtle hint~Rooftop view|Backseat conversation~Slow burn|Instant spark~Dinner date|Dessert date~Fancy hotel|Cozy cabin~Last call|Sunrise~Take the lead|Go with the flow~Shared secret|Public display$$)
), expanded as (
  select p.id as pack_id, s.slug, card, ordinality::integer as sort_order
  from source s
  join public.games g on g.slug = 'signal-spectrum'
  join public.game_packs p on p.game_id = g.id and p.slug = s.slug
  cross join lateral unnest(string_to_array(s.cards, '~')) with ordinality as entry(card, ordinality)
), inserted as (
  insert into public.game_content(game_id, pack_id, content_type, payload, sort_order, is_published)
  select g.id, e.pack_id, 'wavelength-spectrum',
    jsonb_build_object(
      'id', e.slug || '-' || lpad(e.sort_order::text, 2, '0'),
      'left', split_part(e.card, '|', 1),
      'right', split_part(e.card, '|', 2),
      'tags', jsonb_build_array(e.slug)
    ), e.sort_order, true
  from expanded e join public.games g on g.slug = 'signal-spectrum'
  returning id, pack_id
)
insert into public.wavelength_question_tags(content_id, pack_id)
select id, pack_id from inserted;

create or replace function public.wavelength_finish_round(
  p_room_id uuid,
  p_round_id uuid,
  p_points integer,
  p_needle integer,
  p_timed_out boolean default false,
  p_timed_out_phase text default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_room public.rooms;
  v_round public.rounds;
  v_game public.wavelength_games;
  v_pack_slug text;
  v_is_final boolean;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  select * into v_round from public.rounds where id = p_round_id and room_id = p_room_id for update;
  select * into v_game from public.wavelength_games where id = v_round.wavelength_game_id for update;
  if not found then raise exception 'game not found'; end if;
  select slug into v_pack_slug from public.game_packs where id = v_game.pack_id;
  v_is_final := v_game.current_round >= v_game.total_rounds;
  update public.rounds set active_score = p_points, intercept_score = 0 where id = v_round.id;
  if v_is_final then
    update public.wavelength_games set status = 'complete', completed_at = now() where id = v_game.id;
  end if;
  update public.rooms
  set group_score = group_score + p_points,
      status = case when v_is_final then 'complete' else 'reveal' end,
      game_state = jsonb_build_object(
        'phase', case when v_is_final then 'complete' when p_timed_out then 'timeout' else 'reveal' end,
        'gameId', v_game.id,
        'packSlug', v_pack_slug,
        'totalRounds', v_game.total_rounds,
        'currentRound', v_game.current_round,
        'roundId', v_round.id,
        'spectrum', v_round.spectrum,
        'target', v_round.target,
        'needle', p_needle,
        'points', p_points,
        'timedOut', p_timed_out,
        'timedOutPhase', p_timed_out_phase,
        'keeperId', v_round.keeper_id
      )
  where id = p_room_id returning * into v_room;
  return to_jsonb(v_room);
end; $$;

drop function if exists public.wavelength_start_round(uuid, jsonb);
create or replace function public.wavelength_start_round(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_room public.rooms;
  v_game public.wavelength_games;
  v_content public.game_content;
  v_previous_keeper uuid;
  v_keeper uuid;
  v_round public.rounds;
  v_pack_slug text;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or not public.is_room_member(p_room_id) or v_room.host_id <> (select auth.uid()) then raise exception 'host required'; end if;
  if v_room.status not in ('lobby', 'reveal') then raise exception 'round already in progress'; end if;
  select * into v_game from public.wavelength_games where room_id = p_room_id and status = 'active' order by created_at desc limit 1 for update;
  if not found or v_game.current_round >= v_game.total_rounds then raise exception 'game is complete'; end if;
  select slug into v_pack_slug from public.game_packs where id = v_game.pack_id and is_published;
  select c.* into v_content
  from public.game_content c
  join public.wavelength_question_tags t on t.content_id = c.id and t.pack_id = v_game.pack_id
  where c.is_published and c.content_type = 'wavelength-spectrum' and not (c.id = any(v_game.used_content_ids))
  order by random() limit 1;
  if not found then raise exception 'not enough unused questions in this pack'; end if;
  select keeper_id into v_previous_keeper from public.rounds where room_id = p_room_id order by created_at desc limit 1;
  if v_previous_keeper is not null then
    select p.user_id into v_keeper from public.room_players p
    where p.room_id = p_room_id and p.joined_at > (select joined_at from public.room_players where room_id = p_room_id and user_id = v_previous_keeper)
    order by p.joined_at limit 1;
  end if;
  if v_keeper is null then select user_id into v_keeper from public.room_players where room_id = p_room_id order by joined_at limit 1; end if;
  if v_keeper is null then raise exception 'at least one player is required'; end if;
  update public.wavelength_games
  set current_round = current_round + 1, used_content_ids = array_append(used_content_ids, v_content.id)
  where id = v_game.id returning * into v_game;
  insert into public.rounds(room_id, keeper_id, spectrum, target, content_id, wavelength_game_id)
  values (p_room_id, v_keeper, v_content.payload - 'id' - 'tags', 12 + floor(random() * 77)::integer, v_content.id, v_game.id)
  returning * into v_round;
  update public.rooms set status = 'clue', game_state = jsonb_build_object(
    'phase', 'clue', 'gameId', v_game.id, 'packSlug', v_pack_slug, 'totalRounds', v_game.total_rounds,
    'currentRound', v_game.current_round, 'roundId', v_round.id, 'keeperId', v_keeper,
    'spectrum', v_round.spectrum, 'deadlineAt', now() + interval '60 seconds'
  ) where id = p_room_id returning * into v_room;
  return to_jsonb(v_room);
end; $$;

create or replace function public.wavelength_start_game(p_room_id uuid, p_pack_slug text, p_total_rounds integer)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_room public.rooms;
  v_pack public.game_packs;
  v_game public.wavelength_games;
  v_available integer;
begin
  if p_total_rounds not between 1 and 20 then raise exception 'invalid round count'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or not public.is_room_member(p_room_id) or v_room.host_id <> (select auth.uid()) then raise exception 'host required'; end if;
  if v_room.status not in ('lobby','reveal','complete') then raise exception 'game already in progress'; end if;
  select p.* into v_pack from public.game_packs p join public.games g on g.id = p.game_id
  where g.slug = 'signal-spectrum' and p.slug = p_pack_slug and p.is_published;
  if not found then raise exception 'pack unavailable'; end if;
  select count(*) into v_available from public.game_content c join public.wavelength_question_tags t on t.content_id = c.id
  where t.pack_id = v_pack.id and c.is_published and c.content_type = 'wavelength-spectrum';
  if v_available < p_total_rounds then raise exception 'not enough questions in this pack'; end if;
  update public.wavelength_games set status = 'complete', completed_at = coalesce(completed_at, now()) where room_id = p_room_id and status = 'active';
  insert into public.wavelength_games(room_id, pack_id, total_rounds) values(p_room_id, v_pack.id, p_total_rounds) returning * into v_game;
  update public.rooms set group_score = 0, status = 'lobby', game_state = jsonb_build_object(
    'phase','setup','gameId',v_game.id,'packSlug',v_pack.slug,'totalRounds',v_game.total_rounds,'currentRound',0
  ) where id = p_room_id;
  return public.wavelength_start_round(p_room_id);
end; $$;

create or replace function public.wavelength_submit_clue(p_room_id uuid, p_clue text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_room public.rooms; v_round public.rounds; v_game public.wavelength_games; v_pack_slug text;
begin
  if char_length(trim(p_clue)) not between 1 and 60 then raise exception 'invalid clue'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'clue' or v_room.game_state ->> 'keeperId' <> (select auth.uid())::text then raise exception 'keeper required'; end if;
  select * into v_round from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if (v_room.game_state ->> 'deadlineAt')::timestamptz <= now() then return public.wavelength_finish_round(p_room_id,v_round.id,0,null,true,'clue'); end if;
  select * into v_game from public.wavelength_games where id = v_round.wavelength_game_id;
  select slug into v_pack_slug from public.game_packs where id = v_game.pack_id;
  update public.rounds set clue = trim(p_clue) where id = v_round.id;
  update public.rooms set status = 'tune', game_state = jsonb_build_object(
    'phase','tune','gameId',v_game.id,'packSlug',v_pack_slug,'totalRounds',v_game.total_rounds,'currentRound',v_game.current_round,
    'roundId',v_round.id,'clue',trim(p_clue),'spectrum',v_round.spectrum,'keeperId',v_round.keeper_id,'deadlineAt',now() + interval '90 seconds'
  ) where id = p_room_id returning * into v_room;
  return to_jsonb(v_room);
end; $$;

create or replace function public.wavelength_submit_tune(p_room_id uuid, p_needle integer)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_room public.rooms; v_round public.rounds; v_game public.wavelength_games; v_pack_slug text;
begin
  if p_needle not between 0 and 100 then raise exception 'invalid needle'; end if;
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'tune' or not public.is_room_member(p_room_id) or v_room.game_state ->> 'keeperId' = (select auth.uid())::text then raise exception 'a non-keeper must lock the dial'; end if;
  select * into v_round from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if v_round.needle is not null then raise exception 'round is not ready to tune'; end if;
  if (v_room.game_state ->> 'deadlineAt')::timestamptz <= now() then return public.wavelength_finish_round(p_room_id,v_round.id,0,null,true,'tune'); end if;
  select * into v_game from public.wavelength_games where id = v_round.wavelength_game_id;
  select slug into v_pack_slug from public.game_packs where id = v_game.pack_id;
  update public.rounds set needle = p_needle where id = v_round.id;
  update public.rooms set status = 'intercept', game_state = jsonb_build_object(
    'phase','reveal_pending','gameId',v_game.id,'packSlug',v_pack_slug,'totalRounds',v_game.total_rounds,'currentRound',v_game.current_round,
    'roundId',v_round.id,'needle',p_needle,'keeperId',v_round.keeper_id,'spectrum',v_round.spectrum
  ) where id = p_room_id returning * into v_room;
  return to_jsonb(v_room);
end; $$;

create or replace function public.wavelength_reveal_round(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_room public.rooms; v_round public.rounds; v_points integer;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.status <> 'intercept' or v_room.game_state ->> 'keeperId' <> (select auth.uid())::text then raise exception 'keeper required'; end if;
  select * into v_round from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  if not found or v_round.needle is null then raise exception 'round incomplete'; end if;
  v_points := case when abs(v_round.needle-v_round.target) <= 5 then 4 when abs(v_round.needle-v_round.target) <= 12 then 3 when abs(v_round.needle-v_round.target) <= 20 then 2 else 0 end;
  return public.wavelength_finish_round(p_room_id,v_round.id,v_points,v_round.needle,false,null);
end; $$;

create or replace function public.wavelength_timeout_phase(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_room public.rooms; v_round public.rounds;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or not public.is_room_member(p_room_id) then raise exception 'room member required'; end if;
  if v_room.status not in ('clue','tune') then return to_jsonb(v_room); end if;
  if (v_room.game_state ->> 'deadlineAt')::timestamptz > now() then raise exception 'phase has not expired'; end if;
  select * into v_round from public.rounds where room_id = p_room_id order by created_at desc limit 1 for update;
  return public.wavelength_finish_round(p_room_id,v_round.id,0,null,true,v_room.status);
end; $$;

drop policy if exists "keeper or revealed round" on public.rounds;
create policy "keeper or finished round" on public.rounds for select to authenticated using (
  exists(select 1 from public.room_players p join public.rooms r on r.id = p.room_id
    where p.room_id = rounds.room_id and p.user_id = (select auth.uid())
      and (r.status in ('reveal','complete') or rounds.keeper_id = (select auth.uid())))
);

drop policy if exists "wavelength preview publisher" on realtime.messages;
drop policy if exists "wavelength preview keeper" on realtime.messages;
create policy "wavelength preview publisher" on realtime.messages for insert to authenticated with check (
  extension = 'broadcast' and realtime.topic() ~ '^wavelength-preview:[0-9a-f-]{36}:[0-9a-f-]{36}:[0-9a-f-]{36}$'
  and (select auth.uid()) = split_part(realtime.topic(), ':', 4)::uuid
  and exists(select 1 from public.rooms r join public.room_players p on p.room_id = r.id
    where r.id = split_part(realtime.topic(), ':', 2)::uuid and p.user_id = (select auth.uid())
      and r.status = 'tune' and r.game_state ->> 'roundId' = split_part(realtime.topic(), ':', 3)
      and r.game_state ->> 'keeperId' <> (select auth.uid())::text)
);
create policy "wavelength preview keeper" on realtime.messages for select to authenticated using (
  extension = 'broadcast' and realtime.topic() ~ '^wavelength-preview:[0-9a-f-]{36}:[0-9a-f-]{36}:[0-9a-f-]{36}$'
  and exists(select 1 from public.rooms r join public.room_players p on p.room_id = r.id
    where r.id = split_part(realtime.topic(), ':', 2)::uuid and p.user_id = split_part(realtime.topic(), ':', 4)::uuid
      and r.status = 'tune' and r.game_state ->> 'roundId' = split_part(realtime.topic(), ':', 3)
      and r.game_state ->> 'keeperId' = (select auth.uid())::text)
);

revoke all on function public.wavelength_finish_round(uuid,uuid,integer,integer,boolean,text) from public, anon, authenticated;
revoke all on function public.wavelength_start_round(uuid), public.wavelength_start_game(uuid,text,integer), public.wavelength_submit_clue(uuid,text), public.wavelength_submit_tune(uuid,integer), public.wavelength_reveal_round(uuid), public.wavelength_timeout_phase(uuid) from public, anon, authenticated;
grant execute on function public.wavelength_start_round(uuid), public.wavelength_start_game(uuid,text,integer), public.wavelength_submit_clue(uuid,text), public.wavelength_submit_tune(uuid,integer), public.wavelength_reveal_round(uuid), public.wavelength_timeout_phase(uuid) to authenticated;
