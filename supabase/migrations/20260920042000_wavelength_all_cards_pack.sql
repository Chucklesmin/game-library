-- Add a selector-backed pack that contains every published Wavelength card.
with game_row as (
  select id from public.games where slug = 'signal-spectrum'
), inserted_pack as (
  insert into public.game_packs(game_id, slug, name, description, is_published, sort_order, metadata)
  select id, 'all', 'All Cards', 'Every published Wavelength card', true, 0, jsonb_build_object('emoji', '✦')
  from game_row
  where not exists (select 1 from public.game_packs p where p.game_id = game_row.id and p.slug = 'all')
  returning id
), all_pack as (
  select id from inserted_pack
  union all
  select p.id from public.game_packs p join game_row g on g.id = p.game_id where p.slug = 'all'
)
insert into public.wavelength_question_tags(content_id, pack_id)
select c.id, a.id
from public.game_content c
cross join all_pack a
where c.content_type = 'wavelength-spectrum'
  and c.is_published
on conflict (content_id, pack_id) do nothing;
