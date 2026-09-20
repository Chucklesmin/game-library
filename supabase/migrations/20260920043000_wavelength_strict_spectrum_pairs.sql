-- Remove endpoints that repeat the same meaningful word or one endpoint inside the other.
delete from public.game_content c
where c.content_type = 'wavelength-spectrum'
  and exists (
    select 1
    from jsonb_array_elements_text(coalesce(c.payload->'tags', '[]'::jsonb)) as tag
    where tag is not null
  )
  and (
    lower(trim(c.payload->>'left')) = lower(trim(c.payload->>'right'))
    or lower(trim(c.payload->>'left')) like '%' || lower(trim(c.payload->>'right')) || '%'
    or lower(trim(c.payload->>'right')) like '%' || lower(trim(c.payload->>'left')) || '%'
  );
