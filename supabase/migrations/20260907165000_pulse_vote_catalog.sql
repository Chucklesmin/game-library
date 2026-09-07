insert into public.games(slug,name,summary,game_type,ruleset_version,config,is_published)
values ('pulse-vote','Pulse Vote','A fast social prediction game with private votes and a public reveal.','vote-social',1,'{"phases":["prompt","vote","results"]}'::jsonb,true)
on conflict (slug) do update set name=excluded.name,summary=excluded.summary,game_type=excluded.game_type,ruleset_version=excluded.ruleset_version,config=excluded.config,is_published=true;
