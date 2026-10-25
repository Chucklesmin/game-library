-- Pass-and-play reads the published CAH deck from Supabase with the public key.
-- Keep anonymous reads limited to published CAH games, packs and card rows.
create policy "published CAH games visible to anonymous"
on public.games for select to anon
using (slug = 'cards-against-humanity' and is_published);

create policy "published CAH packs visible to anonymous"
on public.game_packs for select to anon
using (
  is_published
  and exists (
    select 1 from public.games g
    where g.id = game_packs.game_id
      and g.slug = 'cards-against-humanity'
      and g.is_published
  )
);

create policy "published CAH deck visible to anonymous"
on public.game_content for select to anon
using (
  is_published
  and exists (
    select 1
    from public.games g
    join public.game_packs p on p.game_id = g.id
    where g.id = game_content.game_id
      and p.id = game_content.pack_id
      and g.slug = 'cards-against-humanity'
      and g.is_published
      and p.is_published
      and p.slug in ('original', 'after-hours')
  )
);

grant select on public.games, public.game_packs, public.game_content to anon;
