create index room_players_user_id_idx on public.room_players(user_id);
create index rooms_host_id_idx on public.rooms(host_id);
create index rounds_keeper_id_idx on public.rounds(keeper_id);
create index rounds_room_id_idx on public.rounds(room_id);
